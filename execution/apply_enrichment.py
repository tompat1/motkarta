"""
Apply enrichment overlay to public/data/places.json.

Reads the enrichment overlay and injects sourceFacts into each matching
place record, plus merges openingHours and website from OSM when the
place lacks them.

Usage:
  python execution/apply_enrichment.py
  python execution/apply_enrichment.py --overlay data/enrichment_overlay.json --places public/data/places.json
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OVERLAY = ROOT / "data" / "enrichment_overlay.json"
DEFAULT_PLACES = ROOT / "public" / "data" / "places.json"


DEFAULT_HOURS = {"Mo-Sa 17:00-23:00", "Mo-Fr 07:30-18:00; Sa-Su 08:00-17:00"}
DEFAULT_PRICES = {"45–145", "160–350", "45–140", "160–320", "380–680", "750–1600"}
WIFI_TAGS = {"Wi-Fi", "Free Wi-Fi", "Wi-Fi free for customers", "Paid Wi-Fi", "No Wi-Fi", "Internet access (type unknown)"}


def remove_unsupported_defaults(place: dict[str, Any]) -> None:
    for field, defaults in [("openingHours", DEFAULT_HOURS), ("priceSEK", DEFAULT_PRICES)]:
        value = place.get(field)
        supported = any(f.get("field") == field and f.get("value") == value
                        and f.get("source") and f.get("url") for f in place.get("sourceFacts", []))
        if value in defaults and not supported:
            place.pop(field, None)


def apply_overlay(
    places: list[dict[str, Any]],
    overlay_facts: dict[str, list[dict[str, Any]]],
) -> tuple[int, int]:
    """Refresh attributed facts, replacing only missing or source-owned values."""
    enriched = total_facts = 0
    for place in places:
        remove_unsupported_defaults(place)
        existing = {f["id"]: f for f in place.get("sourceFacts", []) if f.get("id")}
        facts = overlay_facts.get(str(place.get("id", "")), [])
        accepted = 0
        for fact in facts:
            if fact.get("placeId") != place.get("id") or not fact.get("value") or not fact.get("source"):
                continue
            old = existing.get(fact["id"])
            if old and old.get("capturedAt", "") > fact.get("capturedAt", ""):
                continue
            field, value = fact["field"], fact["value"]
            if field in {"openingHours", "priceSEK", "address"}:
                if not place.get(field) or (old and place.get(field) == old.get("value")):
                    place[field] = value
            if field == "tags" and value.startswith("Website: ") and not place.get("website"):
                url = value.removeprefix("Website: ")
                if url.startswith(("http://", "https://")):
                    place["website"] = url
            if field == "tags" and fact["id"].endswith(":osm:wifi"):
                place["tags"] = [t for t in place.get("tags", []) if t not in WIFI_TAGS]
                # Generic Wi-Fi filter includes all confirmed wireless availability.
                if value in {"Free Wi-Fi", "Wi-Fi free for customers", "Paid Wi-Fi", "Wi-Fi"}:
                    place["tags"].append("Wi-Fi")
                if value != "Wi-Fi":
                    place["tags"].append(value)
            existing[fact["id"]] = dict(fact)
            accepted += 1
        if accepted:
            place["sourceFacts"] = list(existing.values())
            enriched += 1
            total_facts += accepted
    return enriched, total_facts


def main() -> None:
    parser = argparse.ArgumentParser(description="Apply enrichment overlay to places.json")
    parser.add_argument("--overlay", default=str(DEFAULT_OVERLAY))
    parser.add_argument("--places", default=str(DEFAULT_PLACES))
    parser.add_argument("--dry-run", action="store_true", help="Print stats without writing.")
    args = parser.parse_args()

    overlay_path = Path(args.overlay)
    places_path = Path(args.places)

    if not overlay_path.exists():
        print(f"ERROR: Overlay not found: {overlay_path}", file=sys.stderr)
        sys.exit(1)
    if not places_path.exists():
        print(f"ERROR: Places file not found: {places_path}", file=sys.stderr)
        sys.exit(1)

    overlay = json.loads(overlay_path.read_text(encoding="utf-8"))
    catalog = json.loads(places_path.read_text(encoding="utf-8"))
    places = catalog.get("places", catalog) if isinstance(catalog, dict) else catalog

    overlay_facts = overlay.get("facts", {})
    print(f"Overlay: {overlay.get('enrichedPlacesCount', '?')} places, {overlay.get('totalFacts', '?')} facts")
    print(f"Catalog: {len(places)} places")

    enriched, total_facts = apply_overlay(places, overlay_facts)

    # Summary of enriched field coverage
    field_counts: dict[str, int] = {}
    for place in places:
        for sf in place.get("sourceFacts", []):
            field = sf.get("field", "?")
            field_counts[field] = field_counts.get(field, 0) + 1

    has_hours = sum(1 for p in places if p.get("openingHours"))
    has_website = sum(1 for p in places if p.get("website"))
    has_source_facts = sum(1 for p in places if p.get("sourceFacts"))

    print("\n=== After enrichment ===")
    print(f"Places with sourceFacts: {has_source_facts} / {len(places)}")
    print(f"Places with openingHours: {has_hours} / {len(places)}")
    print(f"Places with website: {has_website} / {len(places)}")
    print(f"Total enrichment facts injected: {total_facts}")
    print("SourceFact fields:")
    for field, count in sorted(field_counts.items(), key=lambda x: -x[1]):
        print(f"  {field}: {count}")

    if args.dry_run:
        print("\n(dry-run mode — no files written)")
        return

    # Write updated places.json
    if isinstance(catalog, dict):
        catalog["places"] = places
        if "source" in catalog and not catalog["source"].endswith("+enrichment"):
            catalog["source"] = catalog["source"] + "+enrichment"

    places_path.write_text(
        json.dumps(catalog, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"\nWrote enriched places: {places_path}")


if __name__ == "__main__":
    main()
