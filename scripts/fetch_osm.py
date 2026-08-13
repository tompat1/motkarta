"""Fetch a Stockholm food-place baseline from OpenStreetMap/Overpass.

Run locally: python scripts/fetch_osm.py
Output: data/stockholm_food_places.csv
"""
import argparse
import csv
import sys
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from motkarta.normalize import normalize_osm_establishment_type

URLS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
]
BBOX = "59.20,17.75,59.47,18.25"
QUERY = f'''[out:json][timeout:180];(
 nwr["amenity"~"restaurant|cafe|fast_food|food_court"]({BBOX});
 nwr["shop"~"bakery|pastry|confectionery|coffee"]({BBOX});
 nwr["craft"="coffee_roaster"]({BBOX});
);out center;'''
FIELDS = ["osm_type", "osm_id", "name", "category", "establishment_type", "cuisine", "opening_hours", "street", "house_number", "website", "latitude", "longitude", "source"]


def fetch_overpass(query: str, urls: list[str]) -> dict:
    headers = {
        "User-Agent": "motkarta/0.1 (Stockholm independent food map; local research)",
        "Accept": "application/json",
    }
    errors: list[str] = []
    for url in urls:
        try:
            response = requests.post(url, data={"data": query}, headers=headers, timeout=240)
            response.raise_for_status()
            return response.json()
        except requests.RequestException as error:
            body = getattr(error.response, "text", "") if getattr(error, "response", None) is not None else ""
            errors.append(f"{url}: {error} {body[:500]}")
    raise RuntimeError("Overpass request failed:\n" + "\n".join(errors))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", default=str(Path(__file__).parents[1] / "data" / "stockholm_food_places.csv"))
    parser.add_argument("--url", action="append", dest="urls", help="Override Overpass endpoint. Repeat for fallbacks.")
    args = parser.parse_args()

    payload = fetch_overpass(QUERY, args.urls or URLS)
    rows = []
    for element in payload["elements"]:
        tags = element.get("tags", {})
        center = element.get("center", element)
        if not tags.get("name") or center.get("lat") is None:
            continue
        category = tags.get("amenity") or tags.get("shop") or tags.get("craft")
        establishment_type = normalize_osm_establishment_type(category or "", tags.get("cuisine", ""))
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
            "source": "OpenStreetMap",
        })
    target = Path(args.output)
    target.parent.mkdir(exist_ok=True)
    with target.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=FIELDS)
        writer.writeheader(); writer.writerows(rows)
    print(f"Saved {len(rows)} places to {target}")

if __name__ == "__main__":
    main()
