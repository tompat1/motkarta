#!/usr/bin/env python3
"""Merge neutral curated open-source place records into the public dataset.

Curated sources are allowed to add or enrich places, but they are not allowed to
bring ratings, review counts, Google popularity, price levels, or synthetic
engagement into production.
"""

from __future__ import annotations

import argparse
import json
import re
import zlib
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DATA_FILE = ROOT / "public" / "data" / "places.json"
DEFAULT_CURATED_FILE = ROOT / "data" / "curated_open_places.json"

ALLOWED_SOURCE_NAMES = {
    "anders husa & kaitlin orr guide",
    "openstreetmap",
    "openstreetmap contributors",
    "specialty coffee sweden registry",
    "stockholms stad livsmedelskontroll",
    "visit stockholm (officiella stadsguiden)",
    "white guide nordic",
}

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
    "categoryMeanRating",
    "categoryPopularityRaw",
    "localPopularityPercentile",
    "score",
    "scores",
    "popularity",
    "prominence",
    "editorial_summary",
    "editorialSummary",
}

NEUTRAL_VALUE_FIELDS = {
    "ratingAverage": 0,
    "reliableRatingCount": 0,
    "reviewCount": 0,
    "categoryMeanRating": 0,
    "categoryPopularityRaw": 0,
    "localPopularityPercentile": 0,
    "priceLevel": 0,
}

NEUTRAL_ENGAGEMENT = {
    "searchImpressions": 0,
    "profileViews": 0,
    "mapMarkerClicks": 0,
    "saves": 0,
    "directionRequests": 0,
    "confirmedVisits": 0,
    "repeatVisits": 0,
    "recommendations": 0,
    "recentSaves": 0,
}

DEFAULT_EVIDENCE = {
    "specialistGuide": 0,
    "independentEditorial": 1,
    "verifiedUserRating": 0,
    "repeatVisits": 0,
    "recentReviews": 0,
    "credibleReviewers": 0,
    "inspectionStatus": 0,
    "verifiedAttributes": 30,
    "dataFreshness": 80,
    "confidence": "Medium",
}


def sync_curated_sources(
    data_file: Path = DEFAULT_DATA_FILE,
    curated_file: Path = DEFAULT_CURATED_FILE,
    quiet: bool = False,
) -> dict[str, int]:
    if not data_file.exists():
        raise FileNotFoundError(f"{data_file} not found")
    if not curated_file.exists():
        raise FileNotFoundError(f"{curated_file} not found")

    payload = json.loads(data_file.read_text(encoding="utf-8"))
    places = payload.get("places", []) if isinstance(payload, dict) else payload
    if not isinstance(places, list):
        raise ValueError(f"{data_file} does not contain a places list.")

    curated_payload = json.loads(curated_file.read_text(encoding="utf-8"))
    curated_places = curated_payload.get("places", curated_payload)
    if not isinstance(curated_places, list):
        raise ValueError(f"{curated_file} must contain a places array.")

    existing = {place_key(place) for place in places}
    added = 0
    updated = 0

    for record in curated_places:
        assert_no_forbidden_value_fields(record)
        place = neutral_place(record)
        key = place_key(place)
        if key in existing:
            for index, existing_place in enumerate(places):
                if place_key(existing_place) == key:
                    places[index] = merge_existing_place(existing_place, place)
                    updated += 1
                    break
            continue

        places.insert(0, place)
        existing.add(key)
        added += 1
        if not quiet:
            print(f"Synced curated open-source place: {place['name']} ({place['sourceName']})")

    payload["places"] = places
    payload["source"] = "osm_curated_open_sources"
    payload["totalPlaces"] = len(places)
    data_file.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    if not quiet:
        print(f"Curated source sync complete: {added} added, {updated} updated, {len(places)} total places.")
    return {"added": added, "updated": updated, "total": len(places)}


def neutral_place(record: dict[str, Any]) -> dict[str, Any]:
    source_name = clean_text(record.get("sourceName"))
    if normalized_source(source_name) not in ALLOWED_SOURCE_NAMES:
        raise ValueError(f"Unsupported curated source: {source_name}")

    latitude = optional_float(record.get("latitude"))
    longitude = optional_float(record.get("longitude"))
    place = {
        "id": int(record.get("id") or stable_numeric_id(record)),
        "name": clean_text(record.get("name")),
        "kind": clean_text(record.get("kind") or "Restaurant"),
        "cuisine": clean_text(record.get("cuisine")),
        "area": clean_text(record.get("area") or "Stockholm"),
        "address": clean_text(record.get("address")),
        "note": clean_text(record.get("note")),
        "tags": [clean_text(tag) for tag in record.get("tags", []) if clean_text(tag)],
        "sourceName": source_name,
        "sourceUrl": clean_text(record.get("sourceUrl")),
        "lastUpdated": clean_text(record.get("lastUpdated")),
        "evidenceLabel": clean_text(record.get("evidenceLabel") or source_name),
        "mainstreamExposure": optional_number(record.get("mainstreamExposure"), 55),
        "ageDays": optional_number(record.get("ageDays"), 0),
        "daysSinceFreshEvidence": optional_number(record.get("daysSinceFreshEvidence"), 90),
        "lifecycleState": clean_text(record.get("lifecycleState") or record.get("state") or "verified"),
        "evidence": {
            **DEFAULT_EVIDENCE,
            **{key: value for key, value in record.get("evidence", {}).items() if key in DEFAULT_EVIDENCE},
        },
        "engagement": NEUTRAL_ENGAGEMENT.copy(),
        "latitude": latitude,
        "longitude": longitude,
        "x": optional_number(record.get("x"), coordinate_to_map_position(longitude, 17.75, 18.25)),
        "y": optional_number(record.get("y"), 100 - coordinate_to_map_position(latitude, 59.2, 59.47)),
    }
    if record.get("website"):
        place["website"] = clean_text(record.get("website"))
    place.update(NEUTRAL_VALUE_FIELDS)
    return drop_empty(place)


def merge_existing_place(existing: dict[str, Any], curated: dict[str, Any]) -> dict[str, Any]:
    merged = {**existing}
    for key in ["sourceName", "sourceUrl", "evidenceLabel", "lastUpdated", "lifecycleState", "website"]:
        if curated.get(key):
            merged[key] = curated[key]
    for key in ["note", "address", "cuisine", "area", "kind"]:
        if curated.get(key) and not merged.get(key):
            merged[key] = curated[key]

    merged["tags"] = sorted(set([*existing.get("tags", []), *curated.get("tags", [])]))
    merged["evidence"] = {**existing.get("evidence", {}), **curated.get("evidence", {})}
    merged["engagement"] = NEUTRAL_ENGAGEMENT.copy()
    merged.update(NEUTRAL_VALUE_FIELDS)
    return merged


def assert_no_forbidden_value_fields(payload: Any) -> None:
    found = forbidden_value_fields(payload)
    if found:
        raise ValueError(f"Curated source data contains forbidden value fields: {', '.join(sorted(found))}")


def forbidden_value_fields(payload: Any, path: tuple[str, ...] = ()) -> set[str]:
    found: set[str] = set()
    if isinstance(payload, dict):
        for key, value in payload.items():
            if key in FORBIDDEN_VALUE_FIELDS:
                found.add(".".join((*path, key)))
            found.update(forbidden_value_fields(value, (*path, key)))
    elif isinstance(payload, list):
        for index, item in enumerate(payload):
            found.update(forbidden_value_fields(item, (*path, str(index))))
    return found


def place_key(place: dict[str, Any]) -> str:
    return f"{normalized_name(place.get('name'))}:{normalized_name(place.get('address') or place.get('area'))}"


def stable_numeric_id(record: dict[str, Any]) -> int:
    source_id = clean_text(record.get("sourceId"))
    key = source_id or f"{record.get('sourceName')}:{record.get('name')}:{record.get('address')}"
    return zlib.crc32(key.encode("utf-8"))


def coordinate_to_map_position(value: float | None, min_value: float, max_value: float) -> float:
    if value is None:
        return 50
    return round(min(92, max(8, ((value - min_value) / (max_value - min_value)) * 100)), 2)


def optional_float(value: Any) -> float | None:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return None
    return parsed if parsed == parsed else None


def optional_number(value: Any, default: float | int) -> float | int:
    parsed = optional_float(value)
    if parsed is None:
        return default
    return int(parsed) if float(parsed).is_integer() else parsed


def drop_empty(record: dict[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in record.items() if value not in ("", None, [], {})}


def clean_text(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def normalized_name(value: Any) -> str:
    return re.sub(r"[^a-z0-9åäöé]+", "", clean_text(value).lower())


def normalized_source(value: Any) -> str:
    return clean_text(value).lower()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-file", type=Path, default=DEFAULT_DATA_FILE)
    parser.add_argument("--curated-file", type=Path, default=DEFAULT_CURATED_FILE)
    args = parser.parse_args()
    sync_curated_sources(args.data_file, args.curated_file)


if __name__ == "__main__":
    main()
