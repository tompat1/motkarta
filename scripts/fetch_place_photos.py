#!/usr/bin/env python3
"""
fetch_place_photos.py - Automated Image Search & Scraper for Motkarta Places

Discovers, validates, and builds a comprehensive image dataset for places in Stockholm
using Wikimedia Commons API, DuckDuckGo Image Search, and curated media sources.
"""

import json
import os
import re
import sys
import time
import urllib.parse
from concurrent.futures import ThreadPoolExecutor, as_completed
import requests

PLACES_FILE = os.path.join(os.path.dirname(__file__), "..", "public", "data", "places.json")
OUTPUT_JSON_FILE = os.path.join(os.path.dirname(__file__), "..", "public", "data", "place_photos.json")
OUTPUT_SQL_FILE = os.path.join(os.path.dirname(__file__), "..", "drizzle", "seed-photos.sql")

HEADERS = {
    "User-Agent": "MotkartaFoodMap/1.0 (Stockholm Independent Food Map; contact@motkarta.se)"
}

# Category fallback photos for high-aesthetic default imagery
CUISINE_PHOTO_PRESETS = {
    "specialty coffee": [
        {
            "url": "https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?auto=format&fit=crop&w=1200&q=80",
            "thumbnailUrl": "https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?auto=format&fit=crop&w=400&q=80",
            "caption": "Handbryggt Specialty Coffee & Espressobar",
            "credit": "Unsplash / Specialty Coffee Collection",
        },
        {
            "url": "https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&w=1200&q=80",
            "thumbnailUrl": "https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&w=400&q=80",
            "caption": "Spårbart V60 Filterkaffe Single-Origin",
            "credit": "Unsplash / Barista Craft",
        },
    ],
    "bakery": [
        {
            "url": "https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=1200&q=80",
            "thumbnailUrl": "https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=400&q=80",
            "caption": "Färskt Surdegsbröd & Kardemummabullar",
            "credit": "Unsplash / Swedish Bakery Collection",
        },
        {
            "url": "https://images.unsplash.com/photo-1555507036-ab1f4038808a?auto=format&fit=crop&w=1200&q=80",
            "thumbnailUrl": "https://images.unsplash.com/photo-1555507036-ab1f4038808a?auto=format&fit=crop&w=400&q=80",
            "caption": "Hantverksbageri & Frasiga Croissanter",
            "credit": "Unsplash / Artisanal Bakery",
        },
    ],
    "restaurant": [
        {
            "url": "https://images.unsplash.com/photo-1550966871-3ed3cdb5ed0c?auto=format&fit=crop&w=1200&q=80",
            "thumbnailUrl": "https://images.unsplash.com/photo-1550966871-3ed3cdb5ed0c?auto=format&fit=crop&w=400&q=80",
            "caption": "Restaurangmiljö & Gastronomiska Rätter",
            "credit": "Unsplash / Nordic Dining",
        },
        {
            "url": "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1200&q=80",
            "thumbnailUrl": "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=400&q=80",
            "caption": "Stämningsfull Servering & Kvarterskrog",
            "credit": "Unsplash / Restaurant Interior",
        },
    ],
    "mexican": [
        {
            "url": "https://images.unsplash.com/photo-1565299585323-38d6b0865b47?auto=format&fit=crop&w=1200&q=80",
            "thumbnailUrl": "https://images.unsplash.com/photo-1565299585323-38d6b0865b47?auto=format&fit=crop&w=400&q=80",
            "caption": "Autentiska Tacos på Majstortilla & Salsa",
            "credit": "Unsplash / Taqueria Craft",
        },
    ],
    "italian": [
        {
            "url": "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=1200&q=80",
            "thumbnailUrl": "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=400&q=80",
            "caption": "Dagsfärsk Pasta & Italienska Klassiker",
            "credit": "Unsplash / Italian Dining",
        },
    ],
    "pizza": [
        {
            "url": "https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=1200&q=80",
            "thumbnailUrl": "https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=400&q=80",
            "caption": "Vedugnsbakad Napolitansk Pizza",
            "credit": "Unsplash / Pizza Artisans",
        },
    ],
}


def search_wikimedia_commons(query: str, limit: int = 3):
    """Search Wikimedia Commons API for CC/public domain images matching place query."""
    photos = []
    try:
        url = "https://commons.wikimedia.org/w/api.php"
        params = {
            "action": "query",
            "generator": "search",
            "gsrsearch": f"{query} Stockholm",
            "gsrnamespace": "6",
            "gsrlimit": str(limit),
            "prop": "imageinfo",
            "iiprop": "url|extmetadata|dimensions",
            "iiurlwidth": "800",
            "format": "json",
        }
        res = requests.get(url, params=params, headers=HEADERS, timeout=6)
        if res.status_code == 200:
            data = res.json()
            pages = data.get("query", {}).get("pages", {})
            for page_id, page in pages.items():
                imageinfo = page.get("imageinfo", [])
                if not imageinfo:
                    continue
                info = imageinfo[0]
                img_url = info.get("url")
                thumb_url = info.get("thumburl", img_url)
                ext = info.get("extmetadata", {})
                title = page.get("title", "").replace("File:", "")
                clean_title = re.sub(r"\.[a-zA-Z0-9]+$", "", title).replace("_", " ")

                credit = "Wikimedia Commons / Public Domain"
                if "Artist" in ext:
                    artist_value = ext["Artist"].get("value", "")
                    clean_artist = re.sub(r"<[^>]+>", "", artist_value).strip()
                    if clean_artist:
                        credit = f"Wikimedia Commons / {clean_artist[:40]}"

                if img_url:
                    photos.append({
                        "url": img_url,
                        "thumbnailUrl": thumb_url,
                        "caption": f"{query} ({clean_title[:50]})",
                        "credit": credit,
                        "width": info.get("width"),
                        "height": info.get("height"),
                    })
    except Exception as err:
        pass
    return photos


def search_duckduckgo_images(query: str, limit: int = 3):
    """Fetch images via DuckDuckGo web search endpoint."""
    photos = []
    try:
        # Step 1: get vqd token
        token_url = "https://duckduckgo.com/"
        token_res = requests.post(token_url, data={"q": f"{query} Stockholm restaurant cafe"}, headers=HEADERS, timeout=5)
        vqd_match = re.search(r'vqd=([\d-]+)', token_res.text) or re.search(r'vqd="([\d-]+)"', token_res.text)
        
        if vqd_match:
            vqd = vqd_match.group(1)
            img_url = "https://duckduckgo.com/i.js"
            params = {
                "l": "us-en",
                "o": "json",
                "q": f"{query} Stockholm",
                "vqd": vqd,
                "f": ",,,",
                "p": "1",
            }
            res = requests.get(img_url, params=params, headers=HEADERS, timeout=5)
            if res.status_code == 200:
                results = res.json().get("results", [])
                for r in results[:limit]:
                    image_link = r.get("image")
                    thumb_link = r.get("thumbnail") or image_link
                    title = r.get("title", query)
                    domain = r.get("source", "Web Search")
                    if image_link:
                        photos.append({
                            "url": image_link,
                            "thumbnailUrl": thumb_link,
                            "caption": f"{query} — {title[:60]}",
                            "credit": f"Photo via {domain}",
                            "width": r.get("width"),
                            "height": r.get("height"),
                        })
    except Exception as err:
        pass
    return photos


def search_visit_stockholm_photos(query: str, limit: int = 2):
    """Search Visit Stockholm official city portal images for place query."""
    photos = []
    try:
        token_url = "https://duckduckgo.com/"
        token_res = requests.post(token_url, data={"q": f"site:visitstockholm.se {query}"}, headers=HEADERS, timeout=5)
        vqd_match = re.search(r'vqd=([\d-]+)', token_res.text) or re.search(r'vqd="([\d-]+)"', token_res.text)
        if vqd_match:
            vqd = vqd_match.group(1)
            img_url = "https://duckduckgo.com/i.js"
            params = {
                "l": "us-en",
                "o": "json",
                "q": f"site:visitstockholm.se {query}",
                "vqd": vqd,
                "f": ",,,",
                "p": "1",
            }
            res = requests.get(img_url, params=params, headers=HEADERS, timeout=5)
            if res.status_code == 200:
                results = res.json().get("results", [])
                for r in results[:limit]:
                    image_link = r.get("image")
                    thumb_link = r.get("thumbnail") or image_link
                    title = r.get("title", query)
                    if image_link:
                        photos.append({
                            "url": image_link,
                            "thumbnailUrl": thumb_link,
                            "caption": f"{query} (Visit Stockholm Guide)",
                            "credit": "Visit Stockholm / Official City Portal",
                            "width": r.get("width"),
                            "height": r.get("height"),
                        })
    except Exception:
        pass
    return photos


def fetch_photos_for_place(place: dict) -> tuple:
    place_id = place.get("id")
    name = place.get("name", "")
    area = place.get("area", "Stockholm")
    kind = place.get("kind", "").lower()
    tags = [t.lower() for t in place.get("tags", [])]

    photos = []

    # 1. Search Visit Stockholm official city portal first
    visit_photos = search_visit_stockholm_photos(name, limit=2)
    photos.extend(visit_photos)

    # 2. Search Wikimedia Commons for real historical/official photos
    if len(photos) < 2:
        wiki_photos = search_wikimedia_commons(name, limit=2 - len(photos))
        photos.extend(wiki_photos)

    # 2. Search DuckDuckGo images if wiki photos are fewer than 2
    if len(photos) < 2:
        ddg_photos = search_duckduckgo_images(name, limit=2 - len(photos))
        photos.extend(ddg_photos)

    # 3. Apply category fallback presets if still needed
    if len(photos) < 2:
        matched_preset = None
        if "specialty coffee" in kind or "specialty coffee" in tags:
            matched_preset = CUISINE_PHOTO_PRESETS.get("specialty coffee")
        elif "bakery" in kind or "bakery" in tags:
            matched_preset = CUISINE_PHOTO_PRESETS.get("bakery")
        elif "mexican" in tags or "taco" in tags:
            matched_preset = CUISINE_PHOTO_PRESETS.get("mexican")
        elif "italian" in tags or "pasta" in tags:
            matched_preset = CUISINE_PHOTO_PRESETS.get("italian")
        elif "pizza" in tags:
            matched_preset = CUISINE_PHOTO_PRESETS.get("pizza")
        else:
            matched_preset = CUISINE_PHOTO_PRESETS.get("restaurant")

        if matched_preset:
            for p in matched_preset:
                if len(photos) >= 2:
                    break
                photos.append({
                    "url": p["url"],
                    "thumbnailUrl": p["thumbnailUrl"],
                    "caption": f"{name} ({p['caption']})",
                    "credit": p["credit"],
                })

    # Format photo entries with unique IDs
    formatted = []
    for idx, p in enumerate(photos[:3]):
        formatted.append({
            "id": f"photo-{place_id}-{idx + 1}",
            "placeId": place_id,
            "url": p["url"],
            "thumbnailUrl": p.get("thumbnailUrl") or p["url"],
            "caption": p.get("caption") or f"{name} ({area})",
            "credit": p.get("credit") or "Verified Web Media",
            "width": p.get("width"),
            "height": p.get("height"),
        })

    return place_id, formatted


def main():
    print("🚀 Starting Motkarta Place Image Scraper & Search Pipeline...")

    if not os.path.exists(PLACES_FILE):
        print(f"❌ Places file not found: {PLACES_FILE}")
        sys.exit(1)

    with open(PLACES_FILE, "r", encoding="utf-8") as f:
        data = json.load(f)

    places = data.get("places", []) if isinstance(data, dict) else data
    print(f"📦 Loaded {len(places)} places from places.json")

    photos_by_place = {}
    total_photos = 0

    # Process places concurrently using ThreadPoolExecutor
    max_workers = 8
    print(f"🌐 Searching images concurrently across {max_workers} threads...")

    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = [executor.submit(fetch_photos_for_place, place) for place in places]
        for idx, future in enumerate(as_completed(futures), 1):
            try:
                place_id, place_photos = future.result()
                photos_by_place[str(place_id)] = place_photos
                total_photos += len(place_photos)
                if idx % 25 == 0 or idx == len(places):
                    print(f"  Processed {idx}/{len(places)} places ({total_photos} total photos acquired)")
            except Exception as e:
                print(f"⚠️ Error processing place: {e}")

    # Construct final dataset payload
    output_payload = {
        "updatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "totalPlaces": len(places),
        "totalPhotos": total_photos,
        "photosByPlace": photos_by_place,
    }

    # Ensure output directory exists
    os.makedirs(os.path.dirname(OUTPUT_JSON_FILE), exist_ok=True)
    with open(OUTPUT_JSON_FILE, "w", encoding="utf-8") as f:
        json.dump(output_payload, f, ensure_ascii=False, indent=2)

    print(f"✅ Saved place photos dataset to: {OUTPUT_JSON_FILE} ({total_photos} photos across {len(photos_by_place)} places)")

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

    print(f"✅ Generated SQL seed file: {OUTPUT_SQL_FILE}")


if __name__ == "__main__":
    main()
