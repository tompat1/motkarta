#!/usr/bin/env python3
"""Metadata-only Google Places enrichment for Motkarta.

This script is deliberately narrow:

1. Discover possible new Stockholm food places and write them to a review queue.
2. Fill missing street/address and website fields for existing places.
3. Fetch official venue imagery from the venue website's og:image metadata.

It must never import Google ratings, review counts, price level, prominence,
ranking, reviews, editorial summaries, or synthetic engagement/value signals.
Google-only new places are not published into the ranked dataset.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import time
import urllib.parse
import urllib.request
from dataclasses import asdict, dataclass
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_PLACES_FILE = ROOT / "public" / "data" / "places.json"
DEFAULT_PHOTOS_FILE = ROOT / "public" / "data" / "place_photos.json"
DEFAULT_CANDIDATES_FILE = ROOT / "outputs" / "google_places_candidates.json"
ENV_FILE = ROOT / ".env"

GOOGLE_TEXT_SEARCH_URL = "https://maps.googleapis.com/maps/api/place/textsearch/json"
GOOGLE_DETAILS_URL = "https://maps.googleapis.com/maps/api/place/details/json"

DEFAULT_QUERIES = [
    "new independent restaurants Stockholm",
    "new cafes Stockholm",
    "new bakeries Stockholm",
    "new coffee shops Stockholm",
]

EXCLUDED_CHAINS = [
    "nespresso",
    "kahls",
    "kahl's",
    "wayne's coffee",
    "waynes coffee",
    "espresso house",
    "starbucks",
    "bonor & blad",
    "bönor & blad",
    "mcdonald",
    "burger king",
    "max hamburgare",
    "subway",
    "joe & the juice",
]

FORBIDDEN_VALUE_FIELDS = {
    "rating",
    "ratingAverage",
    "reliableRatingCount",
    "reviewCount",
    "review_count",
    "user_ratings_total",
    "userRatingsTotal",
    "reviews",
    "price_level",
    "priceLevel",
    "categoryPopularityRaw",
    "localPopularityPercentile",
    "mainstreamExposure",
    "evidence",
    "engagement",
    "specialistGuide",
    "independentEditorial",
    "verifiedUserRating",
    "credibleReviewers",
    "repeatVisits",
    "recentReviews",
    "score",
    "scores",
    "popularity",
    "prominence",
    "editorial_summary",
    "editorialSummary",
    "business_status",
    "businessStatus",
}


@dataclass(frozen=True)
class PlaceMetadata:
    google_place_id: str
    name: str
    address: str = ""
    latitude: float | None = None
    longitude: float | None = None
    website: str = ""
    official_photo: dict[str, str] | None = None


def load_env(path: Path = ENV_FILE) -> None:
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line.strip() or line.lstrip().startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip())


def http_get_json(url: str, params: dict[str, str], timeout: int = 12) -> dict[str, Any]:
    full_url = f"{url}?{urllib.parse.urlencode(params)}"
    request = urllib.request.Request(
        full_url,
        headers={"User-Agent": "Motkarta/1.0 metadata-only Google Places enrichment"},
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def fetch_google_places(api_key: str, queries: list[str]) -> list[dict[str, Any]]:
    if not api_key:
        print("GOOGLE_PLACES_API_KEY not set. No Google data fetched.")
        return []

    seen_place_ids: set[str] = set()
    results: list[dict[str, Any]] = []
    for query in queries:
        try:
            payload = http_get_json(
                GOOGLE_TEXT_SEARCH_URL,
                {
                    "query": query,
                    "location": "59.3293,18.0686",
                    "radius": "12000",
                    "key": api_key,
                },
            )
        except Exception as error:
            print(f"Google Places query failed for {query!r}: {error}")
            continue
        for item in payload.get("results", []):
            place_id = str(item.get("place_id") or "")
            if not place_id or place_id in seen_place_ids:
                continue
            seen_place_ids.add(place_id)
            results.append(item)
    print(f"Fetched {len(results)} candidate Google Places results across {len(queries)} queries.")
    return results


def fetch_place_details(api_key: str, place_id: str) -> dict[str, Any]:
    if not api_key or not place_id:
        return {}
    try:
        payload = http_get_json(
            GOOGLE_DETAILS_URL,
            {
                "place_id": place_id,
                "fields": "place_id,name,formatted_address,geometry,website",
                "key": api_key,
            },
        )
    except Exception as error:
        print(f"Google Places details lookup failed for {place_id}: {error}")
        return {}
    return payload.get("result", {}) if isinstance(payload, dict) else {}


def metadata_from_google_payload(raw_result: dict[str, Any], details: dict[str, Any] | None = None) -> PlaceMetadata:
    """Extract allowed fact fields only.

    This intentionally ignores Google rating, review, price, prominence, and status fields
    even when the upstream API response includes them.
    """
    details = details or {}
    source = {**raw_result, **details}
    geometry = source.get("geometry") or {}
    location = geometry.get("location") or {}
    website = normalize_url(str(source.get("website") or ""))
    official_photo = scrape_website_og_image(website) if website else None
    return PlaceMetadata(
        google_place_id=str(source.get("place_id") or raw_result.get("place_id") or ""),
        name=clean_text(source.get("name") or raw_result.get("name") or ""),
        address=clean_text(source.get("formatted_address") or raw_result.get("formatted_address") or ""),
        latitude=optional_float(location.get("lat")),
        longitude=optional_float(location.get("lng")),
        website=website,
        official_photo=official_photo,
    )


def scrape_website_og_image(url: str) -> dict[str, str] | None:
    """Fetch an official image from the venue website, not from Google review/photo content."""
    if not url:
        return None
    try:
        request = urllib.request.Request(
            url,
            headers={"User-Agent": "Motkarta/1.0 official-site metadata check"},
        )
        with urllib.request.urlopen(request, timeout=8) as response:
            html = response.read().decode("utf-8", errors="ignore")
    except Exception:
        return None

    match = re.search(
        r'<meta[^>]+property=["\']og:image["\'][^>]+content=["\']([^"\']+)["\']',
        html,
        re.IGNORECASE,
    )
    if not match:
        match = re.search(
            r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+property=["\']og:image["\']',
            html,
            re.IGNORECASE,
        )
    if not match:
        return None

    image_url = urllib.parse.urljoin(url, match.group(1))
    if not image_url.startswith(("http://", "https://")):
        return None
    return {
        "url": image_url,
        "thumbnailUrl": image_url,
        "caption": "Official website image",
        "credit": f"{urllib.parse.urlparse(url).netloc} / official website",
    }


def load_places(path: Path) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    places = payload.get("places", []) if isinstance(payload, dict) else payload
    if not isinstance(places, list):
        raise ValueError(f"{path} does not contain a places list.")
    return payload if isinstance(payload, dict) else {"places": places}, places


def load_photos(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {
            "updatedAt": "",
            "totalPlaces": 0,
            "totalPhotos": 0,
            "photosByPlace": {},
        }
    payload = json.loads(path.read_text(encoding="utf-8"))
    payload.setdefault("photosByPlace", {})
    return payload


def save_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def find_existing_place(places: list[dict[str, Any]], metadata: PlaceMetadata) -> dict[str, Any] | None:
    metadata_name = normalized_name(metadata.name)
    if not metadata_name:
        return None

    exact = [place for place in places if normalized_name(place.get("name")) == metadata_name]
    if exact:
        return exact[0]

    best: tuple[float, dict[str, Any]] | None = None
    for place in places:
        place_name = normalized_name(place.get("name"))
        if not place_name:
            continue
        similarity = SequenceMatcher(None, metadata_name, place_name).ratio()
        distance = distance_meters(
            metadata.latitude,
            metadata.longitude,
            optional_float(place.get("latitude")),
            optional_float(place.get("longitude")),
        )
        if distance is not None and distance <= 90 and similarity >= 0.88:
            score = similarity + max(0, (90 - distance) / 90) * 0.05
            if best is None or score > best[0]:
                best = (score, place)
    return best[1] if best else None


def apply_metadata_to_existing_place(
    place: dict[str, Any],
    metadata: PlaceMetadata,
    photos_by_place: dict[str, Any],
) -> list[str]:
    """Fill only missing neutral metadata. Never alter value/ranking fields."""
    changes: list[str] = []

    if metadata.address and not has_street_info(place):
        place["address"] = metadata.address
        changes.append("address")

    if metadata.website and not clean_text(place.get("website")):
        place["website"] = metadata.website
        changes.append("website")

    place_id = str(place.get("id") or "")
    if metadata.official_photo and place_id and not photos_by_place.get(place_id):
        photo = {
            "id": f"official-site-photo-{place_id}",
            "placeId": place.get("id"),
            **metadata.official_photo,
        }
        photos_by_place[place_id] = [photo]
        changes.append("official_photo")

    return changes


def build_candidate_record(metadata: PlaceMetadata) -> dict[str, Any]:
    record = {
        "status": "needs_review",
        "source": "Google Places metadata-only discovery",
        "googlePlaceId": metadata.google_place_id,
        "name": metadata.name,
        "address": metadata.address,
        "latitude": metadata.latitude,
        "longitude": metadata.longitude,
        "website": metadata.website,
        "officialPhoto": metadata.official_photo,
        "discoveredAt": iso_now(),
        "allowedUse": "Candidate discovery and neutral metadata enrichment only; do not use for scoring.",
    }
    assert_no_forbidden_value_fields(record)
    return record


def assert_no_forbidden_value_fields(payload: Any) -> None:
    found = forbidden_value_fields(payload)
    if found:
        raise ValueError(f"Google metadata payload contains forbidden value fields: {', '.join(sorted(found))}")


def forbidden_value_fields(payload: Any) -> set[str]:
    found: set[str] = set()
    if isinstance(payload, dict):
        for key, value in payload.items():
            if key in FORBIDDEN_VALUE_FIELDS:
                found.add(key)
            found.update(forbidden_value_fields(value))
    elif isinstance(payload, list):
        for item in payload:
            found.update(forbidden_value_fields(item))
    return found


def existing_candidate_keys(path: Path) -> set[str]:
    if not path.exists():
        return set()
    payload = json.loads(path.read_text(encoding="utf-8"))
    candidates = payload.get("candidates", []) if isinstance(payload, dict) else []
    keys = set()
    for candidate in candidates:
        keys.add(str(candidate.get("googlePlaceId") or ""))
        keys.add(f"{normalized_name(candidate.get('name'))}:{clean_text(candidate.get('address')).lower()}")
    return {key for key in keys if key}


def merge_candidates(path: Path, new_candidates: list[dict[str, Any]]) -> dict[str, Any]:
    existing: list[dict[str, Any]] = []
    if path.exists():
        payload = json.loads(path.read_text(encoding="utf-8"))
        existing = payload.get("candidates", []) if isinstance(payload, dict) else []

    seen = existing_candidate_keys(path)
    merged = list(existing)
    for candidate in new_candidates:
        keys = {
            str(candidate.get("googlePlaceId") or ""),
            f"{normalized_name(candidate.get('name'))}:{clean_text(candidate.get('address')).lower()}",
        }
        if any(key and key in seen for key in keys):
            continue
        merged.append(candidate)
        seen.update(key for key in keys if key)

    return {
        "updatedAt": iso_now(),
        "policy": "Google Places metadata-only candidates. No rating, review, price, prominence, or scoring fields.",
        "candidates": merged,
    }


def sync_metadata(
    api_key: str,
    places_path: Path = DEFAULT_PLACES_FILE,
    photos_path: Path = DEFAULT_PHOTOS_FILE,
    candidates_path: Path = DEFAULT_CANDIDATES_FILE,
    queries: list[str] | None = None,
    dry_run: bool = False,
) -> dict[str, int]:
    places_payload, places = load_places(places_path)
    photos_payload = load_photos(photos_path)
    photos_by_place = photos_payload.setdefault("photosByPlace", {})

    new_candidates: list[dict[str, Any]] = []
    stats = {
        "google_results": 0,
        "existing_places_enriched": 0,
        "address_updates": 0,
        "website_updates": 0,
        "official_photo_updates": 0,
        "new_candidates": 0,
        "chains_skipped": 0,
    }

    for raw_result in fetch_google_places(api_key, queries or DEFAULT_QUERIES):
        stats["google_results"] += 1
        if is_excluded_chain(raw_result.get("name")):
            stats["chains_skipped"] += 1
            continue

        details = fetch_place_details(api_key, str(raw_result.get("place_id") or ""))
        metadata = metadata_from_google_payload(raw_result, details)
        if not metadata.name or not metadata.google_place_id:
            continue
        assert_no_forbidden_value_fields(asdict(metadata))

        existing = find_existing_place(places, metadata)
        if existing is not None:
            changes = apply_metadata_to_existing_place(existing, metadata, photos_by_place)
            if changes:
                stats["existing_places_enriched"] += 1
                stats["address_updates"] += int("address" in changes)
                stats["website_updates"] += int("website" in changes)
                stats["official_photo_updates"] += int("official_photo" in changes)
        else:
            new_candidates.append(build_candidate_record(metadata))

    candidates_payload = merge_candidates(candidates_path, new_candidates)
    stats["new_candidates"] = len(new_candidates)

    photos_payload["updatedAt"] = iso_now()
    photos_payload["totalPlaces"] = len(places)
    photos_payload["totalPhotos"] = sum(len(items) for items in photos_by_place.values())
    places_payload["places"] = places

    if not dry_run:
        save_json(places_path, places_payload)
        save_json(photos_path, photos_payload)
        save_json(candidates_path, candidates_payload)

    return stats


def is_excluded_chain(name: object) -> bool:
    normalized = clean_text(name).lower()
    return any(chain in normalized for chain in EXCLUDED_CHAINS)


def has_street_info(place: dict[str, Any]) -> bool:
    if clean_text(place.get("address")):
        return True
    note = clean_text(place.get("note"))
    return "address:" in note.lower() or "adress:" in note.lower()


def clean_text(value: object) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def normalize_url(value: str) -> str:
    value = clean_text(value)
    if not value:
        return ""
    if value.startswith(("http://", "https://")):
        return value
    return f"https://{value}"


def normalized_name(value: object) -> str:
    text = clean_text(value).lower()
    return re.sub(r"[^a-z0-9åäöé]+", "", text)


def optional_float(value: object) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def distance_meters(
    lat_a: float | None,
    lon_a: float | None,
    lat_b: float | None,
    lon_b: float | None,
) -> float | None:
    if None in (lat_a, lon_a, lat_b, lon_b):
        return None
    from math import asin, cos, radians, sin, sqrt

    earth_radius_m = 6_371_000
    lat1 = radians(float(lat_a))
    lon1 = radians(float(lon_a))
    lat2 = radians(float(lat_b))
    lon2 = radians(float(lon_b))
    delta_lat = lat2 - lat1
    delta_lon = lon2 - lon1
    haversine = sin(delta_lat / 2) ** 2 + cos(lat1) * cos(lat2) * sin(delta_lon / 2) ** 2
    return 2 * earth_radius_m * asin(sqrt(haversine))


def iso_now() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--places", type=Path, default=DEFAULT_PLACES_FILE)
    parser.add_argument("--photos", type=Path, default=DEFAULT_PHOTOS_FILE)
    parser.add_argument("--candidates", type=Path, default=DEFAULT_CANDIDATES_FILE)
    parser.add_argument("--query", action="append", dest="queries", help="Google text-search query. Repeatable.")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    load_env()
    stats = sync_metadata(
        api_key=os.environ.get("GOOGLE_PLACES_API_KEY", ""),
        places_path=args.places,
        photos_path=args.photos,
        candidates_path=args.candidates,
        queries=args.queries,
        dry_run=args.dry_run,
    )

    print("Metadata-only Google sync complete:")
    for key, value in stats.items():
        print(f"- {key}: {value}")


if __name__ == "__main__":
    main()
