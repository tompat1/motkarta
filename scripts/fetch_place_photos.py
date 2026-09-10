#!/usr/bin/env python3
"""
fetch_place_photos.py - Automated Image Search & Scraper for Motkarta Places

Discovers, validates, and builds a comprehensive image dataset for places in Stockholm
using official venue websites and curated city media sources.
"""

import json
import os
import re
import sys
import time
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

DISALLOWED_IMAGE_URL_PARTS = [
    "cdninstagram",
    "facebook.com",
    "favicon",
    "fbcdn.net",
    "gettyimages",
    "icon",
    "instagram",
    "istockphoto",
    "pixel",
    "placeholder",
    "shutterstock",
    "stock",
    "tracking",
    "unsplash",
    "wikimedia",
    "wikipedia",
]


def is_disallowed_image_url(url: str) -> bool:
    normalized = url.lower()
    return any(part in normalized for part in DISALLOWED_IMAGE_URL_PARTS)


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


def scrape_place_website_photos(website_url: str, place_name: str, limit: int = 3) -> list[dict]:
    """Scrape real venue photos directly from the place's official website."""
    photos = []
    if not website_url or not website_url.startswith("http"):
        return photos

    try:
        domain = urllib.parse.urlparse(website_url).netloc
        html = http_get_text(website_url, headers=HEADERS, timeout=5)
        if not html:
            return photos

        # 1. OpenGraph / Twitter meta image tags
        og_matches = re.findall(r'<meta[^>]+property=["\']og:image["\'][^>]+content=["\']([^"\']+)["\']', html, re.I)
        og_matches += re.findall(r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+property=["\']og:image["\']', html, re.I)
        og_matches += re.findall(r'<meta[^>]+name=["\']twitter:image["\'][^>]+content=["\']([^"\']+)["\']', html, re.I)

        seen_urls = set()
        for img_src in og_matches:
            full_url = urllib.parse.urljoin(website_url, img_src)
            if full_url not in seen_urls and not is_disallowed_image_url(full_url):
                seen_urls.add(full_url)
                photos.append({
                    "url": full_url,
                    "thumbnailUrl": full_url,
                    "caption": f"{place_name} (Officiell bild)",
                    "credit": f"Official Website ({domain})",
                })
                if len(photos) >= limit:
                    return photos

        # 2. Hero <img> tags
        img_tags = re.findall(r'<img[^>]+src=["\']([^"\']+\.(?:jpg|jpeg|png|webp))["\']', html, re.I)
        for img_src in img_tags:
            full_url = urllib.parse.urljoin(website_url, img_src)
            if full_url not in seen_urls and not is_disallowed_image_url(full_url):
                seen_urls.add(full_url)
                photos.append({
                    "url": full_url,
                    "thumbnailUrl": full_url,
                    "caption": f"{place_name} ({domain})",
                    "credit": f"Official Website ({domain})",
                })
                if len(photos) >= limit:
                    break
    except Exception:
        pass

    return photos


def search_visit_stockholm_photos(place_name: str, limit: int = 2) -> list[dict]:
    """Search Visit Stockholm official city portal for venue photos."""
    photos = []
    try:
        query = urllib.parse.quote(f"{place_name} Stockholm")
        url = f"https://www.visitstockholm.com/api/v1/search/?q={query}"
        raw_text = http_get_text(url, headers=HEADERS, timeout=5)
        if raw_text:
            data = json.loads(raw_text)
            results = data.get("results", [])
            for r in results[:limit]:
                img_url = r.get("image") or r.get("hero_image")
                if img_url and not is_disallowed_image_url(img_url):
                    photos.append({
                        "url": img_url,
                        "thumbnailUrl": img_url,
                        "caption": f"{place_name} (Visit Stockholm)",
                        "credit": "Visit Stockholm / Official City Portal",
                    })
    except Exception:
        pass
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


def main():
    import argparse
    parser = argparse.ArgumentParser(description="Scrape official venue website images for Motkarta places.")
    parser.add_argument("--workers", type=int, default=20, help="Number of concurrent worker threads")
    parser.add_argument("--limit", type=int, default=None, help="Limit number of places to process (for testing)")
    args = parser.parse_args()

    print("🚀 Starting Motkarta Real Venue Image Scraper...", flush=True)

    if not os.path.exists(PLACES_FILE):
        print(f"❌ Places file not found: {PLACES_FILE}", flush=True)
        sys.exit(1)

    with open(PLACES_FILE, "r", encoding="utf-8") as f:
        data = json.load(f)

    places = data.get("places", []) if isinstance(data, dict) else data
    if args.limit:
        places = places[:args.limit]
    print(f"📦 Loaded {len(places)} places from places.json", flush=True)

    photos_by_place = {}
    total_photos = 0

    max_workers = args.workers
    print(f"🌐 Scraping real website images concurrently across {max_workers} threads...", flush=True)

    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = [executor.submit(fetch_photos_for_place, place) for place in places]
        for idx, future in enumerate(as_completed(futures), 1):
            try:
                place_id, place_photos = future.result()
                if place_photos:
                    photos_by_place[str(place_id)] = place_photos
                    total_photos += len(place_photos)
                if idx % 100 == 0 or idx == len(places):
                    print(f"  Processed {idx}/{len(places)} places ({total_photos} real photos acquired across {len(photos_by_place)} venues)", flush=True)
            except Exception as e:
                print(f"⚠️ Error processing place: {e}", flush=True)

    # Construct final dataset payload
    output_payload = {
        "updatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "totalPlaces": len(places),
        "verifiedPhotoPlaces": len(photos_by_place),
        "totalPhotos": total_photos,
        "photosByPlace": photos_by_place,
    }

    # Ensure output directory exists
    os.makedirs(os.path.dirname(OUTPUT_JSON_FILE), exist_ok=True)
    with open(OUTPUT_JSON_FILE, "w", encoding="utf-8") as f:
        json.dump(output_payload, f, ensure_ascii=False, indent=2)

    print(f"✅ Saved place photos dataset to: {OUTPUT_JSON_FILE} ({total_photos} photos across {len(photos_by_place)} places)", flush=True)

    # Generate SQL seed file for D1 database
    os.makedirs(os.path.dirname(OUTPUT_SQL_FILE), exist_ok=True)
    with open(OUTPUT_SQL_FILE, "w", encoding="utf-8") as f:
        f.write("-- Auto-generated D1 place_photos seed file\n")
        f.write("DELETE FROM place_photos;\n\n")
        for place_id_str, photo_list in photos_by_place.items():
            for p in photo_list:
                sql_id = p["id"].replace("'", "''")
                sql_place_id = p["placeId"]
                sql_url = p["url"].replace("'", "''")
                sql_thumb = p["thumbnailUrl"].replace("'", "''")
                sql_cap = p["caption"].replace("'", "''")
                sql_credit = p["credit"].replace("'", "''")
                f.write(
                    f"INSERT INTO place_photos (id, place_id, url, thumbnail_url, caption, credit) "
                    f"VALUES ('{sql_id}', {sql_place_id}, '{sql_url}', '{sql_thumb}', '{sql_cap}', '{sql_credit}');\n"
                )

    print(f"✅ Generated SQL seed file: {OUTPUT_SQL_FILE}", flush=True)


if __name__ == "__main__":
    main()
