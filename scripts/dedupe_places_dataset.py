#!/usr/bin/env python3
"""
dedupe_places_dataset.py - Strict Place Dataset Deduplication & Chain Purge

1. Purges commercial chains.
2. Removes duplicate venue records based on normalized name & area/location.
3. Saves clean dataset to public/data/places.json.
"""

import json
import math
import os
import re

DATA_FILE = os.path.join(os.path.dirname(__file__), "..", "public", "data", "places.json")

EXCLUDED_CHAINS = [
    "nespresso",
    "kahls",
    "wayne's coffee",
    "waynes coffee",
    "espresso house",
    "starbucks",
    "bönor & blad",
    "bonor & blad",
]

def haversine_meters(lat1, lon1, lat2, lon2):
    """Calculate distance in meters between two lat/lon points."""
    R = 6371000
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2) ** 2 +
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) *
         math.sin(dlon / 2) ** 2)
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c

def clean_name(name):
    return re.sub(r"\s+", " ", name.lower().strip())

def main():
    if not os.path.exists(DATA_FILE):
        print("❌ Dataset file not found.")
        return

    with open(DATA_FILE, "r", encoding="utf-8") as f:
        data = json.load(f)

    places = data.get("places", [])
    print(f"📦 Loaded {len(places)} raw place records.")

    # Step 1: Purge commercial chains
    non_chain_places = []
    purged_chains = 0
    for p in places:
        name_lower = p["name"].lower()
        if any(chain in name_lower for chain in EXCLUDED_CHAINS):
            purged_chains += 1
            continue
        non_chain_places.append(p)

    print(f"🚫 Purged {purged_chains} commercial chain records.")

    # Step 2: Deduplicate records
    seen_places = []
    duplicate_count = 0

    for p in non_chain_places:
        p_name = clean_name(p["name"])
        p_area = (p.get("area") or "").lower().strip()
        p_lat = p.get("latitude")
        p_lon = p.get("longitude")

        is_dup = False
        for existing in seen_places:
            e_name = clean_name(existing["name"])
            e_area = (existing.get("area") or "").lower().strip()
            e_lat = existing.get("latitude")
            e_lon = existing.get("longitude")

            # Check 1: Exact normalized name and area match
            if p_name == e_name and p_area == e_area:
                is_dup = True
                break

            # Check 2: Same normalized name and close geographic proximity (< 100 meters)
            if p_name == e_name and p_lat and p_lon and e_lat and e_lon:
                dist = haversine_meters(p_lat, p_lon, e_lat, e_lon)
                if dist < 100:
                    is_dup = True
                    break

        if is_dup:
            duplicate_count += 1
        else:
            seen_places.append(p)

    print(f"🧹 Removed {duplicate_count} duplicate place records.")
    print(f"✅ Clean dataset now contains {len(seen_places)} unique places.")

    data["places"] = seen_places
    data["totalPlaces"] = len(seen_places)

    with open(DATA_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    print(f"🎉 Updated dataset saved to {DATA_FILE}")

if __name__ == "__main__":
    main()
