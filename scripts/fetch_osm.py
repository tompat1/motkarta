"""Fetch a Stockholm food-place baseline from OpenStreetMap/Overpass.

Run locally: python scripts/fetch_osm.py
Output: data/stockholm_food_places.csv
"""
from pathlib import Path
import csv
import sys
import requests

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from motkarta.normalize import normalize_osm_establishment_type

URL = "https://overpass-api.de/api/interpreter"
BBOX = "59.20,17.75,59.47,18.25"
QUERY = f'''[out:json][timeout:180];(
 nwr["amenity"~"restaurant|cafe|fast_food|food_court"]({BBOX});
 nwr["shop"~"bakery|pastry|confectionery|coffee"]({BBOX});
 nwr["craft"="coffee_roaster"]({BBOX});
);out center tags;'''
FIELDS = ["osm_type", "osm_id", "name", "category", "establishment_type", "cuisine", "opening_hours", "street", "house_number", "website", "latitude", "longitude", "source"]

def main():
    response = requests.post(URL, data={"data": QUERY}, timeout=240)
    response.raise_for_status()
    rows = []
    for element in response.json()["elements"]:
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
    target = Path(__file__).parents[1] / "data" / "stockholm_food_places.csv"
    target.parent.mkdir(exist_ok=True)
    with target.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=FIELDS)
        writer.writeheader(); writer.writerows(rows)
    print(f"Saved {len(rows)} places to {target}")

if __name__ == "__main__":
    main()
