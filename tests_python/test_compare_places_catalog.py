import json
from pathlib import Path
from execution import compare_places_catalog as comp


def test_name_similarity():
    assert comp.name_similarity("Soldaten Svejk", "Soldaten Svejk") == 1.0
    assert comp.name_similarity("Café Pascal", "Cafe Pascal") == 1.0
    assert comp.name_similarity("Café Pascal Södermalm", "Café Pascal") == 1.0
    assert comp.name_similarity("Random Spot", "Completely Different") < 0.4


def test_find_matching_catalog_place():
    catalog = [
        {"id": 1, "name": "Café Pascal", "latitude": 59.3422, "longitude": 18.0518},
        {"id": 2, "name": "Soldaten Svejk", "latitude": 59.3168, "longitude": 18.0746},
    ]

    # Exact match
    match1 = comp.find_matching_catalog_place("Soldaten Svejk", 59.3168, 18.0746, catalog)
    assert match1 is not None
    assert match1["id"] == 2

    # Diacritic match
    match2 = comp.find_matching_catalog_place("Cafe Pascal", 59.3422, 18.0518, catalog)
    assert match2 is not None
    assert match2["id"] == 1

    # Non-match
    match3 = comp.find_matching_catalog_place("Nonexistent Bakery", 59.32, 18.06, catalog)
    assert match3 is None


def test_run_comparison_with_mocked_sources(tmp_path, monkeypatch):
    places_file = tmp_path / "places.json"
    osm_file = tmp_path / "osm.csv"

    places_file.write_text(
        json.dumps({
            "places": [
                {"id": 101, "name": "Arirang", "area": "Vasastan", "lifecycleState": "verified"},
                {"id": 102, "name": "Existing Bakery", "area": "Södermalm", "address": "", "website": ""},
            ]
        }),
        encoding="utf-8",
    )

    osm_file.write_text(
        "osm_type,osm_id,name,category,establishment_type,cuisine,opening_hours,street,house_number,website,latitude,longitude,source\n"
        "node,1,Existing Bakery,bakery,Bakery,,Mo-Fr 07:00-18:00,Bondegatan,12,https://existingbakery.se,59.31,18.07,OpenStreetMap\n"
        "node,2,New Amazing Sourdough,bakery,Bakery,,Mo-Fr 08:00-17:00,Renstiernas gata,20,https://sourdough.se,59.315,18.08,OpenStreetMap\n"
        "node,3,Espresso House,cafe,Café,,,,,,,,OpenStreetMap\n",
        encoding="utf-8",
    )

    monkeypatch.setattr(
        comp,
        "fetch_google_places",
        lambda api_key, queries: [
            {
                "id": "g-1",
                "displayName": {"text": "Google Fresh Bistro"},
                "formattedAddress": "Götgatan 50, Stockholm",
                "location": {"latitude": 59.314, "longitude": 18.072},
                "websiteUri": "https://freshbistro.se",
                "businessStatus": "OPERATIONAL",
            },
            {
                "id": "g-2",
                "displayName": {"text": "Starbucks Central"},
                "formattedAddress": "Centralstationen, Stockholm",
                "businessStatus": "OPERATIONAL",
            },
        ],
    )

    report = comp.run_comparison(
        api_key="mock-key",
        places_path=places_file,
        osm_path=osm_file,
    )

    # 1. Check closure detection for Arirang
    assert any(c["name"] == "Arirang" and c["status"] == "CLOSED_PERMANENTLY" for c in report["detectedClosures"])

    # 2. Check candidate discovery
    candidate_names = [c["name"] for c in report["newCandidates"]]
    assert "Google Fresh Bistro" in candidate_names
    assert "New Amazing Sourdough" in candidate_names
    # Excluded chains must never appear
    assert "Starbucks Central" not in candidate_names
    assert "Espresso House" not in candidate_names

    # 3. Check missing attributes enrichment
    assert any(m["id"] == 102 and "address" in m["canEnrich"] and "website" in m["canEnrich"] for m in report["missingAttributes"])
