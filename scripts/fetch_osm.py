"""Fetch a Stockholm food-place baseline from OpenStreetMap/Overpass.

Run locally: python scripts/fetch_osm.py
Output: data/stockholm_food_places.csv
"""
import argparse
import csv
import hashlib
import json
import sys
from datetime import UTC, datetime
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from motkarta.normalize import normalize_osm_establishment_type

URLS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
]
BBOX = "59.20,17.75,59.47,18.25"
MUNICIPALITY_QUERY = '''[out:json][timeout:180];
area["boundary"="administrative"]["name"="Stockholms kommun"]->.searchArea;
(
 nwr["amenity"~"restaurant|cafe|fast_food|food_court|bar|pub"](area.searchArea);
 nwr["shop"~"bakery|pastry|confectionery|coffee"](area.searchArea);
 nwr["craft"="coffee_roaster"](area.searchArea);
);out center meta;'''
BBOX_QUERY = f'''[out:json][timeout:180];(
 nwr["amenity"~"restaurant|cafe|fast_food|food_court|bar|pub"]({BBOX});
 nwr["shop"~"bakery|pastry|confectionery|coffee"]({BBOX});
 nwr["craft"="coffee_roaster"]({BBOX});
);out center meta;'''
FIELDS = [
    "osm_type",
    "osm_id",
    "name",
    "category",
    "establishment_type",
    "cuisine",
    "opening_hours",
    "street",
    "house_number",
    "website",
    "latitude",
    "longitude",
    "osm_timestamp",
    "source",
]


def fetch_overpass(query: str, urls: list[str]) -> tuple[dict, str]:
    headers = {
        "User-Agent": "motkarta/0.1 (Stockholm independent food map; local research)",
        "Accept": "application/json",
    }
    errors: list[str] = []
    for url in urls:
        try:
            response = requests.post(url, data={"data": query}, headers=headers, timeout=240)
            response.raise_for_status()
            return response.json(), url
        except requests.RequestException as error:
            body = getattr(error.response, "text", "") if getattr(error, "response", None) is not None else ""
            errors.append(f"{url}: {error} {body[:500]}")
    raise RuntimeError("Overpass request failed:\n" + "\n".join(errors))


def load_or_fetch_payload(
    query: str,
    urls: list[str],
    cache_path: Path,
    metadata_path: Path,
    refresh: bool,
    boundary: str,
) -> dict:
    query_hash = hashlib.sha256(query.encode("utf-8")).hexdigest()
    if cache_path.exists() and not refresh:
        print(f"Using cached Overpass response from {cache_path}")
        return json.loads(cache_path.read_text(encoding="utf-8"))

    payload, endpoint = fetch_overpass(query, urls)
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    cache_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    metadata = {
        "source": "OpenStreetMap Overpass API",
        "source_url": endpoint,
        "license": "OpenStreetMap data is available under the Open Database License (ODbL).",
        "boundary": boundary,
        "boundary_reference": "OSM administrative area named Stockholms kommun" if boundary == "municipality" else f"Approximate bbox {BBOX}",
        "query_hash": query_hash,
        "fetched_at": datetime.now(UTC).isoformat(),
        "cache_path": str(cache_path),
        "element_count": len(payload.get("elements", [])),
    }
    metadata_path.parent.mkdir(parents=True, exist_ok=True)
    metadata_path.write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Cached Overpass response to {cache_path}")
    print(f"Wrote source metadata to {metadata_path}")
    return payload


def query_for_boundary(boundary: str) -> str:
    if boundary == "bbox":
        return BBOX_QUERY
    return MUNICIPALITY_QUERY


def rows_from_payload(payload: dict) -> list[dict]:
    rows = []
    for element in payload["elements"]:
        tags = element.get("tags", {})
        center = element.get("center", element)
        if not tags.get("name") or center.get("lat") is None:
            continue
        category = tags.get("amenity") or tags.get("shop") or tags.get("craft")
        establishment_type = normalize_osm_establishment_type(category or "", tags.get("cuisine", ""), name=tags["name"])
        if not establishment_type:
            continue
        rows.append({
            "osm_type": element["type"], "osm_id": element["id"],
            "name": tags["name"],
            "category": category,
            "establishment_type": establishment_type,
            "cuisine": tags.get("cuisine", ""), "opening_hours": tags.get("opening_hours", ""),
            "street": tags.get("addr:street", ""), "house_number": tags.get("addr:housenumber", ""),
            "website": tags.get("website", ""), "latitude": center["lat"], "longitude": center["lon"],
            "osm_timestamp": element.get("timestamp", ""),
            "source": "OpenStreetMap",
        })
    return rows


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", default=str(Path(__file__).parents[1] / "data" / "stockholm_food_places.csv"))
    parser.add_argument("--cache", default=str(Path(__file__).parents[1] / "data" / "raw" / "osm_stockholm_food_places.json"))
    parser.add_argument("--metadata", default=str(Path(__file__).parents[1] / "data" / "raw" / "osm_stockholm_food_places.metadata.json"))
    parser.add_argument("--refresh", action="store_true", help="Fetch from Overpass even when a cache file exists.")
    parser.add_argument("--boundary", choices=["municipality", "bbox"], default="municipality")
    parser.add_argument("--url", action="append", dest="urls", help="Override Overpass endpoint. Repeat for fallbacks.")
    args = parser.parse_args()

    query = query_for_boundary(args.boundary)
    payload = load_or_fetch_payload(
        query=query,
        urls=args.urls or URLS,
        cache_path=Path(args.cache),
        metadata_path=Path(args.metadata),
        refresh=args.refresh,
        boundary=args.boundary,
    )
    rows = rows_from_payload(payload)
    target = Path(args.output)
    target.parent.mkdir(exist_ok=True)
    with target.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=FIELDS)
        writer.writeheader(); writer.writerows(rows)
    print(f"Saved {len(rows)} places to {target}")

if __name__ == "__main__":
    main()
