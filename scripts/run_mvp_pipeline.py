from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from motkarta.map import build_folium_map
from motkarta.pipeline import (
    build_coverage_report,
    clean_places,
    dedupe_places,
    filter_excluded_chains,
    load_raw_csv,
    score_places,
    write_geojson,
    write_place_inputs_json,
    write_rag_corpus,
)


def run_pipeline(
    raw_csv: Path,
    data_dir: Path,
    output_dir: Path,
    public_data_dir: Path | None = None,
    source_metadata_path: Path | None = None,
) -> None:
    data_dir.mkdir(parents=True, exist_ok=True)
    output_dir.mkdir(parents=True, exist_ok=True)
    if public_data_dir is not None:
        public_data_dir.mkdir(parents=True, exist_ok=True)

    raw = load_raw_csv(raw_csv)
    clean = clean_places(raw)
    clean_path = data_dir / "stockholm_food_places_clean.csv"
    clean.to_csv(clean_path, index=False)

    deduped, duplicates = dedupe_places(clean)
    deduped_path = data_dir / "stockholm_food_places_deduped.csv"
    duplicates_path = data_dir / "stockholm_food_duplicates.csv"
    deduped.to_csv(deduped_path, index=False)
    duplicates.to_csv(duplicates_path, index=False)

    filtered, excluded_chains = filter_excluded_chains(deduped)
    excluded_chains_path = data_dir / "stockholm_food_excluded_chains.csv"
    excluded_chains.to_csv(excluded_chains_path, index=False)

    scored = score_places(filtered)
    scored_path = data_dir / "stockholm_food_places_scored.csv"
    scored.to_csv(scored_path, index=False)

    build_folium_map(scored, output_dir / "stockholm_food_map.html")
    write_geojson(scored, output_dir / "stockholm_food_places.geojson")
    write_rag_corpus(scored, output_dir / "rag_corpus.jsonl")
    if public_data_dir is not None:
        write_place_inputs_json(scored, public_data_dir / "places.json")

    food_control_path = data_dir / "stockholm_food_control.csv"
    matches_path = data_dir / "stockholm_food_control_matches.csv"
    municipal_count = len(pd.read_csv(food_control_path)) if food_control_path.exists() else None
    matched_count = len(pd.read_csv(matches_path)) if matches_path.exists() else None

    report = build_coverage_report(
        scored,
        duplicate_count=len(duplicates),
        excluded_chain_count=len(excluded_chains),
        municipal_records_count=municipal_count,
        matched_records_count=matched_count,
    )
    report_text = report.markdown()
    if source_metadata_path is not None and source_metadata_path.exists():
        report_text += source_metadata_markdown(source_metadata_path)
    (output_dir / "coverage_report.md").write_text(report_text, encoding="utf-8")

    print(f"Wrote {clean_path}")
    print(f"Wrote {deduped_path}")
    print(f"Wrote {excluded_chains_path}")
    print(f"Wrote {scored_path}")
    print(f"Wrote {output_dir / 'stockholm_food_map.html'}")
    print(f"Wrote {output_dir / 'stockholm_food_places.geojson'}")
    print(f"Wrote {output_dir / 'coverage_report.md'}")
    print(f"Wrote {output_dir / 'rag_corpus.jsonl'}")
    if public_data_dir is not None:
        print(f"Wrote {public_data_dir / 'places.json'}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--raw-csv", default="data/stockholm_food_places.csv")
    parser.add_argument("--data-dir", default="data")
    parser.add_argument("--output-dir", default="outputs")
    parser.add_argument("--public-data-dir", default="public/data")
    parser.add_argument("--source-metadata", default="data/raw/osm_stockholm_food_places.metadata.json")
    args = parser.parse_args()
    run_pipeline(
        Path(args.raw_csv),
        Path(args.data_dir),
        Path(args.output_dir),
        Path(args.public_data_dir),
        Path(args.source_metadata),
    )


def source_metadata_markdown(path: Path) -> str:
    metadata = json.loads(path.read_text(encoding="utf-8"))
    lines = [
        "",
        "## Source Metadata",
        "",
        f"- Source: {metadata.get('source', 'Unknown')}",
        f"- Boundary: {metadata.get('boundary_reference', metadata.get('boundary', 'Unknown'))}",
        f"- Fetched at: {metadata.get('fetched_at', 'Unknown')}",
        f"- Query hash: {metadata.get('query_hash', 'Unknown')}",
        f"- Cache: {metadata.get('cache_path', path)}",
        f"- License: {metadata.get('license', 'Unknown')}",
    ]
    return "\n".join(lines) + "\n"


if __name__ == "__main__":
    main()
