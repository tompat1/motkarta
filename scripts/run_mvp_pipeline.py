from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from motkarta.map import build_folium_map
from motkarta.pipeline import (
    build_coverage_report,
    clean_places,
    dedupe_places,
    load_raw_csv,
    score_places,
    write_rag_corpus,
)


def run_pipeline(raw_csv: Path, data_dir: Path, output_dir: Path) -> None:
    data_dir.mkdir(parents=True, exist_ok=True)
    output_dir.mkdir(parents=True, exist_ok=True)

    raw = load_raw_csv(raw_csv)
    clean = clean_places(raw)
    clean_path = data_dir / "stockholm_food_places_clean.csv"
    clean.to_csv(clean_path, index=False)

    deduped, duplicates = dedupe_places(clean)
    deduped_path = data_dir / "stockholm_food_places_deduped.csv"
    duplicates_path = data_dir / "stockholm_food_duplicates.csv"
    deduped.to_csv(deduped_path, index=False)
    duplicates.to_csv(duplicates_path, index=False)

    scored = score_places(deduped)
    scored_path = data_dir / "stockholm_food_places_scored.csv"
    scored.to_csv(scored_path, index=False)

    build_folium_map(scored, output_dir / "stockholm_food_map.html")
    write_rag_corpus(scored, output_dir / "rag_corpus.jsonl")

    report = build_coverage_report(scored, duplicate_count=len(duplicates))
    (output_dir / "coverage_report.md").write_text(report.markdown(), encoding="utf-8")

    print(f"Wrote {clean_path}")
    print(f"Wrote {deduped_path}")
    print(f"Wrote {scored_path}")
    print(f"Wrote {output_dir / 'stockholm_food_map.html'}")
    print(f"Wrote {output_dir / 'coverage_report.md'}")
    print(f"Wrote {output_dir / 'rag_corpus.jsonl'}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--raw-csv", default="data/stockholm_food_places.csv")
    parser.add_argument("--data-dir", default="data")
    parser.add_argument("--output-dir", default="outputs")
    args = parser.parse_args()
    run_pipeline(Path(args.raw_csv), Path(args.data_dir), Path(args.output_dir))


if __name__ == "__main__":
    main()
