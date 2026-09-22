import json
from pathlib import Path

from scripts.build_candidate_queue import build_candidate_queue, comparison_candidate_entries


def test_comparison_candidate_entries_maps_osm_and_google_sources(tmp_path: Path):
    report = tmp_path / "places_comparison_report.json"
    report.write_text(
        json.dumps(
            {
                "newCandidates": [
                    {
                        "source": "OpenStreetMap",
                        "name": "Luca Pizza Restaurant",
                        "address": "Surbrunnsgatan 1",
                        "latitude": 59.345,
                        "longitude": 18.05,
                        "openingHours": "Mo-Su 11:00-22:00",
                    },
                    {
                        "source": "Google Places",
                        "name": "Aperitivo",
                        "googlePlaceId": "g-aperitivo",
                        "address": "Odengatan 20",
                        "latitude": 59.343,
                        "longitude": 18.052,
                        "website": "https://aperitivo.example",
                    },
                ]
            }
        ),
        encoding="utf-8",
    )

    entries = comparison_candidate_entries(report, {})
    assert len(entries) == 2
    assert entries[0]["sourceType"] == "osm_unmatched"
    assert entries[0]["name"] == "Luca Pizza Restaurant"
    assert entries[1]["sourceType"] == "google_metadata"
    assert entries[1]["sourceId"] == "g-aperitivo"


def test_build_candidate_queue_includes_comparison_report_entries(tmp_path: Path):
    places_file = tmp_path / "places.json"
    comparison_report = tmp_path / "comparison.json"
    places_file.write_text(json.dumps({"places": [{"id": 1, "name": "Existing", "kind": "Restaurant", "area": "Vasastan"}]}), encoding="utf-8")
    comparison_report.write_text(
        json.dumps({"newCandidates": [{"source": "OpenStreetMap", "name": "Aperitivo", "address": "Odengatan 20"}]}),
        encoding="utf-8",
    )

    queue = build_candidate_queue(
        places_path=places_file,
        food_control_path=tmp_path / "missing-food-control.csv",
        food_control_matches_path=tmp_path / "missing-matches.csv",
        google_candidates_path=tmp_path / "missing-google.json",
        comparison_report_path=comparison_report,
    )

    candidate_names = [entry["name"] for entry in queue["entries"] if entry["state"] == "candidate"]
    assert "Aperitivo" in candidate_names
