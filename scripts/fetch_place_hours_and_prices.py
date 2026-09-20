#!/usr/bin/env python3
"""
fetch_place_hours_and_prices.py - Website Schema.org & Menu Price Extraction for Motkarta

Extracts and standardizes:
1. Opening Hours:
   - Schema.org JSON-LD openingHoursSpecification / openingHours
   - Swedish text schedule regex
   - Converts to standard compact format (e.g. "Mo-Fr 11:00-22:00; Sa 12:00-23:00")
2. Price Tiers & SEK Brackets:
   - Schema.org priceRange ("$", "$$", "$$$", "$$$$")
   - Swedish menu prices (dagens lunch, varmrätter)
   - Standardizes into 4 tiers:
     Tier 1 ($): < 150 SEK (Bakeries, street food, espresso bars, fika)
     Tier 2 ($$): 150–350 SEK (Casual dining, trattorias, ramen, pizzerias)
     Tier 3 ($$$): 350–750 SEK (Gastro, upscale dinner, fine dining)
     Tier 4 ($$$$): > 750 SEK (Tasting menu, luxury)
"""

from __future__ import annotations

import argparse
import json
import re
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, UTC
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
PLACES_FILE = ROOT / "public" / "data" / "places.json"

DAY_MAP = {
    "monday": "Mo",
    "tuesday": "Tu",
    "wednesday": "We",
    "thursday": "Th",
    "friday": "Fr",
    "saturday": "Sa",
    "sunday": "Su",
    "mon": "Mo",
    "tue": "Tu",
    "wed": "We",
    "thu": "Th",
    "fri": "Fr",
    "sat": "Sa",
    "sun": "Su",
    "måndag": "Mo",
    "tisdag": "Tu",
    "onsdag": "We",
    "torsdag": "Th",
    "fredag": "Fr",
    "lördag": "Sa",
    "söndag": "Su",
}

ORDERED_DAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"]

HEADERS = {
    "User-Agent": "MotkartaFoodMap/1.0 (Stockholm Independent Food Map; contact@motkarta.se)",
    "Accept": "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
}


def classify_price_level(amount: int | float) -> int:
    """Map a SEK amount to Motkarta price tier (1 to 4)."""
    if amount < 150:
        return 1
    elif amount <= 350:
        return 2
    elif amount <= 750:
        return 3
    else:
        return 4


def price_level_to_symbol(level: int) -> str:
    """Return $, $$, $$$, or $$$$."""
    return "$" * max(1, min(4, level))


def price_level_to_sek(level: int) -> str:
    """Return standard representative SEK range for a given tier."""
    if level == 1:
        return "45–140"
    elif level == 2:
        return "160–320"
    elif level == 3:
        return "380–680"
    else:
        return "750–1600"


def format_osm_opening_hours(specs: list[dict[str, Any]]) -> str | None:
    """Convert Schema.org OpeningHoursSpecification list to standard compact opening_hours."""
    if not specs:
        return None

    # Map Day -> "HH:MM-HH:MM"
    day_times: dict[str, set[str]] = {}
    for spec in specs:
        if not isinstance(spec, dict) or spec.get("validFrom") or spec.get("validThrough"):
            continue
        opens = str(spec.get("opens", "")).strip()[:5]
        closes = str(spec.get("closes", "")).strip()[:5]
        if not re.fullmatch(r"(?:[01]\d|2[0-3]):[0-5]\d", opens) or not re.fullmatch(r"(?:[01]\d|2[0-3]):[0-5]\d", closes):
            continue
        time_slot = f"{opens}-{closes}"
        day_raw = spec.get("dayOfWeek", [])
        if isinstance(day_raw, str):
            day_raw = [day_raw]
        elif not isinstance(day_raw, list):
            continue

        for d in day_raw:
            d_norm = str(d).strip().lower().split("/")[-1]
            short_day = DAY_MAP.get(d_norm)
            if short_day:
                day_times.setdefault(short_day, set()).add(time_slot)

    if not day_times:
        return None

    # Group consecutive days with same time slot
    groups: list[tuple[list[str], str]] = []
    current_days: list[str] = []
    current_slot: str | None = None

    for day in ORDERED_DAYS:
        slot = ",".join(sorted(day_times.get(day, set())))
        if slot:
            if slot == current_slot:
                current_days.append(day)
            else:
                if current_days and current_slot:
                    groups.append((current_days, current_slot))
                current_days = [day]
                current_slot = slot
        else:
            if current_days and current_slot:
                groups.append((current_days, current_slot))
                current_days = []
                current_slot = None

    if current_days and current_slot:
        groups.append((current_days, current_slot))

    if not groups:
        return None

    formatted_parts: list[str] = []
    for days, slot in groups:
        if len(days) == 1:
            day_str = days[0]
        elif len(days) == 2:
            day_str = f"{days[0]}, {days[1]}"
        else:
            day_str = f"{days[0]}-{days[-1]}"
        formatted_parts.append(f"{day_str} {slot}")

    return "; ".join(formatted_parts)


def schema_items(data: Any):
    if isinstance(data, list):
        for item in data:
            yield from schema_items(item)
    elif isinstance(data, dict):
        yield data
        yield from schema_items(data.get("@graph", []))


def parse_schema_json_ld(html: str) -> dict[str, Any]:
    """Extract opening hours, price range, and address from Schema.org JSON-LD scripts."""
    result: dict[str, Any] = {
        "opening_hours": None,
        "price_range": None,
        "street_address": None,
    }

    scripts = re.findall(
        r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>(.*?)</script>',
        html,
        re.DOTALL | re.I,
    )

    for script_content in scripts:
        try:
            data = json.loads(script_content.strip())
            items = schema_items(data)
            for item in items:
                if not isinstance(item, dict):
                    continue

                item_type = str(item.get("@type", "")).lower()
                is_food_venue = any(
                    k in item_type
                    for k in [
                        "restaurant",
                        "cafe",
                        "bakery",
                        "bar",
                        "food",
                        "localbusiness",
                        "store",
                    ]
                )

                # 1. Price Range
                if is_food_venue and "priceRange" in item and not result["price_range"]:
                    pr = str(item["priceRange"]).strip()
                    if pr:
                        result["price_range"] = pr

                # 2. Opening Hours
                if is_food_venue and not result["opening_hours"]:
                    if "openingHoursSpecification" in item:
                        specs = item["openingHoursSpecification"]
                        if isinstance(specs, dict):
                            specs = [specs]
                        if isinstance(specs, list):
                            hours = format_osm_opening_hours(specs)
                            if hours:
                                result["opening_hours"] = hours
                    elif "openingHours" in item:
                        oh = item["openingHours"]
                        if isinstance(oh, str) and 5 <= len(oh) <= 80:
                            result["opening_hours"] = oh
                        elif isinstance(oh, list) and oh:
                            result["opening_hours"] = "; ".join(str(x) for x in oh)

                # 3. Postal Address
                if is_food_venue and not result["street_address"]:
                    addr = item.get("address")
                    if isinstance(addr, dict):
                        st = str(addr.get("streetAddress", "")).strip()
                        city = str(addr.get("addressLocality", "Stockholm")).strip()
                        if st and any(c.isdigit() for c in st):
                            result["street_address"] = f"{st}, {city}"
        except Exception:
            continue

    return result


def parse_menu_prices_from_text(html: str) -> tuple[int | None, str | None]:
    """Parse Swedish menu pricing (Dagens lunch, varmrätter) from page text."""
    # Strip HTML tags
    text = re.sub(r"<[^>]+>", " ", html).lower()
    text = " ".join(text.split())

    # Check lunch price: "dagens lunch 145 kr" or "lunch 135:-"
    lunch_matches = re.findall(
        r"(?:dagens lunch|lunchmeny|lunch)[^0-9]{1,25}(\d{2,3})\s*(?:kr|sek|:-)",
        text,
    )
    lunch_prices = [int(p) for p in lunch_matches if 75 <= int(p) <= 220]

    # Check main dishes: "varmrätter 195 - 340 kr" or "huvudrätter"
    main_matches = re.findall(
        r"(?:varmrätter|huvudrätter|pasta|pizza|burgare|mains)[^0-9]{1,25}(\d{2,3})\s*(?:kr|sek|:-)",
        text,
    )
    main_prices = [int(p) for p in main_matches if 120 <= int(p) <= 650]

    all_prices = lunch_prices + main_prices
    if all_prices:
        min_p = min(all_prices)
        max_p = max(all_prices)
        avg_p = sum(all_prices) / len(all_prices)
        lvl = classify_price_level(avg_p)
        sek_str = f"{min_p}–{max_p}" if min_p != max_p else f"{min_p}"
        return lvl, sek_str

    return None, None


def determine_venue_price(
    place: dict[str, Any],
    price_range_str: str | None,
    menu_prices: tuple[int | None, str | None],
) -> tuple[int | None, str | None]:
    """Return sourced symbols or SEK amounts; never infer prices from category."""
    raw = str(price_range_str or "").strip()
    if re.fullmatch(r"\${1,4}", raw):
        return len(raw), raw
    # Numeric amounts need an explicit SEK currency, not a digit interpreted as a tier.
    match = re.fullmatch(r"(?:SEK\s*)?(\d{2,4})(?:\s*[-–]\s*(\d{2,4}))?\s*(?:SEK|kr|:-)?", raw, re.I)
    if match and re.search(r"SEK|kr|:-", raw, re.I):
        low, high = int(match[1]), int(match[2] or match[1])
        if 0 < low <= high <= 9999:
            return classify_price_level((low + high) / 2), f"{low}–{high}" if low != high else str(low)
    if menu_prices[0] is not None and menu_prices[1] is not None:
        return menu_prices
    return None, None


def fetch_website_metadata(url: str, timeout: int = 5) -> dict[str, Any] | None:
    """Fetch website HTML and parse Schema.org + menu prices."""
    if not url or not url.startswith("http"):
        return None
    try:
        req = urllib.request.Request(url, headers=HEADERS)
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            html = resp.read().decode("utf-8", errors="ignore")
            schema_data = parse_schema_json_ld(html)
            menu_prices = parse_menu_prices_from_text(html)
            return {
                "schema": schema_data,
                "menu_prices": menu_prices,
            }
    except Exception:
        return None


def enrich_hours_and_prices(
    places_file: Path = PLACES_FILE,
    max_workers: int = 16,
    limit_sites: int = 0,
    quiet: bool = False,
) -> dict[str, Any]:
    """Crawl venue websites to enrich opening hours and prices, and standardize all places."""
    if not places_file.exists():
        raise FileNotFoundError(f"{places_file} not found")

    payload = json.loads(places_file.read_text(encoding="utf-8"))
    places: list[dict[str, Any]] = payload.get("places", payload)

    # Identify places with websites to scrape
    scrape_queue: list[tuple[int, str]] = []
    for idx, p in enumerate(places):
        url = p.get("website", "")
        if url and url.startswith("http"):
            scrape_queue.append((idx, url))

    if limit_sites > 0:
        scrape_queue = scrape_queue[:limit_sites]

    if not quiet:
        print(f"🌐 Scraping {len(scrape_queue)} venue websites for hours, prices & addresses...")

    website_results: dict[int, dict[str, Any]] = {}
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        future_to_idx = {
            executor.submit(fetch_website_metadata, url): idx
            for idx, url in scrape_queue
        }
        for future in as_completed(future_to_idx):
            idx = future_to_idx[future]
            try:
                res = future.result()
                if res:
                    website_results[idx] = res
            except Exception:
                pass

    hours_scraped = 0
    prices_scraped = 0
    addresses_scraped = 0

    for idx, place in enumerate(places):
        meta = website_results.get(idx)
        schema = meta.get("schema", {}) if meta else {}
        menu_prices = meta.get("menu_prices", (None, None)) if meta else (None, None)

        if not meta:
            continue  # Failed or unrequested websites must not mutate existing facts.
        updates = {}
        if schema.get("opening_hours"):
            updates["openingHours"] = schema["opening_hours"]
            hours_scraped += 1
        if schema.get("street_address") and not any(c.isdigit() for c in (place.get("address") or "").split(",")[0]):
            updates["address"] = schema["street_address"]
            addresses_scraped += 1
        _, price = determine_venue_price(place, schema.get("price_range"), menu_prices)
        if price:
            updates["priceSEK"] = price
            prices_scraped += 1
        facts = {f["id"]: f for f in place.get("sourceFacts", [])}
        for field, value in updates.items():
            place[field] = value
            fid = f"{place['id']}:website:{field}"
            facts[fid] = {"id": fid, "placeId": place["id"], "field": field,
                          "value": value, "source": "Venue website", "url": place["website"],
                          "verification": "listed", "capturedAt": datetime.now(UTC).isoformat()}
        if updates:
            place["sourceFacts"] = list(facts.values())

    payload["places"] = places
    payload["totalPlaces"] = len(places)
    places_file.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    stats = {
        "hours_scraped": hours_scraped,
        "prices_scraped": prices_scraped,
        "addresses_scraped": addresses_scraped,
        "total_places": len(places),
        "total_with_price_sek": sum(1 for p in places if p.get("priceSEK")),
    }

    if not quiet:
        print("🎯 HOURS & PRICE ENRICHMENT REPORT")
        print(f"  Opening Hours Scraped:         +{hours_scraped}")
        print(f"  Price Signals Scraped:         +{prices_scraped}")
        print(f"  Addresses Scraped:             +{addresses_scraped}")
        print(f"  Places with sourced price: {stats['total_with_price_sek']}/{stats['total_places']}")

    return stats


def main() -> None:
    parser = argparse.ArgumentParser(description="Enrich hours and prices from websites")
    parser.add_argument("--workers", type=int, default=16, help="Concurrent HTTP worker threads")
    parser.add_argument("--limit", type=int, default=0, help="Limit number of websites to scrape (0 for all)")
    parser.add_argument("--quiet", action="store_true", help="Suppress console output")
    args = parser.parse_args()

    enrich_hours_and_prices(max_workers=args.workers, limit_sites=args.limit, quiet=args.quiet)


if __name__ == "__main__":
    main()
