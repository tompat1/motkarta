#!/usr/bin/env python3
"""
Unified Catalog Comparison Runner for Motkarta.

Compares Motkarta's catalog (public/data/places.json) against:
1. Google Places (Places API New)
2. OpenStreetMap / Mapy.cz baseline (data/stockholm_food_places.csv)
3. Known closure registries

Outputs: outputs/places_comparison_report.json
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import re
import sys
import time
from dataclasses import asdict
from datetime import datetime, timezone
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple

# Ensure repository root is on sys.path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from scripts.google_places_monthly_sync import (
    DEFAULT_PLACES_FILE,
    EXCLUDED_CHAINS,
    FORBIDDEN_VALUE_FIELDS,
    clean_text,
    distance_meters,
    fetch_google_places,
    is_excluded_chain,
    load_env,
    metadata_from_google_payload,
    normalized_name,
)

OSM_PLACES_FILE = ROOT / "data" / "stockholm_food_places.csv"
REPORT_OUTPUT_FILE = ROOT / "outputs" / "places_comparison_report.json"
CANDIDATE_QUEUE_FILE = ROOT / "outputs" / "candidate_queue.json"

KNOWN_CLOSED_REGISTRY: dict[str, str] = {
    "arirang": "Closed permanently in December 2025",
    "bistrosud": "Closed in 2025",
    "oaxenkrog": "Closed permanently",
    "restaurangvolt": "Closed permanently",
    "agrikultur": "Closed permanently",
}

DEFAULT_COMPARE_QUERIES = [
    "new independent restaurants Stockholm",
    "new cafes Stockholm",
    "new bakeries Stockholm",
    "new coffee shops Stockholm",
    "independent pubs Stockholm",
]


def normalize_compare_name(name: str) -> str:
    return normalized_name(name).replace("é", "e").replace("è", "e").replace("ê", "e").replace("ü", "u")


def name_similarity(a: str, b: str, norm_a: Optional[str] = None, norm_b: Optional[str] = None) -> float:
    na = norm_a if norm_a is not None else normalize_compare_name(a)
    nb = norm_b if norm_b is not None else normalize_compare_name(b)
    if not na or not nb:
        return 0.0
    if na == nb or na in nb or nb in na:
        return 1.0
    return SequenceMatcher(None, na, nb).ratio()


def load_catalog(places_path: Path = DEFAULT_PLACES_FILE) -> tuple[dict[str, Any], list[dict[str, Any]], dict[str, dict[str, Any]]]:
    if not places_path.exists():
        raise FileNotFoundError(f"Places catalog not found at {places_path}")
    data = json.loads(places_path.read_text(encoding="utf-8"))
    places = data.get("places", []) if isinstance(data, dict) else data
    exact_map: dict[str, dict[str, Any]] = {}
    for p in places:
        norm = normalize_compare_name(p.get("name", ""))
        p["_norm"] = norm
        if norm:
            exact_map[norm] = p
    return data, places, exact_map


def load_osm_places(osm_path: Path = OSM_PLACES_FILE) -> list[dict[str, Any]]:
    if not osm_path.exists():
        print(f"Notice: OSM places file not found at {osm_path}")
        return []
    rows: list[dict[str, Any]] = []
    with open(osm_path, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            name = clean_text(row.get("name"))
            if not name or is_excluded_chain(name):
                continue
            try:
                lat = float(row.get("latitude", 0))
                lon = float(row.get("longitude", 0))
            except (ValueError, TypeError):
                continue
            rows.append({
                "osm_id": row.get("osm_id"),
                "name": name,
                "establishment_type": row.get("establishment_type") or "Restaurant",
                "cuisine": row.get("cuisine", ""),
                "street": row.get("street", ""),
                "house_number": row.get("house_number", ""),
                "opening_hours": row.get("opening_hours", ""),
                "website": row.get("website", ""),
                "latitude": lat,
                "longitude": lon,
            })
    return rows


def find_matching_catalog_place(
    target_name: str,
    target_lat: Optional[float],
    target_lon: Optional[float],
    catalog: list[dict[str, Any]],
    exact_map: Optional[dict[str, dict[str, Any]]] = None,
    distance_threshold_m: float = 85.0,
    name_similarity_threshold: float = 0.72,
) -> Optional[dict[str, Any]]:
    target_norm = normalize_compare_name(target_name)
    if exact_map and target_norm in exact_map:
        return exact_map[target_norm]

    best_match = None
    best_score = 0.0

    for place in catalog:
        place_name = place.get("name", "")
        place_norm = place.get("_norm") or normalize_compare_name(place_name)

        if target_norm == place_norm:
            return place

        p_lat = place.get("latitude")
        p_lon = place.get("longitude")

        dist = None
        if target_lat is not None and target_lon is not None and p_lat is not None and p_lon is not None:
            if abs(target_lat - p_lat) > 0.015 or abs(target_lon - p_lon) > 0.025:
                continue
            dist = distance_meters(target_lat, target_lon, p_lat, p_lon)

        sim = name_similarity(target_name, place_name, target_norm, place_norm)

        # Exact location match + decent name match
        if dist is not None and dist < distance_threshold_m and sim >= 0.55:
            return place

        # High name similarity + proximity or unknown location
        if sim >= name_similarity_threshold:
            if dist is None or dist < 600.0:
                if sim > best_score:
                    best_score = sim
                    best_match = place

    return best_match if best_score >= name_similarity_threshold else None


def run_comparison(
    api_key: str = "",
    places_path: Path = DEFAULT_PLACES_FILE,
    osm_path: Path = OSM_PLACES_FILE,
    queries: Optional[list[str]] = None,
    skip_google: bool = False,
    skip_osm: bool = False,
) -> dict[str, Any]:
    places_data, catalog, exact_map = load_catalog(places_path)
    print(f"Loaded Motkarta catalog: {len(catalog):,} places.")

    new_candidates: list[dict[str, Any]] = []
    detected_closures: list[dict[str, Any]] = []
    missing_attributes: list[dict[str, Any]] = []

    seen_candidate_names: set[str] = {normalized_name(p.get("name", "")) for p in catalog}

    # 1. Audit Known Closed Registry
    for place in catalog:
        p_norm = normalized_name(place.get("name", ""))
        is_already_flagged = (
            place.get("lifecycleState") == "closed" or
            "Closed" in place.get("tags", []) or
            "closed" in str(place.get("validationLabel", "")).lower()
        )
        if p_norm in KNOWN_CLOSED_REGISTRY and not is_already_flagged:
            detected_closures.append({
                "id": place.get("id"),
                "name": place.get("name"),
                "area": place.get("area"),
                "source": "Curated Closure Registry",
                "status": "CLOSED_PERMANENTLY",
                "reason": KNOWN_CLOSED_REGISTRY[p_norm],
            })

    # 2. Google Places (New API) Comparison
    if not skip_google and api_key:
        print(f"\nQuerying Google Places (Places API New)...")
        google_results = fetch_google_places(api_key, queries or DEFAULT_COMPARE_QUERIES)
        print(f"Processing {len(google_results)} Google Places records...")

        for item in google_results:
            name_val = item.get("displayName")
            name_str = name_val.get("text") if isinstance(name_val, dict) else (item.get("name") or "")
            if not name_str or is_excluded_chain(name_str):
                continue

            metadata = metadata_from_google_payload(item, None, scrape_photo=False)
            business_status = item.get("businessStatus") or "OPERATIONAL"

            matched = find_matching_catalog_place(
                metadata.name,
                metadata.latitude,
                metadata.longitude,
                catalog,
                exact_map=exact_map,
            )

            if matched is not None:
                # Check for closures on existing venues
                if business_status in ("CLOSED_PERMANENTLY", "CLOSED_TEMPORARILY"):
                    is_flagged = matched.get("lifecycleState") == "closed" or "Closed" in matched.get("tags", [])
                    if not is_flagged:
                        detected_closures.append({
                            "id": matched.get("id"),
                            "name": matched.get("name"),
                            "area": matched.get("area"),
                            "source": "Google Places",
                            "status": business_status,
                            "reason": f"Google reports {business_status}",
                        })
                # Check for missing attributes
                missing_fields = []
                if not matched.get("address") and metadata.address:
                    missing_fields.append("address")
                if not matched.get("website") and metadata.website:
                    missing_fields.append("website")
                if missing_fields:
                    missing_attributes.append({
                        "id": matched.get("id"),
                        "name": matched.get("name"),
                        "area": matched.get("area"),
                        "source": "Google Places",
                        "canEnrich": missing_fields,
                        "suggestedAddress": metadata.address if "address" in missing_fields else None,
                        "suggestedWebsite": metadata.website if "website" in missing_fields else None,
                    })
            else:
                # New candidate discovery
                norm = normalized_name(metadata.name)
                if norm not in seen_candidate_names and business_status == "OPERATIONAL":
                    seen_candidate_names.add(norm)
                    new_candidates.append({
                        "source": "Google Places",
                        "name": metadata.name,
                        "googlePlaceId": metadata.google_place_id,
                        "address": metadata.address,
                        "latitude": metadata.latitude,
                        "longitude": metadata.longitude,
                        "website": metadata.website,
                        "discoveredAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
                    })

    # 3. OpenStreetMap / Mapy Baseline Comparison
    if not skip_osm:
        print(f"\nComparing against OpenStreetMap / Mapy baseline ({osm_path})...")
        osm_places = load_osm_places(osm_path)
        print(f"Processing {len(osm_places):,} OpenStreetMap food amenities...")

        for osm in osm_places:
            osm_name = osm["name"]
            matched = find_matching_catalog_place(
                osm_name,
                osm["latitude"],
                osm["longitude"],
                catalog,
                exact_map=exact_map,
            )

            if matched is not None:
                # Check missing attributes
                missing_fields = []
                addr = f"{osm['street']} {osm['house_number']}".strip()
                if not matched.get("address") and addr:
                    missing_fields.append("address")
                if not matched.get("website") and osm["website"]:
                    missing_fields.append("website")
                if not matched.get("openingHours") and osm["opening_hours"]:
                    missing_fields.append("openingHours")
                if missing_fields:
                    missing_attributes.append({
                        "id": matched.get("id"),
                        "name": matched.get("name"),
                        "area": matched.get("area"),
                        "source": "OpenStreetMap",
                        "canEnrich": missing_fields,
                        "suggestedAddress": addr if "address" in missing_fields else None,
                        "suggestedWebsite": osm["website"] if "website" in missing_fields else None,
                        "suggestedHours": osm["opening_hours"] if "openingHours" in missing_fields else None,
                    })
            else:
                norm = normalized_name(osm_name)
                if norm not in seen_candidate_names and len(norm) > 2:
                    seen_candidate_names.add(norm)
                    addr = f"{osm['street']} {osm['house_number']}".strip()
                    new_candidates.append({
                        "source": "OpenStreetMap",
                        "name": osm_name,
                        "kind": osm["establishment_type"],
                        "cuisine": osm["cuisine"],
                        "address": addr,
                        "latitude": osm["latitude"],
                        "longitude": osm["longitude"],
                        "website": osm["website"],
                        "openingHours": osm["opening_hours"],
                        "discoveredAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
                    })

    # Deduplicate missing attributes by catalog ID
    deduped_missing: dict[int, dict[str, Any]] = {}
    for item in missing_attributes:
        pid = item["id"]
        if pid not in deduped_missing:
            deduped_missing[pid] = item
        else:
            for field in item["canEnrich"]:
                if field not in deduped_missing[pid]["canEnrich"]:
                    deduped_missing[pid]["canEnrich"].append(field)
            for k in ("suggestedAddress", "suggestedWebsite", "suggestedHours"):
                if item.get(k) and not deduped_missing[pid].get(k):
                    deduped_missing[pid][k] = item[k]

    report = {
        "generatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "summary": {
            "catalogTotalPlaces": len(catalog),
            "newCandidatesFound": len(new_candidates),
            "detectedClosuresCount": len(detected_closures),
            "placesWithMissingAttributes": len(deduped_missing),
        },
        "detectedClosures": detected_closures,
        "newCandidates": new_candidates,
        "missingAttributes": list(deduped_missing.values()),
    }

    return report


def print_report_summary(report: dict[str, Any]) -> None:
    summary = report["summary"]
    print("\n==========================================================================")
    print(" 📍 MOTKARTA CATALOG AUDIT & COMPARISON REPORT")
    print("==========================================================================")
    print(f"Total Places in Catalog:        {summary['catalogTotalPlaces']:,}")
    print(f"New Candidates Discovered:      {summary['newCandidatesFound']:,}")
    print(f"Detected Closures / Retired:    {summary['detectedClosuresCount']}")
    print(f"Places with Enrichable Data:    {summary['placesWithMissingAttributes']}")
    print("==========================================================================")

    if report["detectedClosures"]:
        print("\n🚨 DETECTED CLOSURES / RETIRED VENUES:")
        for c in report["detectedClosures"]:
            print(f"  • {c['name']} ({c.get('area', 'Stockholm')}) — {c['status']}: {c['reason']} [{c['source']}]")

    if report["newCandidates"]:
        print(f"\n✨ NEW CANDIDATE DISCOVERIES (Sample of {min(10, len(report['newCandidates']))}):")
        for cand in report["newCandidates"][:10]:
            loc = f"({cand['address']})" if cand.get("address") else ""
            print(f"  • {cand['name']} {loc} — [{cand['source']}]")

    if report["missingAttributes"]:
        print(f"\n🛠️ ENRICHMENT OPPORTUNITIES (Sample of {min(5, len(report['missingAttributes']))}):")
        for m in report["missingAttributes"][:5]:
            fields = ", ".join(m["canEnrich"])
            print(f"  • {m['name']} (#{m['id']}) — missing: {fields}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--places", type=Path, default=DEFAULT_PLACES_FILE)
    parser.add_argument("--osm", type=Path, default=OSM_PLACES_FILE)
    parser.add_argument("--output", type=Path, default=REPORT_OUTPUT_FILE)
    parser.add_argument("--skip-google", action="store_true", help="Skip Google Places queries.")
    parser.add_argument("--skip-osm", action="store_true", help="Skip OpenStreetMap comparison.")
    parser.add_argument("--dry-run", action="store_true", default=True, help="Run audit without writing to production catalog.")
    args = parser.parse_args()

    load_env()
    api_key = os.environ.get("GOOGLE_PLACES_API_KEY", "")

    report = run_comparison(
        api_key=api_key,
        places_path=args.places,
        osm_path=args.osm,
        skip_google=args.skip_google,
        skip_osm=args.skip_osm,
    )

    args.output.parent.mkdir(parents=True, exist_ok=True)
    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)

    print_report_summary(report)
    print(f"\nFull detailed audit report saved to: {args.output}")


if __name__ == "__main__":
    main()
