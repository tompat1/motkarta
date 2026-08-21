#!/usr/bin/env python3
"""Build a unified Motkarta place lifecycle queue.

The queue keeps discovery candidates separate from user-facing verified records:

- baseline: existing OSM/open-data places
- candidate: unmatched source records or community/Google metadata discoveries
- verified: human-reviewed records with enough evidence
- featured: editorially highlighted verified records
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import time
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_PLACES_FILE = ROOT / "public" / "data" / "places.json"
DEFAULT_FOOD_CONTROL_FILE = ROOT / "data" / "stockholm_food_control.csv"
DEFAULT_FOOD_CONTROL_MATCHES_FILE = ROOT / "data" / "stockholm_food_control_matches.csv"
DEFAULT_GOOGLE_CANDIDATES_FILE = ROOT / "outputs" / "google_places_candidates.json"
DEFAULT_OUTPUT_FILE = ROOT / "outputs" / "candidate_queue.json"

STATES = {"baseline", "candidate", "verified", "featured"}
VALIDATION_LABELS = {"known_mainstream", "known_hidden_gem", "not_enough_evidence", "closed_wrong_category"}
FORBIDDEN_VALUE_FIELDS = {
    "rating",
    "ratingAverage",
    "reliableRatingCount",
    "reviewCount",
    "review_count",
    "user_ratings_total",
    "reviews",
    "price_level",
    "priceLevel",
    "categoryPopularityRaw",
    "localPopularityPercentile",
    "mainstreamExposure",
    "engagement",
    "score",
    "scores",
    "popularity",
    "prominence",
}


def build_candidate_queue(
    places_path: Path = DEFAULT_PLACES_FILE,
    food_control_path: Path = DEFAULT_FOOD_CONTROL_FILE,
    food_control_matches_path: Path = DEFAULT_FOOD_CONTROL_MATCHES_FILE,
    google_candidates_path: Path = DEFAULT_GOOGLE_CANDIDATES_FILE,
    curated_submissions_path: Path | None = None,
    validation_labels_path: Path | None = None,
) -> dict[str, Any]:
    validations = load_validation_labels(validation_labels_path)
    entries: list[dict[str, Any]] = []

    entries.extend(baseline_entries(load_places(places_path), validations))
    entries.extend(unmatched_food_control_entries(food_control_path, food_control_matches_path, validations))
    entries.extend(google_candidate_entries(google_candidates_path, validations))
    entries.extend(curated_submission_entries(curated_submissions_path, validations))

    deduped = dedupe_entries(entries)
    for entry in deduped:
        assert_no_forbidden_value_fields(entry)

    return {
        "updatedAt": iso_now(),
        "policy": "Unified lifecycle queue. Candidate records are not user-facing recommendations until reviewed.",
        "states": ["baseline", "candidate", "verified", "featured"],
        "summary": {
            state: sum(1 for entry in deduped if entry["state"] == state)
            for state in ["baseline", "candidate", "verified", "featured"]
        },
        "entries": deduped,
    }


def baseline_entries(places: list[dict[str, Any]], validations: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    entries = []
    for place in places:
        key = place_key(place.get("id"), place.get("name"), place.get("address"))
        validation = validations.get(key) or validations.get(normalized_name(place.get("name"))) or {}
        state = apply_validation_state(str(place.get("lifecycleState") or "baseline"), validation)
        entry = {
            "id": f"osm-baseline:{place.get('id')}",
            "state": state,
            "sourceType": "osm_baseline",
            "name": clean_text(place.get("name")),
            "kind": clean_text(place.get("kind")),
            "address": clean_text(place.get("address")),
            "area": clean_text(place.get("area")),
            "latitude": optional_float(place.get("latitude")),
            "longitude": optional_float(place.get("longitude")),
            "website": clean_text(place.get("website")),
            "sourceName": clean_text(place.get("sourceName") or "OpenStreetMap"),
            "validationLabel": validation.get("label"),
            "validationNotes": validation.get("notes"),
            "allowedUse": "Visible baseline. May be recommended, but cannot be labeled a hidden gem unless evidence gates pass.",
        }
        entries.append(drop_empty(entry))
    return entries


def unmatched_food_control_entries(
    food_control_path: Path,
    matches_path: Path,
    validations: dict[str, dict[str, Any]],
) -> list[dict[str, Any]]:
    if not food_control_path.exists():
        return []
    matched_source_ids = {
        row.get("source_id", "")
        for row in read_csv(matches_path)
        if row.get("source_id")
    }
    entries = []
    for row in read_csv(food_control_path):
        source_id = clean_text(row.get("source_id"))
        if not source_id or source_id in matched_source_ids:
            continue
        validation = validations.get(f"municipal:{source_id}") or validations.get(normalized_name(row.get("name"))) or {}
        entry = {
            "id": f"municipal-food-control:{source_id}",
            "state": apply_validation_state("candidate", validation),
            "sourceType": "municipal_unmatched",
            "sourceId": source_id,
            "name": clean_text(row.get("name")),
            "address": clean_text(row.get("address")),
            "latitude": optional_float(row.get("latitude")),
            "longitude": optional_float(row.get("longitude")),
            "sourceName": clean_text(row.get("source") or "Stockholms stad livsmedelskontroll"),
            "capturedAt": clean_text(row.get("latest_inspection_date")),
            "validationLabel": validation.get("label"),
            "validationNotes": validation.get("notes"),
            "reviewStatus": "needs_osm_match_or_manual_place_creation",
            "allowedUse": "Candidate existence evidence only; not shown as recommendation until matched or manually verified.",
        }
        entries.append(drop_empty(entry))
    return entries


def google_candidate_entries(path: Path, validations: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    payload = json.loads(path.read_text(encoding="utf-8"))
    entries = []
    for candidate in payload.get("candidates", []):
        google_place_id = clean_text(candidate.get("googlePlaceId"))
        validation = validations.get(f"google:{google_place_id}") or validations.get(normalized_name(candidate.get("name"))) or {}
        entry = {
            "id": f"google-metadata:{google_place_id or normalized_name(candidate.get('name'))}",
            "state": apply_validation_state("candidate", validation),
            "sourceType": "google_metadata",
            "sourceId": google_place_id,
            "name": clean_text(candidate.get("name")),
            "address": clean_text(candidate.get("address")),
            "latitude": optional_float(candidate.get("latitude")),
            "longitude": optional_float(candidate.get("longitude")),
            "website": clean_text(candidate.get("website")),
            "sourceName": "Google Places metadata-only discovery",
            "validationLabel": validation.get("label"),
            "validationNotes": validation.get("notes"),
            "reviewStatus": "needs_open_source_or_human_verification",
            "allowedUse": "Candidate discovery and neutral metadata only; never scoring.",
        }
        entries.append(drop_empty(entry))
    return entries


def curated_submission_entries(path: Path | None, validations: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    if path is None or not path.exists():
        return []
    payload = json.loads(path.read_text(encoding="utf-8"))
    records = payload.get("submissions") or payload.get("places") or (payload if isinstance(payload, list) else [])
    entries = []
    for index, record in enumerate(records):
        match = record.get("match", {}) if isinstance(record, dict) else {}
        name = clean_text(record.get("name") or match.get("name"))
        validation = validations.get(normalized_name(name)) or {}
        default_state = clean_text(record.get("state") or record.get("lifecycleState") or "candidate")
        source_id = clean_text(record.get("sourceId")) or normalized_name(name) or str(index)
        entry = {
            "id": f"curated-submission:{source_id}",
            "state": apply_validation_state(default_state, validation),
            "sourceType": "curated_submission",
            "sourceId": source_id,
            "name": name,
            "kind": clean_text(record.get("kind")),
            "address": clean_text(record.get("address") or match.get("address")),
            "area": clean_text(record.get("area")),
            "latitude": optional_float(record.get("latitude")),
            "longitude": optional_float(record.get("longitude")),
            "website": clean_text(record.get("website")),
            "sourceUrl": clean_text(record.get("sourceUrl")),
            "sourceName": first_evidence_source_name(record),
            "capturedAt": clean_text(record.get("lastUpdated") or record.get("capturedAt")),
            "validationLabel": validation.get("label"),
            "validationNotes": validation.get("notes"),
            "reviewStatus": "needs_entity_match_and_source_review",
            "allowedUse": "Candidate evidence only; summaries must be original and source-attributed.",
            "tags": record.get("tags") if isinstance(record.get("tags"), list) else [],
        }
        entries.append(drop_empty(entry))
    return entries


def load_validation_labels(path: Path | None) -> dict[str, dict[str, Any]]:
    if path is None or not path.exists():
        return {}
    payload = json.loads(path.read_text(encoding="utf-8"))
    records = payload.get("labels", payload if isinstance(payload, list) else [])
    labels = {}
    for record in records:
        label = clean_text(record.get("label"))
        if label not in VALIDATION_LABELS:
            raise ValueError(f"Unsupported validation label: {label}")
        keys = [
            clean_text(record.get("id")),
            normalized_name(record.get("name")),
            prefixed_key(record.get("sourceType"), record.get("sourceId")),
        ]
        for key in keys:
            if key:
                labels[key] = {
                    "label": label,
                    "notes": clean_text(record.get("notes")),
                    "reviewedBy": clean_text(record.get("reviewedBy")),
                    "reviewedAt": clean_text(record.get("reviewedAt")),
                }
    return labels


def apply_validation_state(default_state: str, validation: dict[str, Any]) -> str:
    label = validation.get("label")
    if label == "known_hidden_gem":
        return "verified"
    if label == "known_mainstream":
        return "verified"
    if label in {"not_enough_evidence", "closed_wrong_category"}:
        return "candidate"
    return default_state if default_state in STATES else "candidate"


def load_places(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    payload = json.loads(path.read_text(encoding="utf-8"))
    return payload.get("places", payload if isinstance(payload, list) else [])


def read_csv(path: Path) -> list[dict[str, str]]:
    if not path.exists():
        return []
    with path.open(newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def dedupe_entries(entries: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen = set()
    deduped = []
    for entry in entries:
        key = entry.get("id") or place_key(None, entry.get("name"), entry.get("address"))
        if key in seen:
            continue
        seen.add(key)
        deduped.append(entry)
    return deduped


def first_evidence_source_name(record: dict[str, Any]) -> str:
    evidence = record.get("evidence") if isinstance(record, dict) else None
    if isinstance(evidence, list) and evidence:
        return clean_text(evidence[0].get("sourceName"))
    return clean_text(record.get("sourceName")) if isinstance(record, dict) else ""


def assert_no_forbidden_value_fields(payload: Any) -> None:
    found = forbidden_value_fields(payload)
    if found:
        raise ValueError(f"Candidate queue entry contains forbidden value fields: {', '.join(sorted(found))}")


def forbidden_value_fields(payload: Any) -> set[str]:
    found: set[str] = set()
    if isinstance(payload, dict):
        for key, value in payload.items():
            if key in FORBIDDEN_VALUE_FIELDS:
                found.add(key)
            found.update(forbidden_value_fields(value))
    elif isinstance(payload, list):
        for item in payload:
            found.update(forbidden_value_fields(item))
    return found


def place_key(place_id: object, name: object, address: object) -> str:
    if clean_text(place_id):
        return f"place:{clean_text(place_id)}"
    return f"{normalized_name(name)}:{normalized_name(address)}"


def prefixed_key(source_type: object, source_id: object) -> str:
    source = clean_text(source_type).lower()
    source_id_text = clean_text(source_id)
    return f"{source}:{source_id_text}" if source and source_id_text else ""


def drop_empty(record: dict[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in record.items() if value not in ("", None, [], {})}


def clean_text(value: object) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def normalized_name(value: object) -> str:
    return re.sub(r"[^a-z0-9åäöé]+", "", clean_text(value).lower())


def optional_float(value: object) -> float | None:
    text = clean_text(value)
    if not text:
        return None
    try:
        return float(text)
    except ValueError:
        return None


def iso_now() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--places", type=Path, default=DEFAULT_PLACES_FILE)
    parser.add_argument("--food-control", type=Path, default=DEFAULT_FOOD_CONTROL_FILE)
    parser.add_argument("--food-control-matches", type=Path, default=DEFAULT_FOOD_CONTROL_MATCHES_FILE)
    parser.add_argument("--google-candidates", type=Path, default=DEFAULT_GOOGLE_CANDIDATES_FILE)
    parser.add_argument("--curated-submissions", type=Path)
    parser.add_argument("--validation-labels", type=Path)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT_FILE)
    args = parser.parse_args()

    queue = build_candidate_queue(
        places_path=args.places,
        food_control_path=args.food_control,
        food_control_matches_path=args.food_control_matches,
        google_candidates_path=args.google_candidates,
        curated_submissions_path=args.curated_submissions,
        validation_labels_path=args.validation_labels,
    )
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(queue, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {args.output} ({len(queue['entries'])} entries)")
    for state, count in queue["summary"].items():
        print(f"- {state}: {count}")


if __name__ == "__main__":
    main()
