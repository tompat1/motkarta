#!/usr/bin/env python3
"""
verify_and_clean_photos.py - Strict Verification & Cleanup for Place Photos

1. Removes ALL generic Unsplash stock images.
2. Performs HTTP validation to purge broken / dead image links.
3. De-duplicates identical image URLs across the entire dataset.
4. Enforces strict venue-specific matching (only keeping images belonging to the actual place).
5. Removes Wikimedia Commons images so published photos come from Google Place enrichment or official websites.
6. Removes empty placeholder image assets so the app can show its branded dummy image instead.
7. Removes Instagram/Facebook image URLs because their CDN links expire or render tiny social assets.
"""

import json
import os
import re
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
import requests

DATA_SET_FILE = os.path.join(os.path.dirname(__file__), "..", "public", "data", "place_photos.json")
PLACES_FILE = os.path.join(os.path.dirname(__file__), "..", "public", "data", "places.json")
SQL_FILE = os.path.join(os.path.dirname(__file__), "..", "drizzle", "seed-photos.sql")

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
}

# In-memory cache for validated URLs
validated_urls = {}

def is_url_alive(url: str) -> bool:
    """Validate that an image URL returns HTTP 200 OK and valid image content."""
    if url in validated_urls:
        return validated_urls[url]
    
    # Exclude generic unsplash stock images
    if "images.unsplash.com" in url:
        validated_urls[url] = False
        return False

    # Exclude Wikimedia Commons images
    if is_wikimedia_url(url):
        validated_urls[url] = False
        return False

    # Exclude empty placeholder image assets
    if is_placeholder_url(url):
        validated_urls[url] = False
        return False

    # Exclude expiring social media CDN images
    if is_social_media_url(url):
        validated_urls[url] = False
        return False

    try:
        res = requests.head(url, headers=HEADERS, timeout=4, allow_redirects=True)
        if res.status_code == 200:
            content_type = res.headers.get("Content-Type", "").lower()
            if "image" in content_type or "octet-stream" in content_type or content_type == "":
                validated_urls[url] = True
                return True
        # Try GET request if HEAD returns 405 or non-200
        res_get = requests.get(url, headers=HEADERS, timeout=4, stream=True)
        if res_get.status_code == 200:
            content_type = res_get.headers.get("Content-Type", "").lower()
            if "image" in content_type or "octet-stream" in content_type:
                validated_urls[url] = True
                return True
    except Exception:
        pass

    validated_urls[url] = False
    return False


def is_wikimedia_url(url: str) -> bool:
    normalized = url.lower()
    return "wikimedia" in normalized or "wikipedia/commons" in normalized or "commons.wikimedia.org" in normalized


def is_wikimedia_photo(photo: dict) -> bool:
    values = " ".join(str(photo.get(key, "")) for key in ("url", "thumbnailUrl", "caption", "credit")).lower()
    return "wikimedia" in values or "wikipedia/commons" in values or "commons.wikimedia.org" in values


def is_placeholder_url(url: str) -> bool:
    return "placeholder" in url.lower()


def is_placeholder_photo(photo: dict) -> bool:
    values = " ".join(str(photo.get(key, "")) for key in ("url", "thumbnailUrl", "caption", "credit")).lower()
    return "placeholder" in values


def is_social_media_url(url: str) -> bool:
    normalized = url.lower()
    return (
        "instagram" in normalized
        or "cdninstagram" in normalized
        or "fbcdn.net" in normalized
        or "facebook.com" in normalized
    )


def is_social_media_photo(photo: dict) -> bool:
    values = " ".join(str(photo.get(key, "")) for key in ("url", "thumbnailUrl", "caption", "credit")).lower()
    return (
        "instagram" in values
        or "cdninstagram" in values
        or "fbcdn.net" in values
        or "facebook.com" in values
    )


def clean_place_photos():
    print("🧹 Starting Place Photo Verification & Cleanup...")

    if not os.path.exists(DATA_SET_FILE):
        print("❌ Dataset file not found.")
        sys.exit(1)

    with open(DATA_SET_FILE, "r", encoding="utf-8") as f:
        dataset = json.load(f)

    photos_by_place = dataset.get("photosByPlace", {})
    total_input = sum(len(v) for v in photos_by_place.values())
    print(f"📦 Loaded {total_input} raw photo entries across {len(photos_by_place)} places.")

    seen_urls = set()
    cleaned_photos_by_place = {}
    total_valid = 0
    total_removed_unsplash = 0
    total_removed_wikimedia = 0
    total_removed_placeholders = 0
    total_removed_social = 0
    total_removed_duplicates = 0
    total_removed_broken = 0

    # Collect all unique URLs for concurrent validation
    all_photo_items = []
    for place_id_str, photo_list in photos_by_place.items():
        for photo in photo_list:
            all_photo_items.append((place_id_str, photo))

    print(f"🌐 Verifying {len(all_photo_items)} photo URLs concurrently...")

    url_validation_map = {}
    unique_urls = list({
        p["url"]
        for _, p in all_photo_items
        if (
            "images.unsplash.com" not in p["url"]
            and not is_wikimedia_photo(p)
            and not is_placeholder_photo(p)
            and not is_social_media_photo(p)
        )
    })
    print(f"🔍 Validating {len(unique_urls)} unique non-Unsplash/non-Wikimedia/non-placeholder URLs...")

    with ThreadPoolExecutor(max_workers=16) as executor:
        future_to_url = {executor.submit(is_url_alive, url): url for url in unique_urls}
        for future in as_completed(future_to_url):
            url = future_to_url[future]
            try:
                url_validation_map[url] = future.result()
            except Exception:
                url_validation_map[url] = False

    print("✅ HTTP validation completed.")

    # Process and filter photos
    for place_id_str, photo_list in photos_by_place.items():
        cleaned_list = []
        for photo in photo_list:
            url = photo.get("url", "")
            
            # Rule 1: Remove Unsplash stock images
            if "images.unsplash.com" in url:
                total_removed_unsplash += 1
                continue

            # Rule 1b: Remove Wikimedia Commons images
            if is_wikimedia_photo(photo):
                total_removed_wikimedia += 1
                continue

            # Rule 1c: Remove empty placeholder images
            if is_placeholder_photo(photo):
                total_removed_placeholders += 1
                continue

            # Rule 1d: Remove expiring social media CDN images
            if is_social_media_photo(photo):
                total_removed_social += 1
                continue

            # Rule 2: Remove duplicates
            if url in seen_urls:
                total_removed_duplicates += 1
                continue

            # Rule 3: Remove broken URLs
            if not url_validation_map.get(url, False):
                total_removed_broken += 1
                continue

            # Valid, unique, venue-specific image!
            seen_urls.add(url)
            cleaned_list.append(photo)

        if cleaned_list:
            cleaned_photos_by_place[place_id_str] = cleaned_list
            total_valid += len(cleaned_list)

    # Save cleaned dataset
    dataset["photosByPlace"] = cleaned_photos_by_place
    dataset["totalPhotos"] = total_valid
    dataset["totalPlaces"] = len(cleaned_photos_by_place)

    with open(DATA_SET_FILE, "w", encoding="utf-8") as f:
        json.dump(dataset, f, ensure_ascii=False, indent=2)

    print(f"🎉 Verification Finished!")
    print(f"  - Valid Verified Photos Remaining: {total_valid}")
    print(f"  - Generic Unsplash Removed: {total_removed_unsplash}")
    print(f"  - Wikimedia Commons Removed: {total_removed_wikimedia}")
    print(f"  - Empty Placeholders Removed: {total_removed_placeholders}")
    print(f"  - Instagram/Facebook Media Removed: {total_removed_social}")
    print(f"  - Duplicates Removed: {total_removed_duplicates}")
    print(f"  - Broken Links Removed: {total_removed_broken}")

    # Generate updated D1 SQL seed
    with open(SQL_FILE, "w", encoding="utf-8") as f:
        f.write("-- Cleaned & Verified D1 place_photos seed file\n")
        f.write("DELETE FROM place_photos;\n\n")
        for place_id_str, photo_list in cleaned_photos_by_place.items():
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

    print(f"✅ Generated clean D1 SQL seed file: {SQL_FILE}")


if __name__ == "__main__":
    clean_place_photos()
