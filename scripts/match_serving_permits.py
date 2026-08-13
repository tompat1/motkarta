from __future__ import annotations

import argparse
import json
import sys
from dataclasses import asdict
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from motkarta.pipeline import clean_text, load_raw_csv
from motkarta.source_matching import SourceRecord, match_source_records


SOURCE_NAME = "Serving permit register"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--places", default="data/stockholm_food_places_scored.csv")
    parser.add_argument("--permits", default="data/serving_permits.csv")
    parser.add_argument("--matches", default="data/serving_permit_matches.csv")
    parser.add_argument("--evidence", default="outputs/serving_permit_evidence.json")
    args = parser.parse_args()

    places = load_raw_csv(args.places)
    permits = pd.read_csv(args.permits).fillna("")
    records_by_id = {record.source_id: record for record in permit_records(permits)}
    matches = match_source_records(places, list(records_by_id.values()))

    matches_path = Path(args.matches)
    matches_path.parent.mkdir(parents=True, exist_ok=True)
    pd.DataFrame([asdict(match) for match in matches]).to_csv(matches_path, index=False)

    evidence_records = [permit_evidence(match, records_by_id[match.source_id]) for match in matches]
    evidence_path = Path(args.evidence)
    evidence_path.parent.mkdir(parents=True, exist_ok=True)
    evidence_path.write_text(json.dumps(evidence_records, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(f"Wrote {matches_path} ({len(matches)} matches)")
    print(f"Wrote {evidence_path} ({len(evidence_records)} evidence records)")


def permit_records(frame: pd.DataFrame) -> list[SourceRecord]:
    records = []
    for _, row in frame.iterrows():
        source_id = clean_text(row.get("permit_id", "")) or f"{row.get('name', '')}:{row.get('address', '')}"
        records.append(
            SourceRecord(
                source_id=source_id,
                name=clean_text(row.get("name", "")),
                address=clean_text(row.get("address", "")),
                latitude=optional_float(row.get("latitude", "")),
                longitude=optional_float(row.get("longitude", "")),
                source_name=clean_text(row.get("source_name", "")) or SOURCE_NAME,
                source_url=clean_text(row.get("source_url", "")),
                captured_at=clean_text(row.get("captured_at", "")),
                summary=permit_summary(row),
            )
        )
    return records


def permit_summary(row: pd.Series) -> str:
    permit_type = clean_text(row.get("permit_type", "")) or "serving permit"
    valid_from = clean_text(row.get("valid_from", ""))
    valid_to = clean_text(row.get("valid_to", ""))
    dates = " ".join(part for part in [valid_from, valid_to] if part)
    return f"Matched restaurant with {permit_type}{f' ({dates})' if dates else ''}."


def optional_float(value: object) -> float | None:
    text = clean_text(value)
    if not text:
        return None
    return float(text)


def permit_evidence(match, record):
    return {
        "match": {
            "osmType": match.osm_type,
            "osmId": match.osm_id,
            "name": match.place_name,
        },
        "evidence": [
            {
                "sourceType": "serving_permit",
                "sourceName": record.source_name,
                "url": record.source_url or None,
                "confidence": min(0.9, max(0.7, match.match_score)),
                "capturedAt": record.captured_at or None,
                "summary": record.summary,
            }
        ],
        "tags": ["Serving permit", "Alcohol licence"],
    }


if __name__ == "__main__":
    main()
