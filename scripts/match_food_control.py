from __future__ import annotations

import argparse
import json
import sys
from dataclasses import asdict
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from motkarta.food_control import FOOD_CONTROL_METADATA_URL, FOOD_CONTROL_SOURCE_NAME, food_control_records
from motkarta.pipeline import load_raw_csv
from motkarta.source_matching import match_source_records


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--places", default="data/stockholm_food_places_scored.csv")
    parser.add_argument("--food-control", default="data/stockholm_food_control.csv")
    parser.add_argument("--matches", default="data/stockholm_food_control_matches.csv")
    parser.add_argument("--evidence", default="outputs/food_control_evidence.json")
    args = parser.parse_args()

    places = load_raw_csv(args.places)
    food_control = pd.read_csv(args.food_control).fillna("")
    records_by_id = {record.source_id: record for record in food_control_records(food_control)}
    matches = match_source_records(places, list(records_by_id.values()))

    matches_path = Path(args.matches)
    matches_path.parent.mkdir(parents=True, exist_ok=True)
    pd.DataFrame([asdict(match) for match in matches]).to_csv(matches_path, index=False)

    evidence_records = [food_control_evidence(match, records_by_id[match.source_id]) for match in matches]
    evidence_path = Path(args.evidence)
    evidence_path.parent.mkdir(parents=True, exist_ok=True)
    evidence_path.write_text(json.dumps(evidence_records, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(f"Wrote {matches_path} ({len(matches)} matches)")
    print(f"Wrote {evidence_path} ({len(evidence_records)} evidence records)")


def food_control_evidence(match, record):
    return {
        "match": {
            "osmType": match.osm_type,
            "osmId": match.osm_id,
            "name": match.place_name,
        },
        "evidence": [
            {
                "sourceType": "inspection",
                "sourceName": FOOD_CONTROL_SOURCE_NAME,
                "url": FOOD_CONTROL_METADATA_URL,
                "confidence": min(0.92, max(0.72, match.match_score)),
                "capturedAt": record.captured_at or None,
                "summary": record.summary,
            }
        ],
        "tags": ["Food-control registered", "Municipal inspection"],
    }


if __name__ == "__main__":
    main()
