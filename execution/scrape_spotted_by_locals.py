#!/usr/bin/env python3
"""
Scraper for Spotted by Locals Stockholm (https://www.spottedbylocals.com/stockholm/)
Extracts local hidden gem recommendations, descriptions, and spot links using cloudscraper
to bypass Cloudflare WAF, mapping them against Motkarta catalog places and enriching public/data/places.json.
"""

import json
import os
import re
import time
from datetime import datetime, timezone
from typing import Dict, List, Any
import cloudscraper
import bs4

PLACES_PATH = os.path.join(os.path.dirname(__file__), "..", "public", "data", "places.json")
OUTPUT_PATH = os.path.join(os.path.dirname(__file__), "..", "public", "data", "spotted_by_locals.json")

def get_stockholm_urls_from_sitemaps(scraper: cloudscraper.CloudScraper) -> List[str]:
    """Fetch all Stockholm spot URLs from Spotted by Locals XML sitemaps."""
    urls = set()
    print("Fetching XML sitemaps to locate all Stockholm spot endpoints...")
    for i in range(1, 13):
        s_url = 'https://www.spottedbylocals.com/spots-sitemap.xml' if i == 1 else f'https://www.spottedbylocals.com/spots-sitemap{i}.xml'
        try:
            r = scraper.get(s_url, timeout=15)
            if r.status_code == 200:
                matches = re.findall(r'<loc>(https://www\.spottedbylocals\.com/stockholm/[^/]+/\s*)</loc>', r.text)
                for m in matches:
                    cleaned_url = m.strip()
                    # Exclude pagination, index and category landing pages
                    slug = cleaned_url.rstrip('/').split('/')[-1]
                    if slug not in ("stockholm", "page", "restaurants", "bars", "snacks", "coffee-tea", "shopping", "relax", "culture"):
                        urls.add(cleaned_url)
        except Exception as err:
            print(f"  Note sitemap {i}: {err}")
    
    print(f"Located {len(urls)} distinct Stockholm spot candidate URLs.")
    return sorted(list(urls))

def scrape_spot_detail(scraper: cloudscraper.CloudScraper, url: str) -> Dict[str, Any]:
    """Scrape title, review text, and category from a single spot detail page."""
    try:
        r = scraper.get(url, timeout=15)
        if r.status_code != 200:
            return None
        
        soup = bs4.BeautifulSoup(r.text, 'html.parser')
        h1 = soup.find('h1')
        if not h1 or "Oops" in h1.text:
            return None
        
        raw_name = h1.text.strip()
        # Clean title (e.g. "Franky's Burger Stockholm" -> "Franky's Burger")
        clean_name = re.sub(r'\s+Stockholm$', '', raw_name, flags=re.IGNORECASE).strip()
        
        # Extract main review summary from paragraphs
        paragraphs = []
        for p in soup.find_all('p'):
            txt = p.text.strip()
            if len(txt) > 40 and not txt.startswith("Find your way") and not txt.startswith("Spotted by Locals"):
                paragraphs.append(txt)
        
        summary = paragraphs[0] if paragraphs else f"Verified local spotter pick on Spotted by Locals Stockholm: {clean_name}"
        
        # Determine slug
        slug = url.rstrip('/').split('/')[-1]

        return {
            "name": clean_name,
            "rawName": raw_name,
            "slug": slug,
            "url": url,
            "summary": summary,
            "paragraphs": paragraphs[:3],
            "category": "Hidden Gem Spot"
        }
    except Exception as err:
        print(f"  Failed scraping {url}: {err}")
        return None

def normalize_name(name: str) -> str:
    cleaned = name.lower()
    cleaned = re.sub(r'[\'\’\"\,\.\-\–\—\(\)]', ' ', cleaned)
    cleaned = re.sub(r'\s+', ' ', cleaned).strip()
    return cleaned

def match_spots_with_places(spots: List[Dict[str, Any]], places: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    matched_results = []
    
    # Index places by normalized name
    place_index = {}
    for p in places:
        norm = normalize_name(p.get("name", ""))
        if norm:
            place_index[norm] = p

    for spot in spots:
        norm_spot = normalize_name(spot["name"])
        matched_place = None

        # 1. Direct exact match
        if norm_spot in place_index:
            matched_place = place_index[norm_spot]
        else:
            # 2. Substring match for substantial names
            for p_norm, p_data in place_index.items():
                if len(norm_spot) >= 4 and len(p_norm) >= 4:
                    if norm_spot == p_norm or (len(norm_spot) > 6 and norm_spot in p_norm) or (len(p_norm) > 6 and p_norm in norm_spot):
                        matched_place = p_data
                        break

        matched_results.append({
            "spotName": spot["name"],
            "url": spot["url"],
            "summary": spot["summary"],
            "matchedPlaceId": matched_place["id"] if matched_place else None,
            "matchedPlaceName": matched_place["name"] if matched_place else None,
            "district": matched_place.get("area") if matched_place else None,
            "verifiedHiddenGem": True if matched_place else False
        })

    return matched_results

def enrich_catalog_places(matched_spots: List[Dict[str, Any]], places_data: Dict[str, Any]) -> int:
    """Add 'Spotted by Locals' tag, evidenceLabel entry and sourceFacts to matched catalog places."""
    places_list = places_data.get("places", []) if isinstance(places_data, dict) else places_data
    places_by_id = {p["id"]: p for p in places_list if "id" in p}
    
    now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    now_ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    enriched_count = 0

    for m in matched_spots:
        pid = m.get("matchedPlaceId")
        if not pid or pid not in places_by_id:
            continue
        
        place = places_by_id[pid]
        
        # 1. Tags
        tags = place.setdefault("tags", [])
        if "Spotted by Locals" not in tags:
            tags.append("Spotted by Locals")
        if "Hidden Gem" not in tags:
            tags.append("Hidden Gem")
            
        # 2. Evidence label
        evidence_label = place.get("evidenceLabel", "")
        if "Spotted by Locals" not in evidence_label:
            if evidence_label:
                place["evidenceLabel"] = f"{evidence_label} · Spotted by Locals"
            else:
                place["evidenceLabel"] = "Spotted by Locals"
        
        # 3. Source facts
        source_facts = place.setdefault("sourceFacts", [])
        fact_id = f"{pid}:spotted-by-locals:hidden-gem"
        if not any(f.get("id") == fact_id for f in source_facts):
            source_facts.append({
                "id": fact_id,
                "placeId": pid,
                "field": "curated_hidden_gem",
                "value": m["summary"][:120] if m.get("summary") else "Spotted by Locals recommendation",
                "source": "Spotted by Locals Stockholm",
                "verification": "listed",
                "url": m["url"],
                "capturedAt": now_ts
            })
            
        place["lastUpdated"] = now_iso
        enriched_count += 1

    return enriched_count

def main():
    print("Starting Spotted by Locals Stockholm scraper...")
    scraper = cloudscraper.create_scraper()
    
    urls = get_stockholm_urls_from_sitemaps(scraper)
    
    scraped_spots = []
    print(f"Scraping detail pages for {len(urls)} candidates...")
    for idx, u in enumerate(urls, 1):
        spot = scrape_spot_detail(scraper, u)
        if spot:
            scraped_spots.append(spot)
            print(f" [{idx}/{len(urls)}] Scraped: {spot['name']} ({spot['url']})")
        else:
            print(f" [{idx}/{len(urls)}] Skipped/Archived: {u}")
        time.sleep(0.1)

    print(f"\nSuccessfully extracted {len(scraped_spots)} active local spots.")

    # Load public places dataset
    places_raw = {}
    places_list = []
    if os.path.exists(PLACES_PATH):
        with open(PLACES_PATH, "r", encoding="utf-8") as f:
            places_raw = json.load(f)
        places_list = places_raw.get("places", []) if isinstance(places_raw, dict) else places_raw
        print(f"Loaded {len(places_list)} catalog places from public/data/places.json")

    matched = match_spots_with_places(scraped_spots, places_list)
    verified_matches = [m for m in matched if m["matchedPlaceId"] is not None]
    print(f"Matched {len(verified_matches)} spots to Motkarta catalog places.")

    # Enrich catalog places dataset
    enriched = enrich_catalog_places(matched, places_raw)
    print(f"Enriched {enriched} catalog places in memory.")

    # Save public/data/places.json
    with open(PLACES_PATH, "w", encoding="utf-8") as f:
        json.dump(places_raw, f, ensure_ascii=False, indent=2)
    print(f"Updated {PLACES_PATH}")

    # Save public/data/spotted_by_locals.json
    output_payload = {
        "sourceName": "Spotted by Locals Stockholm",
        "sourceUrl": "https://www.spottedbylocals.com/stockholm/",
        "license": "Editorial Guide / Local Spotters",
        "scrapedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "totalExtractedSpots": len(scraped_spots),
        "verifiedCatalogMatches": len(verified_matches),
        "spots": matched
    }

    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(output_payload, f, ensure_ascii=False, indent=2)
    print(f"Saved extracted spots payload to {OUTPUT_PATH}")

if __name__ == "__main__":
    main()
