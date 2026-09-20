#!/usr/bin/env python3
"""
fetch_place_photos.py - Automated Image Search & Scraper for Motkarta Places

Discovers, validates, and builds a comprehensive image dataset for places in Stockholm
using official venue websites and curated city media sources.
"""

import json
import os
import re
import time
from html.parser import HTMLParser
from pathlib import Path
import urllib.request
import urllib.parse
from concurrent.futures import ThreadPoolExecutor, as_completed

try:
    import requests
except ImportError:
    requests = None

PLACES_FILE = os.path.join(os.path.dirname(__file__), "..", "public", "data", "places.json")
OUTPUT_JSON_FILE = os.path.join(os.path.dirname(__file__), "..", "public", "data", "place_photos.json")
OUTPUT_SQL_FILE = os.path.join(os.path.dirname(__file__), "..", "drizzle", "seed-photos.sql")

HEADERS = {
    "User-Agent": "MotkartaFoodMap/1.0 (Stockholm Independent Food Map; contact@motkarta.se)"
}

DISALLOWED_IMAGE_DOMAINS = (
    "instagram.com", "cdninstagram.com", "facebook.com", "fbcdn.net",
    "gettyimages.com", "istockphoto.com", "shutterstock.com", "unsplash.com",
    "wikimedia.org", "wikipedia.org",
)
ASSET_NAME_PATTERN = re.compile(r"(?:^|[\W_])(logos?|loggo|favicon|icons?|pixel|placeholder|tracking)(?:$|[\W_])", re.I)


def is_disallowed_image_url(url: str) -> bool:
    parsed = urllib.parse.urlparse(url)
    host = (parsed.hostname or "").lower()
    if parsed.scheme not in ("http", "https") or not host:
        return True
    if any(host == domain or host.endswith("." + domain) for domain in DISALLOWED_IMAGE_DOMAINS):
        return True
    asset = urllib.parse.unquote(parsed.path + "?" + parsed.query)
    return bool(ASSET_NAME_PATTERN.search(asset))


class WebsiteImages(HTMLParser):
    """Parse metadata and lazy/responsive images without depending on attribute order."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.metadata = []
        self.images = []

    def handle_starttag(self, tag, attrs):
        attributes = dict(attrs)
        if tag == "meta" and (attributes.get("property") or attributes.get("name") or "").lower() in ("og:image", "og:image:secure_url", "twitter:image"):
            self.metadata.append(attributes.get("content") or "")
        if tag in ("img", "source"):
            # Prefer the largest responsive candidate over a small placeholder src.
            srcset = attributes.get("data-srcset") or attributes.get("srcset") or ""
            candidates = []
            for entry in srcset.split(","):
                parts = entry.strip().split()
                if parts:
                    descriptor = parts[1][:-1] if len(parts) > 1 else "1"
                    try:
                        size = float(descriptor)
                    except ValueError:
                        size = 1
                    candidates.append((size, parts[0]))
            if candidates:
                self.images.append(max(candidates)[1])
            else:
                self.images.append(attributes.get("data-src") or attributes.get("data-lazy-src") or attributes.get("src") or "")


def http_get_text(url: str, headers: dict = HEADERS, timeout: int = 5) -> str | None:
    if requests is not None:
        try:
            res = requests.get(url, headers=headers, timeout=timeout)
            if res.status_code == 200:
                return res.text
        except Exception:
            return None
        return None
    try:
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            if resp.status == 200:
                return resp.read().decode("utf-8", errors="ignore")
    except Exception:
        return None
    return None


def image_asset_key(url: str) -> str:
    """Collapse common resize variants while preserving image identifiers."""
    parsed = urllib.parse.urlparse(url)
    query = urllib.parse.parse_qsl(parsed.query)
    nested = dict(query).get("url")
    if nested:
        return urllib.parse.urljoin(url, nested)
    path = re.sub(r"-\d+x\d+(?=\.[a-zA-Z]+$)", "", parsed.path)
    query = [(key, value) for key, value in query if key.lower() not in ("w", "h", "q", "width", "height", "quality", "resize")]
    return urllib.parse.urlunparse((parsed.scheme, parsed.netloc, path, "", urllib.parse.urlencode(query), ""))


def scrape_place_website_photos(website_url: str, place_name: str, limit: int = 3) -> list[dict]:
    """Extract candidates from the venue's official site; validate before publishing."""
    if not website_url or urllib.parse.urlparse(website_url).scheme not in ("http", "https"):
        return []
    html = http_get_text(website_url, headers=HEADERS, timeout=5)
    if not html:
        return []
    parser = WebsiteImages()
    parser.feed(html)
    domain = urllib.parse.urlparse(website_url).netloc
    seen = set()
    photos = []
    for source in parser.metadata + parser.images:
        if not source.strip():
            continue
        url = urllib.parse.urljoin(website_url, source.strip())
        asset_key = image_asset_key(url)
        if asset_key in seen or is_disallowed_image_url(url):
            continue
        seen.add(asset_key)
        photos.append({
            "url": url, "thumbnailUrl": url,
            "caption": f"{place_name} ({domain})",
            "credit": f"Official Website ({domain})",
        })
        if len(photos) >= limit:
            break
    return photos


def merge_place_photos(existing: list[dict], incoming: list[dict]) -> list[dict]:
    """Keep previous photos on failed/partial scrapes and merge only new URLs."""
    photos = list(existing)
    urls = {photo["url"] for photo in existing}
    ids = {photo.get("id") for photo in existing}
    for photo in incoming:
        if photo["url"] in urls:
            continue
        photo = dict(photo)
        suffix = len(photos) + 1
        while photo.get("id") in ids:
            photo["id"] = f"photo-{photo['placeId']}-{suffix}"
            suffix += 1
        photos.append(photo)
        ids.add(photo.get("id"))
        urls.add(photo["url"])
    return photos

def fetch_photos_for_place(place: dict) -> tuple:
    place_id = place.get("id")
    name = place.get("name", "")
    area = place.get("area", "Stockholm")
    website = place.get("website")

    photos = []

    # Priority 1: Scrape real official website photos
    if website:
        site_photos = scrape_place_website_photos(website, name, limit=3)
        photos.extend(site_photos)

    # Format photo entries with unique IDs
    formatted = []
    for idx, p in enumerate(photos[:3]):
        formatted.append({
            "id": f"photo-{place_id}-{idx + 1}",
            "placeId": place_id,
            "url": p["url"],
            "thumbnailUrl": p.get("thumbnailUrl") or p["url"],
            "caption": p.get("caption") or f"{name} ({area})",
            "credit": p.get("credit") or "Official Website",
            "width": p.get("width"),
            "height": p.get("height"),
        })

    return place_id, formatted


def fetch_validated_photos_for_place(place: dict) -> tuple:
    # Reuse the pipeline's HTTP checker; do not treat extracted URLs as verified.
    try:
        from .verify_and_clean_photos import is_url_alive
    except ImportError:
        from verify_and_clean_photos import is_url_alive
    place_id, photos = fetch_photos_for_place(place)
    return place_id, [photo for photo in photos if is_url_alive(photo["url"])]


def main():
    import argparse
    parser = argparse.ArgumentParser(description="Scrape official venue website images for Motkarta places.")
    parser.add_argument("--workers", type=int, default=20, help="Number of concurrent worker threads")
    parser.add_argument("--limit", type=int, default=None, help="Limit eligible places; preserves all existing photos")
    parser.add_argument("--validate", action="store_true", help="HTTP-check newly discovered images before merging")
    parser.add_argument("--only-missing", action="store_true", help="Only scrape venues without existing photos")
    parser.add_argument("--places-file", default=PLACES_FILE)
    parser.add_argument("--existing-json", default=OUTPUT_JSON_FILE)
    parser.add_argument("--output-json", default=OUTPUT_JSON_FILE)
    parser.add_argument("--output-sql", default=OUTPUT_SQL_FILE)
    args = parser.parse_args()

    print("🚀 Starting Motkarta Real Venue Image Scraper...", flush=True)

    if args.workers < 1 or (args.limit is not None and args.limit < 1):
        parser.error("workers and limit must be positive")
    with open(args.places_file, encoding="utf-8") as f:
        data = json.load(f)
    catalog = data.get("places", []) if isinstance(data, dict) else data
    existing_path = Path(args.existing_json)
    photos_by_place = json.loads(existing_path.read_text(encoding="utf-8")).get("photosByPlace", {}) if existing_path.exists() else {}
    places = [place for place in catalog if place.get("website") and
              (not args.only_missing or not photos_by_place.get(str(place["id"]))) ]
    if args.limit:
        places = places[:args.limit]
    print(f"📦 Scraping {len(places)} eligible places; preserving {len(photos_by_place)} existing photo entries", flush=True)
    added_photos = 0

    max_workers = args.workers
    print(f"🌐 Scraping real website images concurrently across {max_workers} threads...", flush=True)

    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        fetch_photos = fetch_validated_photos_for_place if args.validate else fetch_photos_for_place
        futures = [executor.submit(fetch_photos, place) for place in places]
        for idx, future in enumerate(as_completed(futures), 1):
            try:
                place_id, place_photos = future.result()
                if place_photos:
                    previous = photos_by_place.get(str(place_id), [])
                    merged = merge_place_photos(previous, place_photos)
                    photos_by_place[str(place_id)] = merged
                    added_photos += len(merged) - len(previous)
                if idx % 100 == 0 or idx == len(places):
                    print(f"  Processed {idx}/{len(places)} places ({added_photos} new photo candidates)", flush=True)
            except Exception as e:
                print(f"⚠️ Error processing place: {e}", flush=True)

    total_photos = sum(len(photos) for photos in photos_by_place.values())
    matched_places = sum(bool(photos_by_place.get(str(place["id"]))) for place in catalog)
    # URL extraction is not HTTP or visual verification.
    # Construct final dataset payload
    output_payload = {
        "updatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "totalPlaces": len(catalog),
        "photoPlaces": matched_places,
        "verificationStatus": "new-candidates-http-checked" if args.validate else "pending",
        "addedPhotoCandidates": added_photos,
        "totalPhotos": total_photos,
        "photosByPlace": photos_by_place,
    }

    # Ensure output directory exists
    Path(args.output_json).parent.mkdir(parents=True, exist_ok=True)
    with open(args.output_json, "w", encoding="utf-8") as f:
        json.dump(output_payload, f, ensure_ascii=False, indent=2)

    print(f"✅ Saved place photos dataset to: {args.output_json} ({total_photos} photos across {len(photos_by_place)} places)", flush=True)

    # Generate SQL seed file for D1 database
    Path(args.output_sql).parent.mkdir(parents=True, exist_ok=True)
    with open(args.output_sql, "w", encoding="utf-8") as f:
        f.write("-- Auto-generated D1 place_photos seed file\n")
        f.write("-- Additive upserts: review and validate candidates before applying.\n\n")
        for place_id_str, photo_list in photos_by_place.items():
            for index, p in enumerate(photo_list, 1):
                sql_id = str(p.get("id") or f"photo-{place_id_str}-{index}").replace("'", "''")
                sql_place_id = int(place_id_str)
                sql_url = p["url"].replace("'", "''")
                sql_thumb = (p.get("thumbnailUrl") or p["url"]).replace("'", "''")
                sql_cap = p.get("caption", "").replace("'", "''")
                sql_credit = p.get("credit", "").replace("'", "''")
                f.write(
                    f"INSERT OR REPLACE INTO place_photos (id, place_id, url, thumbnail_url, caption, credit) "
                    f"VALUES ('{sql_id}', {sql_place_id}, '{sql_url}', '{sql_thumb}', '{sql_cap}', '{sql_credit}');\n"
                )

    print(f"✅ Generated SQL seed file: {args.output_sql}", flush=True)


if __name__ == "__main__":
    main()
