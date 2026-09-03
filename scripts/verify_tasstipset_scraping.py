#!/usr/bin/env python3
"""Internal verification check for Tasstipset dog-friendly scraping and dataset integration.

Verifies:
1. The scraper output exists and contains comprehensive Greater Stockholm venues.
2. Ground truth coverage against manually verified reference venues (data/tasstipset_stockholm_ground_truth.csv).
3. Live dataset (public/data/places.json) contains enriched dog-friendly tags, policies, and Tasstipset attribution.
4. Commercial chains are properly handled per Motkarta quality policy while independent venues are preserved.
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_GROUND_TRUTH = ROOT / "data" / "tasstipset_stockholm_ground_truth.csv"
DEFAULT_SCRAPED_OUTPUT = ROOT / "outputs" / "tasstipset_dog_places_stockholm.json"
DEFAULT_PUBLIC_PLACES = ROOT / "public" / "data" / "places.json"

EXCLUDED_CHAINS = {
    "espressohouse",
    "bastardburgers",
    "brdernas",
    "brödernas",
    "pinchos",
    "olearys",
    "olerys",
    "waynescoffee",
    "starbucks",
    "max",
    "texaslonghorn",
    "sushiyama",
}


def norm(s: Any) -> str:
    """Normalize a string for flexible fuzzy name comparison."""
    return re.sub(r"[^a-z0-9åäö]+", "", str(s or "").lower())


def run_verification(
    gt_path: Path = DEFAULT_GROUND_TRUTH,
    scraped_path: Path = DEFAULT_SCRAPED_OUTPUT,
    public_path: Path = DEFAULT_PUBLIC_PLACES,
    quiet: bool = False,
) -> dict[str, Any]:
    """Execute complete internal verification of Tasstipset scraper and dataset integration."""
    if not gt_path.exists():
        raise FileNotFoundError(f"Ground truth reference file not found: {gt_path}")
    if not scraped_path.exists():
        raise FileNotFoundError(f"Scraped output file not found: {scraped_path}")
    if not public_path.exists():
        raise FileNotFoundError(f"Public places dataset not found: {public_path}")

    # 1. Load Ground Truth
    gt_rows: list[dict[str, str]] = []
    with open(gt_path, mode="r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        gt_rows = list(reader)

    gt_total = len(gt_rows)
    gt_independent = [r for r in gt_rows if norm(r.get("name")) not in EXCLUDED_CHAINS]
    gt_chains = [r for r in gt_rows if norm(r.get("name")) in EXCLUDED_CHAINS]

    # 2. Load Scraped Tasstipset Output
    with open(scraped_path, mode="r", encoding="utf-8") as f:
        scraped_payload = json.load(f)

    scraped_places: list[dict[str, Any]] = scraped_payload.get("places", [])
    scraped_total = len(scraped_places)
    scraped_food = sum(1 for p in scraped_places if p.get("category", "").lower() != "park")
    scraped_verified = sum(1 for p in scraped_places if p.get("is_venue_verified"))

    scraped_norm_map: dict[str, dict[str, Any]] = {}
    for p in scraped_places:
        pn = norm(p.get("name"))
        if pn:
            scraped_norm_map[pn] = p

    # 3. Load Public Live Places
    with open(public_path, mode="r", encoding="utf-8") as f:
        public_payload = json.load(f)

    public_places: list[dict[str, Any]] = public_payload.get("places", public_payload)
    public_total = len(public_places)

    dog_friendly_public = [
        p
        for p in public_places
        if any(
            t.lower()
            in [
                "dog friendly",
                "hundvänligt",
                "tasstipset",
                "hundar välkomna",
                "verifierad hundpolicy",
            ]
            for t in p.get("tags", [])
        )
    ]
    dog_friendly_total = len(dog_friendly_public)

    public_norm_map: dict[str, dict[str, Any]] = {}
    for p in public_places:
        pn = norm(p.get("name"))
        if pn:
            public_norm_map[pn] = p

    # 4. Compute Coverage Metrics
    scraped_matched_gt = 0
    public_matched_gt = 0
    unmatched_gt: list[str] = []

    for item in gt_independent:
        name = item.get("name", "")
        gn = norm(name)

        # Scraped matching
        is_scraped = any(gn in sn or sn in gn for sn in scraped_norm_map)
        if is_scraped:
            scraped_matched_gt += 1

        # Public places matching with dog-friendly tag
        is_public_dog = any(
            (gn in pn or pn in gn)
            and any(
                t.lower() in ["dog friendly", "hundvänligt", "tasstipset"]
                for t in p.get("tags", [])
            )
            for pn, p in public_norm_map.items()
        )
        if is_public_dog:
            public_matched_gt += 1
        else:
            unmatched_gt.append(name)

    scraped_coverage_pct = (scraped_matched_gt / len(gt_independent) * 100) if gt_independent else 0.0
    public_coverage_pct = (public_matched_gt / len(gt_independent) * 100) if gt_independent else 0.0

    # Key independent venues sample check
    key_venues = [
        "Drop Coffee",
        "Lillebrors Bageri",
        "Mellqvist",
        "Balzac",
        "Tennstopet",
        "Juno",
        "Gamla Orangeriet",
        "Kungsholmens Vinbar",
        "Capri Due",
        "Noorm",
        "Gefsis",
        "Dirty Taco",
        "Fern & Fika",
        "Mahalo",
        "Petite France",
        "Zum Franziskaner",
        "Hermans",
        "Ulla Winbladh",
        "Rolf de Maré",
        "Ekstedt",
        "Schmaltz",
        "Aubergine",
        "Man in the Moon",
        "Vete-Katten",
        "Bleck",
        "Liebling",
    ]

    key_venue_status = []
    for kv in key_venues:
        kvn = norm(kv)
        found_in_public = any(
            (kvn in pn or pn in kvn)
            and any(t.lower() in ["dog friendly", "hundvänligt", "tasstipset"] for t in p.get("tags", []))
            for pn, p in public_norm_map.items()
        )
        key_venue_status.append({"name": kv, "dog_friendly_verified": found_in_public})

    summary = {
        "status": "PASS" if (scraped_total >= 300 and dog_friendly_total >= 150 and public_coverage_pct >= 80.0) else "FAIL",
        "ground_truth": {
            "total": gt_total,
            "independent": len(gt_independent),
            "chains_excluded": len(gt_chains),
        },
        "scraper": {
            "total_scraped": scraped_total,
            "food_establishments": scraped_food,
            "venue_verified": scraped_verified,
            "ground_truth_matched": scraped_matched_gt,
            "ground_truth_coverage_pct": round(scraped_coverage_pct, 1),
        },
        "public_dataset": {
            "total_places": public_total,
            "dog_friendly_places": dog_friendly_total,
            "ground_truth_matched": public_matched_gt,
            "ground_truth_coverage_pct": round(public_coverage_pct, 1),
        },
        "key_venues_verified": key_venue_status,
        "sample_unmatched": unmatched_gt[:12],
    }

    if not quiet:
        print("\n========================================================")
        print("🐾 MOTKARTA INTERNAL TASSTIPSET VERIFICATION REPORT")
        print("========================================================")
        print(f"📊 Status:                     {'✅ PASS' if summary['status'] == 'PASS' else '❌ FAIL'}")
        print(f"📋 Ground Truth Venues:        {gt_total} total ({len(gt_independent)} independent, {len(gt_chains)} chains)")
        print(f"🐶 Total Scraped from Source:  {scraped_total} Greater Stockholm venues ({scraped_food} food spots)")
        print(f"🎯 Scraper GT Coverage:        {scraped_matched_gt}/{len(gt_independent)} ({scraped_coverage_pct:.1f}%)")
        print(f"🌟 Live Places Tagged Dog:     {dog_friendly_total} venues")
        print(f"🏆 Public Dataset GT Coverage: {public_matched_gt}/{len(gt_independent)} ({public_coverage_pct:.1f}%)")
        print("--------------------------------------------------------")
        print("✨ Key Independent Venues Sample Check:")
        for kv in key_venue_status[:10]:
            icon = "✅" if kv["dog_friendly_verified"] else "❌"
            print(f"   {icon} {kv['name']}")
        print("========================================================\n")

    return summary


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Verify Tasstipset dog-friendly scraping and dataset integration")
    parser.add_argument("--ground-truth", type=Path, default=DEFAULT_GROUND_TRUTH, help="Ground truth CSV path")
    parser.add_argument("--scraped", type=Path, default=DEFAULT_SCRAPED_OUTPUT, help="Scraped JSON path")
    parser.add_argument("--public-places", type=Path, default=DEFAULT_PUBLIC_PLACES, help="Public places JSON path")
    parser.add_argument("--quiet", action="store_true", help="Suppress output")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    summary = run_verification(
        gt_path=args.ground_truth,
        scraped_path=args.scraped,
        public_path=args.public_places,
        quiet=args.quiet,
    )
    if summary["status"] != "PASS":
        sys.exit(1)


if __name__ == "__main__":
    main()
