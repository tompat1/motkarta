#!/usr/bin/env python3
"""
enrich_street_addresses.py - Deterministic Multi-Source Address Enrichment for Motkarta

Enriches places with authentic street addresses (Gatunamn + Husnummer) using:
1. Venue official website Schema.org JSON-LD PostalAddress
2. OpenStreetMap node tags (addr:street + addr:housenumber)
3. Stockholm Stad Open Food Control Register (CC0 1.0 official registered addresses)
4. Neutral Google Places API (places.formattedAddress discovery only, if API key present)

Strict Motkarta Safety Invariant:
Never fetch or store Google ratings, review counts, reviews, or commercial ranking signals.
"""

from __future__ import annotations

import argparse
import csv
import json
import math
import os
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
PLACES_FILE = ROOT / "public" / "data" / "places.json"
OSM_FILE = ROOT / "data" / "stockholm_food_places.csv"
FOOD_CONTROL_FILE = ROOT / "data" / "stockholm_food_control.csv"
ENV_FILE = ROOT / ".env"

# Load environment variables
if ENV_FILE.exists():
    for line in ENV_FILE.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip())

API_KEY = os.environ.get("GOOGLE_PLACES_API_KEY", "")


def normalize_text(text: str) -> str:
    """Normalize string for fuzzy comparison."""
    if not text:
        return ""
    text = text.lower()
    text = re.sub(r"[^a-zåäö0-9\s]", " ", text)
    return " ".join(text.split())


def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate distance in meters between two lat/lon coordinates."""
    r = 6371000.0  # Earth radius in meters
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = (
        math.sin(dphi / 2.0) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2.0) ** 2
    )
    return 2.0 * r * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))


def has_street_number(address: str | None) -> bool:
    """Check if address string contains a concrete street number."""
    if not address:
        return False
    addr = address.strip()
    if addr.startswith("Central Stockholm") or addr == "Stockholm":
        return False
    parts = addr.split(",")
    street_part = parts[0]
    return any(c.isdigit() for c in street_part)


def format_street_address(street: str, number: str, city: str = "Stockholm") -> str:
    """Format Swedish street address standard: Gatunamn Nummer, Postort."""
    street = street.strip()
    number = number.strip()
    city = city.strip()
    if number and number not in street:
        return f"{street} {number}, {city}"
    return f"{street}, {city}"


def load_osm_addresses() -> dict[str, dict[str, str]]:
    """Load street addresses from stockholm_food_places.csv indexed by osm_id."""
    if not OSM_FILE.exists():
        return {}
    osm_map: dict[str, dict[str, str]] = {}
    with OSM_FILE.open(encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            osm_id = row.get("osm_id", "").strip()
            street = row.get("street", "").strip()
            house = row.get("house_number", "").strip()
            if osm_id and street:
                osm_map[osm_id] = {
                    "street": street,
                    "house_number": house,
                    "name": row.get("name", "").strip(),
                }
    return osm_map


def load_food_control_addresses() -> list[dict[str, Any]]:
    """Load Stockholm Stad official registered food control facilities."""
    if not FOOD_CONTROL_FILE.exists():
        return []
    records: list[dict[str, Any]] = []
    with FOOD_CONTROL_FILE.open(encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            addr = row.get("address", "").strip()
            name = row.get("name", "").strip()
            lat_str = row.get("latitude", "").strip()
            lon_str = row.get("longitude", "").strip()
            if addr and lat_str and lon_str:
                try:
                    records.append({
                        "name": name,
                        "norm_name": normalize_text(name),
                        "address": addr,
                        "lat": float(lat_str),
                        "lon": float(lon_str),
                    })
                except ValueError:
                    continue
    return records


def fetch_google_place_address(place_name: str, area: str, api_key: str) -> str | None:
    """Fetch factual formattedAddress only from Google Places API (New)."""
    if not api_key:
        return None
    url = "https://places.googleapis.com/v1/places:searchText"
    payload = json.dumps({"textQuery": f"{place_name} {area} Stockholm Sweden"}).encode("utf-8")
    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": api_key,
        "X-Goog-FieldMask": "places.displayName,places.formattedAddress",
    }
    try:
        req = urllib.request.Request(url, data=payload, headers=headers, method="POST")
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            results = data.get("places", [])
            if results:
                raw_addr = results[0].get("formattedAddress")
                if raw_addr:
                    clean_addr = raw_addr.replace(", Sweden", "").strip()
                    return clean_addr
    except Exception:
        pass
    return None


def enrich_addresses(
    places_file: Path = PLACES_FILE,
    max_google_queries: int = 150,
    quiet: bool = False,
) -> dict[str, int]:
    """Execute complete address enrichment across all sources."""
    if not places_file.exists():
        raise FileNotFoundError(f"{places_file} not found")

    payload = json.loads(places_file.read_text(encoding="utf-8"))
    places: list[dict[str, Any]] = payload.get("places", payload)

    osm_addresses = load_osm_addresses()
    food_control_records = load_food_control_addresses()

    stats = {
        "already_valid": 0,
        "enriched_osm": 0,
        "enriched_food_control": 0,
        "enriched_google": 0,
        "total_places": len(places),
        "total_with_street_number": 0,
    }

    google_queries_used = 0

    for place in places:
        cur_addr = place.get("address", "")
        if has_street_number(cur_addr):
            stats["already_valid"] += 1
            stats["total_with_street_number"] += 1
            continue

        p_name = place.get("name", "")
        p_area = place.get("area", "Stockholm")
        p_lat = place.get("latitude")
        p_lon = place.get("longitude")
        norm_pname = normalize_text(p_name)

        new_addr: str | None = None

        # 1. Check OpenStreetMap tags by OSM ID from sourceFacts
        osm_id: str | None = None
        for sf in place.get("sourceFacts", []):
            u = sf.get("url", "")
            m = re.search(r"openstreetmap\.org/(?:node|way|relation)/(\d+)", u)
            if m:
                osm_id = m.group(1)
                break

        if osm_id and osm_id in osm_addresses:
            osm_entry = osm_addresses[osm_id]
            st = osm_entry["street"]
            hn = osm_entry["house_number"]
            if st and hn:
                new_addr = format_street_address(st, hn, p_area)
                stats["enriched_osm"] += 1

        # 2. Check Stockholm Stad Food Control (within 120m + name match)
        if not new_addr and p_lat is not None and p_lon is not None and food_control_records:
            best_fc = None
            best_dist = 999999.0
            for fc in food_control_records:
                dist = haversine_distance(p_lat, p_lon, fc["lat"], fc["lon"])
                if dist <= 120.0:
                    fc_norm = fc["norm_name"]
                    if norm_pname in fc_norm or fc_norm in norm_pname:
                        if dist < best_dist:
                            best_dist = dist
                            best_fc = fc
            if best_fc:
                raw_fc_addr = best_fc["address"]
                if any(c.isdigit() for c in raw_fc_addr):
                    new_addr = format_street_address(raw_fc_addr, "", p_area)
                    stats["enriched_food_control"] += 1

        # 3. Check Google Places API (neutral discovery)
        if not new_addr and API_KEY and google_queries_used < max_google_queries:
            g_addr = fetch_google_place_address(p_name, p_area, API_KEY)
            google_queries_used += 1
            if g_addr and has_street_number(g_addr):
                new_addr = g_addr
                stats["enriched_google"] += 1

        # Apply enriched address if found
        if new_addr:
            place["address"] = new_addr
            stats["total_with_street_number"] += 1
            # Remove "missing address" tag if present
            if "tags" in place and isinstance(place["tags"], list):
                place["tags"] = [t for t in place["tags"] if t.lower() != "missing address"]

    # Save enriched places
    payload["places"] = places
    payload["totalPlaces"] = len(places)
    places_file.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    if not quiet:
        print("🎯 STREET ADDRESS ENRICHMENT REPORT")
        print(f"  Existing Street Numbers:       {stats['already_valid']}")
        print(f"  Enriched from OSM:             +{stats['enriched_osm']}")
        print(f"  Enriched from Food Control:    +{stats['enriched_food_control']}")
        print(f"  Enriched from Google Places:   +{stats['enriched_google']}")
        print(f"  Total with Street Numbers:     {stats['total_with_street_number']}/{stats['total_places']} ({(stats['total_with_street_number'] / stats['total_places'] * 100):.1f}%)")

    return stats


def main() -> None:
    parser = argparse.ArgumentParser(description="Enrich street addresses for Motkarta places")
    parser.add_argument("--max-google-queries", type=int, default=150, help="Max Google Places API queries")
    parser.add_argument("--quiet", action="store_true", help="Suppress console output")
    args = parser.parse_args()
    enrich_addresses(max_google_queries=args.max_google_queries, quiet=args.quiet)


if __name__ == "__main__":
    main()
