#!/usr/bin/env python3
"""
enrich_missing_addresses_and_photos.py - Deep Address & Website Photo Enrichment

1. Audits all 2,805 places in public/data/places.json.
2. Identifies places with missing addresses, websites, or photos.
3. Uses Google Places API (with GOOGLE_PLACES_API_KEY) to fetch missing street addresses and website URLs only.
4. Scrapes authentic venue photos directly from official website URLs (og:image & hero media).
5. Saves clean updated dataset to public/data/places.json & public/data/place_photos.json.

This script must not request or store Google rating, review count, review,
price, popularity, or other value/ranking fields.
"""

import json
import os
import re
import time
import urllib.parse
import urllib.request

DATA_FILE = os.path.join(os.path.dirname(__file__), "..", "public", "data", "places.json")
PHOTOS_FILE = os.path.join(os.path.dirname(__file__), "..", "public", "data", "place_photos.json")
ENV_FILE = os.path.join(os.path.dirname(__file__), "..", ".env")
GOOGLE_FIELD_MASK = "places.displayName,places.formattedAddress,places.websiteUri"
FORBIDDEN_VALUE_FIELDS = {
    "rating",
    "userRatingCount",
    "user_ratings_total",
    "reviewCount",
    "reviews",
    "priceLevel",
    "price_level",
    "popularity",
    "prominence",
}

# Load .env
if os.path.exists(ENV_FILE):
    with open(ENV_FILE, "r", encoding="utf-8") as f:
        for line in f:
            if line.strip() and not line.startswith("#") and "=" in line:
                k, v = line.strip().split("=", 1)
                os.environ.setdefault(k.strip(), v.strip())

API_KEY = os.environ.get("GOOGLE_PLACES_API_KEY", "")

def scrape_website_photo(url):
    """Extract authentic high-res og:image photo directly from venue website URL."""
    if not url or not url.startswith("http"):
        return None
    try:
        req = urllib.request.Request(
            url,
            headers={"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Motkarta/1.0"}
        )
        with urllib.request.urlopen(req, timeout=5) as resp:
            html = resp.read().decode("utf-8", errors="ignore")
            match = re.search(r'<meta[^>]+property=["\']og:image["\'][^>]+content=["\']([^"\']+)["\']', html, re.IGNORECASE)
            if not match:
                match = re.search(r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+property=["\']og:image["\']', html, re.IGNORECASE)
            if match:
                img_url = match.group(1)
                if img_url.startswith("/"):
                    parsed = urllib.parse.urlparse(url)
                    img_url = f"{parsed.scheme}://{parsed.netloc}{img_url}"
                if img_url.startswith("http"):
                    return img_url
    except Exception:
        pass
    return None

def fetch_google_place_details(place_name, area, api_key, retries=3):
    """Query Google Places API (New) for neutral metadata only."""
    if not api_key:
        return None

    url = "https://places.googleapis.com/v1/places:searchText"
    payload = json.dumps({"textQuery": f"{place_name} {area} Stockholm Sweden"}).encode("utf-8")
    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": api_key,
        "X-Goog-FieldMask": GOOGLE_FIELD_MASK,
    }

    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, data=payload, headers=headers, method="POST")
            with urllib.request.urlopen(req, timeout=8) as response:
                res_data = json.loads(response.read().decode("utf-8"))
                results = res_data.get("places", [])
                if results:
                    best = results[0]
                    details = {
                        "address": best.get("formattedAddress"),
                        "website": best.get("websiteUri"),
                    }
                    assert_no_forbidden_value_fields(details)
                    return details
                return None
        except urllib.error.HTTPError as e:
            if e.code == 429 and attempt < retries - 1:
                time.sleep(2.0 * (attempt + 1))
                continue
            print(f"⚠️ API Error for {place_name}: {e}")
            break
        except Exception as e:
            print(f"⚠️ API Error for {place_name}: {e}")
            break
    return None

def forbidden_value_fields(payload):
    found = set()
    if isinstance(payload, dict):
        for key, value in payload.items():
            if key in FORBIDDEN_VALUE_FIELDS:
                found.add(key)
            found.update(forbidden_value_fields(value))
    elif isinstance(payload, list):
        for item in payload:
            found.update(forbidden_value_fields(item))
    return found

def assert_no_forbidden_value_fields(payload):
    found = forbidden_value_fields(payload)
    if found:
        raise ValueError(f"Google metadata payload contains forbidden value fields: {', '.join(sorted(found))}")

def main():
    print("🔍 Auditing Motkarta place dataset for missing addresses & website photos...")

    if not os.path.exists(DATA_FILE):
        print("❌ dataset places.json not found")
        return

    with open(DATA_FILE, "r", encoding="utf-8") as f:
        data = json.load(f)

    places = data.get("places", [])
    photos_data = {
        "updatedAt": "",
        "totalPlaces": 0,
        "totalPhotos": 0,
        "photosByPlace": {},
    }
    if os.path.exists(PHOTOS_FILE):
        with open(PHOTOS_FILE, "r", encoding="utf-8") as f:
            photos_data = json.load(f)
    photos_by_place = photos_data.setdefault("photosByPlace", {})

    missing_address = [p for p in places if not p.get("address") or len(p.get("address", "")) < 5]
    missing_photos = [p for p in places if not photos_by_place.get(str(p["id"]))]

    print(f"📊 Dataset Audit Results:")
    print(f"  - Total Unique Places: {len(places)}")
    print(f"  - Places missing complete street address: {len(missing_address)}")
    print(f"  - Places missing authentic photos: {len(missing_photos)}")

    if not API_KEY:
        print("\n💡 NOTE: GOOGLE_PLACES_API_KEY is not yet in local .env!")
        print("   To execute the initial full enrichment run, add `GOOGLE_PLACES_API_KEY=your_key` to .env.")
        return

    print(f"\n⚡ Beginning metadata-only enrichment run with Google Places API & Website Scraper...", flush=True)
    enriched_addresses = 0
    enriched_photos = 0

    for i, place in enumerate(places):
        if i % 25 == 0 and i > 0:
            print(f"⏳ Progress: {i}/{len(places)} places processed ({enriched_addresses} addresses, {enriched_photos} website photos enriched)...", flush=True)

        p_id = str(place["id"])
        needs_address = not place.get("address") or len(place.get("address", "")) < 5
        needs_photo = not photos_by_place.get(p_id)

        if not needs_address and not needs_photo:
            continue

        details = fetch_google_place_details(place["name"], place["area"], API_KEY)
        if details:
            if needs_address and details.get("address"):
                place["address"] = details["address"]
                enriched_addresses += 1

            if details.get("website"):
                place["website"] = details["website"]

            # Try website photo
            website = place.get("website")
            if website and needs_photo:
                img = scrape_website_photo(website)
                if img:
                    photos_by_place[p_id] = [{
                        "url": img,
                        "thumbnailUrl": img,
                        "caption": f"{place['name']} ({place['area']})",
                        "credit": f"{place['name']} / Official Site"
                    }]
                    enriched_photos += 1

            print(f"✨ Enriched [{i+1}/{len(places)}] {place['name']} ({place['area']}) -> {place.get('address', 'N/A')}", flush=True)

        time.sleep(0.1)  # Rate limiting compliance

    data["places"] = places
    photos_data["updatedAt"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    photos_data["totalPlaces"] = len(places)
    photos_data["totalPhotos"] = sum(len(items) for items in photos_by_place.values())
    with open(DATA_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    with open(PHOTOS_FILE, "w", encoding="utf-8") as f:
        json.dump(photos_data, f, ensure_ascii=False, indent=2)

    print(f"\n🎉 Initial Enrichment Completed:")
    print(f"  - Addresses Enriched: {enriched_addresses}")
    print(f"  - Website Photos Enriched: {enriched_photos}")

if __name__ == "__main__":
    main()
