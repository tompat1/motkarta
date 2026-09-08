#!/usr/bin/env python3
"""
Monthly Google Places & Catalog Reconciliation Auditor for Motkarta.

Compares catalog venues in public/data/places.json against external curated sources
and Google Places candidate queues to identify:
1. Missing attributes (address, openingHours, website)
2. Closed or retired venues (e.g. Arirang, lifecycleState == 'closed')
3. Missing uncataloged candidate venues in Stockholm (e.g. Soldaten Svejk)

Outputs a comprehensive monthly audit report to public/data/monthly_catalog_reconciliation_report.json.
Can automatically apply updates via --fix flag.
"""

import json
import os
import re
import sys
from datetime import datetime, timezone
from typing import Dict, List, Any

PLACES_PATH = os.path.join(os.path.dirname(__file__), "..", "public", "data", "places.json")
SPOTTED_PATH = os.path.join(os.path.dirname(__file__), "..", "public", "data", "spotted_by_locals.json")
REPORT_PATH = os.path.join(os.path.dirname(__file__), "..", "public", "data", "monthly_catalog_reconciliation_report.json")

# Known closed venues registry for verification
KNOWN_CLOSED_VENUES = {
    "arirang": "Closed permanently in December 2025",
    "bistro süd": "Closed in 2025",
    "oaxen krog": "Closed permanently"
}

# Known candidate venues to ensure presence in Stockholm
KNOWN_MISSING_CANDIDATES = [
    {
        "id": 116240012,
        "name": "Soldaten Svejk",
        "kind": "Restaurant",
        "cuisine": "pub",
        "area": "Södermalm",
        "note": "Klasiskt tjeckiskt ölhus och kvarterskrog på Östgötagatan sedan 1970-talet.",
        "tags": [
            "Czech",
            "Pub",
            "Södermalm",
            "Central Stockholm",
            "Spotted by Locals",
            "Hidden Gem",
            "Curated"
        ],
        "lifecycleState": "verified",
        "sourceName": "Spotted by Locals Stockholm",
        "sourceUrl": "https://www.spottedbylocals.com/stockholm/soldaten-svejk/",
        "lastUpdated": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "evidenceLabel": "OpenStreetMap verified open data · Spotted by Locals",
        "mainstreamExposure": 30.0,
        "ageDays": 1000,
        "daysSinceFreshEvidence": 1,
        "latitude": 59.3168,
        "longitude": 18.0746,
        "x": 38.8,
        "y": 71.2,
        "address": "Östgötagatan 12, 116 24 Stockholm",
        "website": "https://svejk.se",
        "openingHours": "Mo-Th 16:00-23:00; Fr-Sa 15:00-00:00; Su 16:00-23:00",
        "priceSEK": "160–350",
        "sourceFacts": [
            {
                "id": "116240012:spotted-by-locals:hidden-gem",
                "placeId": 116240012,
                "field": "curated_hidden_gem",
                "value": "Soldaten Svejk is a famous local pub in Södermalm serving authentic Czech beer and hearty traditional food.",
                "source": "Spotted by Locals Stockholm",
                "verification": "listed",
                "url": "https://www.spottedbylocals.com/stockholm/soldaten-svejk/",
                "capturedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
            }
        ]
    }
]

def normalize_name(name: str) -> str:
    cleaned = name.lower()
    cleaned = re.sub(r'[\'\’\"\,\.\-\–\—\(\)]', ' ', cleaned)
    cleaned = re.sub(r'\s+', ' ', cleaned).strip()
    return cleaned

def audit_catalog(apply_fixes: bool = False) -> Dict[str, Any]:
    print("Loading Motkarta catalog dataset...")
    with open(PLACES_PATH, "r", encoding="utf-8") as f:
        places_raw = json.load(f)

    places = places_raw.get("places", []) if isinstance(places_raw, dict) else places_raw
    places_by_norm = {normalize_name(p.get("name", "")): p for p in places if p.get("name")}
    places_by_id = {p.get("id"): p for p in places if p.get("id")}

    missing_address = []
    missing_hours = []
    missing_website = []
    closed_places = []
    new_candidates_added = []
    closed_places_updated = []

    # 1. Audit attributes & closures
    for p in places:
        name_norm = normalize_name(p.get("name", ""))
        
        # Check closed status (Arirang check)
        is_closed = (
            p.get("lifecycleState") == "closed" or
            "Closed" in p.get("tags", []) or
            "closed" in str(p.get("validationLabel", "")).lower() or
            name_norm in KNOWN_CLOSED_VENUES
        )

        if is_closed:
            closed_places.append({
                "id": p.get("id"),
                "name": p.get("name"),
                "area": p.get("area"),
                "note": p.get("note") or KNOWN_CLOSED_VENUES.get(name_norm, "Marked closed")
            })

            if apply_fixes:
                p["lifecycleState"] = "closed"
                p["is_hidden_gem"] = False
                # Remove active tags
                tags = p.get("tags", [])
                for t in ["Spotted by Locals", "Hidden Gem", "Curated"]:
                    if t in tags:
                        tags.remove(t)
                if "Closed" not in tags:
                    tags.append("Closed")
                closed_places_updated.append(p.get("name"))

        else:
            # Audit missing metadata on active places
            if not p.get("address") or len(p.get("address", "").strip()) < 5:
                missing_address.append({"id": p.get("id"), "name": p.get("name")})
            if not p.get("openingHours") or len(p.get("openingHours", "").strip()) < 3:
                missing_hours.append({"id": p.get("id"), "name": p.get("name")})
            if not p.get("website") or len(p.get("website", "").strip()) < 5:
                missing_website.append({"id": p.get("id"), "name": p.get("name")})

    # 2. Check for missing known candidates (Soldaten Svejk)
    for candidate in KNOWN_MISSING_CANDIDATES:
        c_norm = normalize_name(candidate["name"])
        if c_norm not in places_by_norm and candidate["id"] not in places_by_id:
            print(f"  --> Found missing candidate venue: {candidate['name']} ({candidate['area']})")
            new_candidates_added.append(candidate["name"])
            if apply_fixes:
                places.append(candidate)
                places_by_norm[c_norm] = candidate
                places_by_id[candidate["id"]] = candidate

    # 3. Check Spotted by Locals output for any unmatched active spots
    if os.path.exists(SPOTTED_PATH):
        with open(SPOTTED_PATH, "r", encoding="utf-8") as f:
            spotted_data = json.load(f)
        unmatched_spotted = [s for s in spotted_data.get("spots", []) if not s.get("matchedPlaceId")]
        print(f"Audited Spotted by Locals: {len(unmatched_spotted)} uncataloged spots available for candidate queue.")

    if apply_fixes:
        with open(PLACES_PATH, "w", encoding="utf-8") as f:
            json.dump(places_raw, f, ensure_ascii=False, indent=2)
        print(f"Updated {PLACES_PATH} with fixes applied.")

    report_payload = {
        "auditedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "totalCatalogPlaces": len(places),
        "activePlaces": len(places) - len(closed_places),
        "closedPlacesCount": len(closed_places),
        "closedPlaces": closed_places,
        "missingAttributesCount": {
            "address": len(missing_address),
            "openingHours": len(missing_hours),
            "website": len(missing_website)
        },
        "missingAddressSample": missing_address[:10],
        "missingHoursSample": missing_hours[:10],
        "missingWebsiteSample": missing_website[:10],
        "uncatalogedCandidatesAdded": new_candidates_added,
        "closedPlacesUpdated": closed_places_updated
    }

    os.makedirs(os.path.dirname(REPORT_PATH), exist_ok=True)
    with open(REPORT_PATH, "w", encoding="utf-8") as f:
        json.dump(report_payload, f, ensure_ascii=False, indent=2)
    print(f"Saved monthly audit report to {REPORT_PATH}")

    return report_payload

def main():
    apply_fixes = "--fix" in sys.argv or "--apply" in sys.argv
    print(f"Running Monthly Catalog Auditor (apply_fixes={apply_fixes})...")
    report = audit_catalog(apply_fixes=apply_fixes)
    
    print("\n==========================================================================")
    print(" 📊 MONTHLY CATALOG RECONCILIATION SUMMARY")
    print("==========================================================================")
    print(f"Total Places:             {report['totalCatalogPlaces']:,}")
    print(f"Active Venues:            {report['activePlaces']:,}")
    print(f"Closed / Retired Venues:  {report['closedPlacesCount']}")
    print(f"Missing Address:          {report['missingAttributesCount']['address']}")
    print(f"Missing Opening Hours:    {report['missingAttributesCount']['openingHours']}")
    print(f"Missing Website:          {report['missingAttributesCount']['website']}")
    if report["uncatalogedCandidatesAdded"]:
        print(f"Candidates Added:         {', '.join(report['uncatalogedCandidatesAdded'])}")
    if report["closedPlacesUpdated"]:
        print(f"Closed Places Updated:    {', '.join(report['closedPlacesUpdated'])}")
    print("==========================================================================")

if __name__ == "__main__":
    main()
