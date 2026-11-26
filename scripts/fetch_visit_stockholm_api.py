#!/usr/bin/env python3
"""Fetch food & drink venues from the official Visit Stockholm Open API (CC BY 4.0).

API docs: https://api.visitstockholm.com/documentation/
Endpoint: https://api.visitstockholm.com/api/public-v1/objects/

Filters to food, restaurant, café, bakery, bar, and pub objects, excludes commercial
chains via motkarta.catalog_exclusions, and saves structured discovery leads to
data/visit_stockholm_api_places.json.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from motkarta.catalog_exclusions import is_excluded_catalog_name  # noqa: E402

USER_AGENT = "MotkartaBot/1.0 (+https://motkarta.rynell.org)"
API_BASE_URL = "https://api.visitstockholm.com/api/public-v1/objects/"
DEFAULT_OUTPUT = ROOT / "data" / "visit_stockholm_api_places.json"

FOOD_LABEL_KEYWORDS = (
    "restaurant",
    "restaurang",
    "café",
    "cafe",
    "coffee",
    "kafé",
    "bakery",
    "bageri",
    "konditori",
    "bar",
    "pub",
    "bistro",
    "brasserie",
    "food",
    "dining",
    "pizzeria",
    "sushi",
    "ramen",
    "tapas",
    "wine",
    "vinbar",
    "cocktail",
    "brewery",
    "bryggeri",
    "deli",
    "saluhall",
    "market hall",
    "gastropub",
)

NON_FOOD_LABEL_KEYWORDS = (
    "hotel",
    "hotell",
    "museum",
    "gallery",
    "galleri",
    "shop",
    "store",
    "boutique",
    "park",
    "beach",
    "church",
    "theater",
    "theatre",
    "cinema",
    "spa",
    "sauna",
    "tour",
    "sightseeing",
    "sport",
    "arena",
    "concert",
    "nightclub",
)


def normalize_name(value: str) -> str:
    text = unicodedata.normalize("NFKD", str(value or "").lower())
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    return re.sub(r"[^a-z0-9]+", "", text)


def is_food_and_drink_label(label: str) -> bool:
    lower = str(label or "").strip().lower()
    if not lower:
        return False
    # Allow "Coffee Shop / Café" explicitly even though "shop" is in NON_FOOD
    if "coffee shop" in lower or "café" in lower or "cafe" in lower:
        return True
    if any(bad in lower for bad in NON_FOOD_LABEL_KEYWORDS):
        return False
    return any(good in lower for good in FOOD_LABEL_KEYWORDS)


def infer_kind_from_label(label: str) -> str:
    lower = str(label or "").lower()
    if any(k in lower for k in ("bakery", "bageri", "konditori", "pastry")):
        return "Bakery"
    if any(k in lower for k in ("coffee", "café", "cafe", "kafé")):
        return "Café"
    return "Restaurant"


def infer_area_from_address(address: str) -> str:
    lower = str(address or "").lower()
    mapping = [
        ("södermalm", "Södermalm"),
        ("gamla stan", "Gamla Stan"),
        ("kungsholmen", "Kungsholmen"),
        ("vasastan", "Vasastan"),
        ("östermalm", "Östermalm"),
        ("djurgården", "Djurgården"),
        ("norrmalm", "Norrmalm"),
        ("hägersten", "Söderort"),
        ("johanneshov", "Söderort"),
        ("årsta", "Söderort"),
        ("enskede", "Söderort"),
        ("farsta", "Söderort"),
        ("skärholmen", "Söderort"),
        ("bromma", "Västerort"),
        ("sundbyberg", "Västerort"),
        ("kista", "Västerort"),
        ("solna", "Norrort"),
        ("nacka", "Söderort"),
    ]
    for token, area in mapping:
        if token in lower:
            return area
    return "Stockholm"


def extract_coordinates(obj: dict[str, Any]) -> tuple[float | None, float | None]:
    candidates: list[Any] = []
    if isinstance(obj.get("location"), dict):
        candidates.append(obj["location"])
    for loc in obj.get("locations") or []:
        if isinstance(loc, dict):
            candidates.append(loc)
    contact = obj.get("contact")
    if isinstance(contact, dict):
        for addr in contact.get("addresses") or []:
            if isinstance(addr, dict) and isinstance(addr.get("location"), dict):
                candidates.append(addr["location"])

    for cand in candidates:
        lat = cand.get("lat") or cand.get("latitude")
        lng = cand.get("lng") or cand.get("lon") or cand.get("longitude")
        if lat is not None and lng is not None:
            try:
                lat_f, lng_f = float(lat), float(lng)
                if 59.15 <= lat_f <= 59.55 and 17.65 <= lng_f <= 18.35:
                    return lat_f, lng_f
            except (TypeError, ValueError):
                continue
    return None, None


def parse_visit_stockholm_object(obj: dict[str, Any]) -> dict[str, Any] | None:
    title = str(obj.get("title") or "").strip()
    label = str(obj.get("label") or "").strip()
    if not title or not is_food_and_drink_label(label) or is_excluded_catalog_name(title):
        return None

    contact = obj.get("contact") if isinstance(obj.get("contact"), dict) else {}
    addresses = contact.get("addresses") if isinstance(contact.get("addresses"), list) else []
    raw_address = ""
    if addresses and isinstance(addresses[0], dict):
        raw_address = str(addresses[0].get("address") or "").strip()

    lat, lng = extract_coordinates(obj)
    area = infer_area_from_address(raw_address)
    entry: dict[str, Any] = {
        "id": str(obj.get("id") or ""),
        "name": title,
        "kind": infer_kind_from_label(label),
        "label": label,
        "area": area,
        "address": raw_address,
        "url": str(obj.get("href") or "https://www.visitstockholm.com"),
        "website": str(contact.get("href") or "").strip(),
        "note": str(obj.get("text") or "").strip()[:320],
    }
    if lat is not None and lng is not None:
        entry["latitude"] = lat
        entry["longitude"] = lng
    return entry


def fetch_all_food_objects(max_pages: int = 220, page_size: int = 100, delay: float = 0.08) -> list[dict[str, Any]]:
    url: str | None = f"{API_BASE_URL}?page=1&page_size={page_size}"
    items: list[dict[str, Any]] = []
    seen_norms: set[str] = set()
    page_num = 0

    while url and page_num < max_pages:
        page_num += 1
        req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        try:
            with urllib.request.urlopen(req, timeout=20) as resp:
                payload = json.loads(resp.read().decode("utf-8"))
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
            print(f"WARN page {page_num} failed: {exc}", file=sys.stderr)
            break

        for obj in payload.get("results") or []:
            parsed = parse_visit_stockholm_object(obj)
            if not parsed:
                continue
            key = normalize_name(parsed["name"])
            if not key or key in seen_norms:
                continue
            seen_norms.add(key)
            items.append(parsed)

        url = payload.get("next")
        if url and delay > 0:
            time.sleep(delay)

    return items


def main() -> int:
    parser = argparse.ArgumentParser(description="Fetch Stockholm food & drink places from Visit Stockholm Open API (CC BY 4.0).")
    parser.add_argument("--max-pages", type=int, default=220, help="Maximum API pages to fetch")
    parser.add_argument("--page-size", type=int, default=100, help="Page size parameter")
    parser.add_argument("--delay", type=float, default=0.05, help="Delay between requests in seconds")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT, help="Output JSON file")
    args = parser.parse_args()

    items = fetch_all_food_objects(max_pages=args.max_pages, page_size=args.page_size, delay=args.delay)
    geolocated = sum(1 for i in items if "latitude" in i)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(
            {
                "source": "Visit Stockholm Open API (CC BY 4.0)",
                "license": "CC BY 4.0 — Stockholm Business Region AB",
                "apiUrl": API_BASE_URL,
                "fetchedAt": datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
                "totalFoodVenues": len(items),
                "geolocatedVenues": geolocated,
                "places": items,
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    print(f"Fetched {len(items)} food & drink venues ({geolocated} geolocated) from Visit Stockholm Open API -> {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
