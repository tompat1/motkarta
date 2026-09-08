#!/usr/bin/env python3
"""
Generates a structured report detailing the places enriched and tagged as 'Hidden Gem'
and 'Spotted by Locals' in Motkarta's catalog.
"""

import json
import os
from typing import Dict, List, Any

PLACES_PATH = os.path.join(os.path.dirname(__file__), "..", "public", "data", "places.json")
SPOTTED_PATH = os.path.join(os.path.dirname(__file__), "..", "public", "data", "spotted_by_locals.json")

def main():
    if not os.path.exists(PLACES_PATH) or not os.path.exists(SPOTTED_PATH):
        print("Missing dataset files.")
        return

    with open(PLACES_PATH, "r", encoding="utf-8") as f:
        places_data = json.load(f)
    places = places_data.get("places", []) if isinstance(places_data, dict) else places_data

    with open(SPOTTED_PATH, "r", encoding="utf-8") as f:
        spotted_data = json.load(f)

    spotted_places = [p for p in places if "Spotted by Locals" in p.get("tags", [])]
    hidden_gem_places = [p for p in places if "Hidden Gem" in p.get("tags", [])]

    print("==========================================================================")
    print(" 💎 MOTKARTA SPOTTED BY LOCALS HIDDEN GEMS AUDIT REPORT")
    print("==========================================================================")
    print(f"Total Catalog Venues:                  {len(places):,}")
    print(f"Total Scraped Spots:                   {spotted_data.get('totalExtractedSpots', 0)}")
    print(f"Verified Catalog Matches:              {len(spotted_places)}")
    print(f"Places Tagged 'Spotted by Locals':      {len(spotted_places)}")
    print(f"Places Tagged 'Hidden Gem':            {len(hidden_gem_places)}")
    print("--------------------------------------------------------------------------")

    # Area Breakdown
    areas = {}
    for p in spotted_places:
        a = p.get("area", "Unspecified")
        areas[a] = areas.get(a, 0) + 1

    print("\n📍 Breakdown by Stockholm Neighborhood:")
    for area, count in sorted(areas.items(), key=lambda x: x[1], reverse=True):
        print(f"  • {area:<20}: {count} places")

    # Kind Breakdown
    kinds = {}
    for p in spotted_places:
        k = p.get("kind", "Other")
        kinds[k] = kinds.get(k, 0) + 1

    print("\n🍽️ Breakdown by Establishment Category:")
    for kind, count in sorted(kinds.items(), key=lambda x: x[1], reverse=True):
        print(f"  • {kind:<20}: {count} places")

    # Sample Matched Venues
    print("\n⭐ Highlighted Hidden Gem Venues Enriched:")
    for p in spotted_places[:20]:
        print(f"  • {p['name']} ({p.get('area', 'N/A')})")
        print(f"    Tags: {', '.join(p.get('tags', []))}")
        print(f"    Evidence: {p.get('evidenceLabel', '')}")

    print("\n==========================================================================")

if __name__ == "__main__":
    main()
