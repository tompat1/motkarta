import csv
import json

from scripts import build_candidate_queue as queue


def write_csv(path, rows):
    if not rows:
        path.write_text("", encoding="utf-8")
        return
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)


def test_candidate_queue_combines_sources_and_keeps_value_fields_out(tmp_path):
    places_path = tmp_path / "places.json"
    food_control_path = tmp_path / "food_control.csv"
    matches_path = tmp_path / "matches.csv"
    google_path = tmp_path / "google_candidates.json"
    labels_path = tmp_path / "labels.json"

    places_path.write_text(
        json.dumps(
            {
                "places": [
                    {
                        "id": 1,
                        "name": "OSM Baseline Cafe",
                        "kind": "Café",
                        "area": "Södermalm",
                        "address": "Basgatan 1",
                        "latitude": 59.3,
                        "longitude": 18.0,
                        "ratingAverage": 4.9,
                        "reviewCount": 999,
                    }
                ]
            }
        ),
        encoding="utf-8",
    )
    write_csv(
        food_control_path,
        [
            {
                "source_id": "municipal-1",
                "name": "Matched Kitchen",
                "address": "Matchgatan 1",
                "latitude": "59.31",
                "longitude": "18.01",
                "source": "Stockholms stad livsmedelskontroll",
                "latest_inspection_date": "2026-08-01",
            },
            {
                "source_id": "municipal-2",
                "name": "Unmatched Kitchen",
                "address": "Kandgatan 2",
                "latitude": "59.32",
                "longitude": "18.02",
                "source": "Stockholms stad livsmedelskontroll",
                "latest_inspection_date": "2026-08-02",
            },
        ],
    )
    write_csv(matches_path, [{"source_id": "municipal-1"}])
    google_path.write_text(
        json.dumps(
            {
                "candidates": [
                    {
                        "googlePlaceId": "google-1",
                        "name": "Google Candidate",
                        "address": "Googlegatan 3",
                        "website": "https://candidate.example",
                        "rating": 5,
                        "user_ratings_total": 500,
                    }
                ]
            }
        ),
        encoding="utf-8",
    )
    labels_path.write_text(
        json.dumps(
            {
                "labels": [
                    {
                        "id": "place:1",
                        "name": "OSM Baseline Cafe",
                        "label": "known_hidden_gem",
                        "notes": "Human reviewer confirmed.",
                    },
                    {
                        "sourceType": "google",
                        "sourceId": "google-1",
                        "label": "not_enough_evidence",
                    },
                ]
            }
        ),
        encoding="utf-8",
    )

    result = queue.build_candidate_queue(
        places_path=places_path,
        food_control_path=food_control_path,
        food_control_matches_path=matches_path,
        google_candidates_path=google_path,
        validation_labels_path=labels_path,
    )

    entries = result["entries"]
    by_name = {entry["name"]: entry for entry in entries}

    assert result["summary"]["verified"] == 1
    assert result["summary"]["candidate"] == 2
    assert by_name["OSM Baseline Cafe"]["state"] == "verified"
    assert by_name["Unmatched Kitchen"]["sourceType"] == "municipal_unmatched"
    assert by_name["Google Candidate"]["state"] == "candidate"
    assert queue.forbidden_value_fields(entries) == set()
