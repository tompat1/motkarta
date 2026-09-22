#!/usr/bin/env python3
"""Monthly catalog freshness loop for Motkarta.

Refreshes upstream baselines, diffs the live catalog against OpenStreetMap and
Google metadata-only discovery, rebuilds the candidate review queue, and writes
an operator-facing freshness report.

Google ratings, review counts, price level, prominence, and engagement signals
are never imported.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from execution import compare_places_catalog as compare
from motkarta.discovery_queries import build_discovery_queries
from scripts import google_places_monthly_sync
from scripts.build_candidate_queue import build_candidate_queue

DEFAULT_PLACES_FILE = ROOT / "public" / "data" / "places.json"
DEFAULT_OSM_FILE = ROOT / "data" / "stockholm_food_places.csv"
DEFAULT_COMPARISON_REPORT = ROOT / "outputs" / "places_comparison_report.json"
DEFAULT_CANDIDATE_QUEUE = ROOT / "outputs" / "candidate_queue.json"
DEFAULT_CANDIDATE_SQL = ROOT / "drizzle" / "seed-candidates.sql"
DEFAULT_FRESHNESS_REPORT = ROOT / "public" / "data" / "catalog_freshness_report.json"


def iso_now() -> str:
    return datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def run_fetch_osm(refresh: bool) -> dict[str, Any]:
    argv = [sys.executable, str(ROOT / "scripts" / "fetch_osm.py")]
    if refresh:
        argv.append("--refresh")
    subprocess.run(argv, check=True, cwd=ROOT)
    row_count = 0
    if DEFAULT_OSM_FILE.exists():
        row_count = max(0, sum(1 for _ in DEFAULT_OSM_FILE.open(encoding="utf-8")) - 1)
    return {"osmRows": row_count, "refreshed": refresh}


def run_food_control(refresh: bool) -> dict[str, Any]:
    argv = [sys.executable, str(ROOT / "scripts" / "fetch_food_control.py")]
    if refresh:
        argv.append("--refresh")
    subprocess.run(argv, check=True, cwd=ROOT)
    row_count = 0
    food_control_file = ROOT / "data" / "stockholm_food_control.csv"
    if food_control_file.exists():
        row_count = max(0, sum(1 for _ in food_control_file.open(encoding="utf-8")) - 1)
    return {"foodControlRows": row_count, "refreshed": refresh}


def run_food_control_match() -> dict[str, Any]:
    argv = [
        sys.executable,
        str(ROOT / "scripts" / "match_food_control.py"),
        "--catalog",
        str(DEFAULT_PLACES_FILE),
    ]
    subprocess.run(argv, check=True, cwd=ROOT)
    matches_file = ROOT / "data" / "stockholm_food_control_matches.csv"
    match_count = 0
    if matches_file.exists():
        match_count = max(0, sum(1 for _ in matches_file.open(encoding="utf-8")) - 1)
    return {"foodControlMatches": match_count}


def run_serving_permit_match() -> dict[str, Any]:
    permits_file = ROOT / "data" / "serving_permits.csv"
    if not permits_file.exists():
        return {"servingPermitMatches": 0, "skipped": True, "reason": "data/serving_permits.csv not present"}
    argv = [
        sys.executable,
        str(ROOT / "scripts" / "match_serving_permits.py"),
        "--catalog",
        str(DEFAULT_PLACES_FILE),
        "--permits",
        str(permits_file),
    ]
    subprocess.run(argv, check=True, cwd=ROOT)
    matches_file = ROOT / "data" / "serving_permit_matches.csv"
    match_count = 0
    if matches_file.exists():
        match_count = max(0, sum(1 for _ in matches_file.open(encoding="utf-8")) - 1)
    return {"servingPermitMatches": match_count, "skipped": False}


def run_catalog_comparison(
    api_key: str,
    queries: list[str],
    skip_google: bool,
) -> dict[str, Any]:
    report = compare.run_comparison(
        api_key=api_key,
        places_path=DEFAULT_PLACES_FILE,
        osm_path=DEFAULT_OSM_FILE,
        queries=queries,
        skip_google=skip_google,
    )
    DEFAULT_COMPARISON_REPORT.parent.mkdir(parents=True, exist_ok=True)
    DEFAULT_COMPARISON_REPORT.write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return report


def run_google_metadata_sync(
    api_key: str,
    queries: list[str],
    enrich_existing_only: bool,
    dry_run: bool,
) -> dict[str, int]:
    google_places_monthly_sync.load_env()
    return google_places_monthly_sync.sync_metadata(
        api_key=api_key,
        places_path=google_places_monthly_sync.DEFAULT_PLACES_FILE,
        photos_path=google_places_monthly_sync.DEFAULT_PHOTOS_FILE,
        candidates_path=google_places_monthly_sync.DEFAULT_CANDIDATES_FILE,
        queries=queries,
        dry_run=dry_run,
        scrape_photos=not enrich_existing_only,
        enrich_existing_only=enrich_existing_only,
    )


def run_candidate_queue(comparison_report_path: Path) -> dict[str, Any]:
    queue = build_candidate_queue(
        comparison_report_path=comparison_report_path if comparison_report_path.exists() else None,
    )
    DEFAULT_CANDIDATE_QUEUE.parent.mkdir(parents=True, exist_ok=True)
    DEFAULT_CANDIDATE_QUEUE.write_text(json.dumps(queue, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return queue


def run_candidate_seed() -> None:
    subprocess.run(
        ["npm", "run", "candidates:seed", "--", str(DEFAULT_CANDIDATE_QUEUE), str(DEFAULT_CANDIDATE_SQL)],
        check=True,
        cwd=ROOT,
    )


def write_freshness_report(payload: dict[str, Any], output_path: Path) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def run_monthly_catalog_freshness(
    *,
    refresh_osm: bool = True,
    refresh_food_control: bool = True,
    skip_google: bool = False,
    enrich_existing_only: bool = True,
    dry_run: bool = False,
    comparison_report_path: Path = DEFAULT_COMPARISON_REPORT,
    freshness_report_path: Path = DEFAULT_FRESHNESS_REPORT,
) -> dict[str, Any]:
    google_places_monthly_sync.load_env()
    api_key = "" if skip_google else os.environ.get("GOOGLE_PLACES_API_KEY", "")
    queries = build_discovery_queries()

    osm_stats = run_fetch_osm(refresh=refresh_osm)
    food_control_stats = run_food_control(refresh=refresh_food_control)
    match_stats = run_food_control_match()
    permit_match_stats = run_serving_permit_match()

    comparison_report = run_catalog_comparison(api_key=api_key, queries=queries, skip_google=skip_google)

    google_stats: dict[str, int] = {}
    if api_key and not dry_run:
        google_stats = run_google_metadata_sync(
            api_key=api_key,
            queries=queries,
            enrich_existing_only=enrich_existing_only,
            dry_run=dry_run,
        )

    queue = run_candidate_queue(comparison_report_path if comparison_report_path.exists() else comparison_report_path)
    if not dry_run:
        run_candidate_seed()

    report = {
        "generatedAt": iso_now(),
        "policy": (
            "Monthly catalog freshness loop. Discovery sources are metadata-only. "
            "New venues remain candidates until reviewed in /admin."
        ),
        "discoveryQueryCount": len(queries),
        "osm": osm_stats,
        "foodControl": food_control_stats,
        "foodControlMatching": match_stats,
        "servingPermitMatching": permit_match_stats,
        "municipalNewVenueSignals": queue.get("municipalNewVenueSignals", {}),
        "comparison": comparison_report.get("summary", {}),
        "googleMetadataSync": google_stats,
        "candidateQueue": queue.get("summary", {}),
        "artifacts": {
            "osmBaseline": str(DEFAULT_OSM_FILE.relative_to(ROOT)),
            "comparisonReport": str(comparison_report_path.relative_to(ROOT)),
            "candidateQueue": str(DEFAULT_CANDIDATE_QUEUE.relative_to(ROOT)),
            "candidateSeedSql": str(DEFAULT_CANDIDATE_SQL.relative_to(ROOT)),
            "freshnessReport": str(freshness_report_path.relative_to(ROOT)),
        },
        "detectedClosures": comparison_report.get("detectedClosures", [])[:25],
        "newCandidateSample": comparison_report.get("newCandidates", [])[:25],
        "municipalNewVenueSample": queue.get("municipalNewVenueSignals", {}).get("likelyNewVenueSample", [])[:25],
    }
    write_freshness_report(report, freshness_report_path)
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--skip-osm-refresh", action="store_true")
    parser.add_argument("--skip-food-control-refresh", action="store_true")
    parser.add_argument("--skip-google", action="store_true")
    parser.add_argument("--full-google-discovery", action="store_true", help="Also write Google-only discoveries during metadata sync.")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--comparison-report", type=Path, default=DEFAULT_COMPARISON_REPORT)
    parser.add_argument("--freshness-report", type=Path, default=DEFAULT_FRESHNESS_REPORT)
    args = parser.parse_args()

    report = run_monthly_catalog_freshness(
        refresh_osm=not args.skip_osm_refresh,
        refresh_food_control=not args.skip_food_control_refresh,
        skip_google=args.skip_google,
        enrich_existing_only=not args.full_google_discovery,
        dry_run=args.dry_run,
        comparison_report_path=args.comparison_report,
        freshness_report_path=args.freshness_report,
    )

    print("\n==========================================================================")
    print(" MOTKARTA MONTHLY CATALOG FRESHNESS")
    print("==========================================================================")
    print(f"Discovery queries:         {report['discoveryQueryCount']}")
    print(f"OSM baseline rows:         {report['osm'].get('osmRows', 0):,}")
    print(f"Food-control facilities:   {report['foodControl'].get('foodControlRows', 0):,}")
    print(f"Food-control matches:      {report['foodControlMatching'].get('foodControlMatches', 0):,}")
    municipal = report.get("municipalNewVenueSignals", {})
    print(f"Municipal new-venue signals: {municipal.get('likelyNewVenueSignals', 0):,}")
    print(f"Unmatched food-control venues: {municipal.get('unmatchedFoodControlVenues', 0):,}")
    permit_matching = report.get("servingPermitMatching", {})
    if not permit_matching.get("skipped"):
        print(f"Serving-permit matches:    {permit_matching.get('servingPermitMatches', 0):,}")
    comparison = report.get("comparison", {})
    print(f"New candidates discovered: {comparison.get('newCandidatesFound', 0):,}")
    print(f"Detected closures:         {comparison.get('detectedClosuresCount', 0):,}")
    print(f"Enrichable catalog gaps:   {comparison.get('placesWithMissingAttributes', 0):,}")
    print(f"Candidate queue states:    {report.get('candidateQueue', {})}")
    print(f"Freshness report:          {args.freshness_report}")
    print("==========================================================================")


if __name__ == "__main__":
    main()
