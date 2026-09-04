import json

import pytest

from scripts import sync_curated_sources as sync


def test_curated_source_sync_adds_neutral_places(tmp_path):
    places_path = tmp_path / "places.json"
    curated_path = tmp_path / "curated.json"
    places_path.write_text(
        json.dumps(
            {
                "source": "osm",
                "places": [
                    {
                        "id": 1,
                        "name": "OSM Cafe",
                        "kind": "Café",
                        "area": "Södermalm",
                        "sourceName": "OpenStreetMap",
                        "latitude": 59.3,
                        "longitude": 18.0,
                        "ratingAverage": 0,
                        "reliableRatingCount": 0,
                        "reviewCount": 0,
                        "categoryMeanRating": 0,
                        "categoryPopularityRaw": 0,
                        "localPopularityPercentile": 0,
                        "priceLevel": 0,
                    }
                ],
            }
        ),
        encoding="utf-8",
    )
    curated_path.write_text(
        json.dumps(
            {
                "places": [
                    {
                        "sourceId": "visit-stockholm:test",
                        "name": "Curated Test",
                        "kind": "Restaurant",
                        "area": "Norrmalm",
                        "address": "Testgatan 1",
                        "sourceName": "Visit Stockholm (Officiella Stadsguiden)",
                        "sourceUrl": "https://www.visitstockholm.se/",
                        "latitude": 59.33,
                        "longitude": 18.06,
                        "tags": ["Curated", "Visit Stockholm"],
                        "evidence": {"independentEditorial": 1, "confidence": "Medium"},
                    }
                ]
            }
        ),
        encoding="utf-8",
    )

    result = sync.sync_curated_sources(places_path, curated_path, quiet=True)
    payload = json.loads(places_path.read_text(encoding="utf-8"))
    added = payload["places"][0]

    assert result["added"] == 1
    assert payload["source"] == "osm_curated_open_sources"
    assert added["sourceName"] == "Visit Stockholm (Officiella Stadsguiden)"
    assert added["ratingAverage"] == 0
    assert added["reviewCount"] == 0
    assert added["priceLevel"] == 0
    assert added["engagement"]["searchImpressions"] == 0


def test_curated_source_sync_rejects_value_fields(tmp_path):
    places_path = tmp_path / "places.json"
    curated_path = tmp_path / "curated.json"
    places_path.write_text(json.dumps({"source": "osm", "places": []}), encoding="utf-8")
    curated_path.write_text(
        json.dumps(
            {
                "places": [
                    {
                        "name": "Bad Curated",
                        "sourceName": "Visit Stockholm (Officiella Stadsguiden)",
                        "ratingAverage": 4.9,
                    }
                ]
            }
        ),
        encoding="utf-8",
    )

    with pytest.raises(ValueError, match="forbidden value fields"):
        sync.sync_curated_sources(places_path, curated_path, quiet=True)


def test_curated_source_sync_skips_out_of_scope_places(tmp_path):
    places_path = tmp_path / "places.json"
    curated_path = tmp_path / "curated.json"
    places_path.write_text(json.dumps({"source": "osm", "places": []}), encoding="utf-8")
    curated_path.write_text(
        json.dumps(
            {
                "places": [
                    {
                        "sourceId": "tasstipset:basta-umea",
                        "name": "Basta Umeå",
                        "kind": "Restaurant",
                        "area": "Stockholm",
                        "address": "Västra Rådhusgatan 7, 903 26 Umeå",
                        "sourceName": "Tasstipset",
                        "sourceUrl": "https://tasstipset.se/plats/basta-umea",
                        "latitude": 63.8258,
                        "longitude": 20.263,
                    },
                    {
                        "sourceId": "visit-stockholm:local",
                        "name": "Local Stockholm",
                        "kind": "Restaurant",
                        "area": "Norrmalm",
                        "address": "Drottninggatan 1, Stockholm",
                        "sourceName": "Visit Stockholm (Officiella Stadsguiden)",
                        "sourceUrl": "https://www.visitstockholm.se/",
                        "latitude": 59.33,
                        "longitude": 18.06,
                    },
                ]
            }
        ),
        encoding="utf-8",
    )

    result = sync.sync_curated_sources(places_path, curated_path, quiet=True)
    payload = json.loads(places_path.read_text(encoding="utf-8"))

    assert result["added"] == 1
    assert result["skipped_out_of_scope"] == 1
    assert [place["name"] for place in payload["places"]] == ["Local Stockholm"]


def test_curated_source_sync_does_not_merge_out_of_scope_records(tmp_path):
    places_path = tmp_path / "places.json"
    curated_path = tmp_path / "curated.json"
    places_path.write_text(
        json.dumps(
            {
                "source": "osm",
                "places": [
                    {
                        "id": 1,
                        "name": "Basta Umeå",
                        "area": "Stockholm",
                        "address": "Västra Rådhusgatan 7, 903 26 Umeå",
                        "sourceName": "OpenStreetMap",
                    }
                ],
            }
        ),
        encoding="utf-8",
    )
    curated_path.write_text(
        json.dumps(
            {
                "places": [
                    {
                        "sourceId": "tasstipset:basta-umea",
                        "name": "Basta Umeå",
                        "kind": "Restaurant",
                        "area": "Stockholm",
                        "address": "Västra Rådhusgatan 7, 903 26 Umeå",
                        "sourceName": "Tasstipset",
                        "sourceUrl": "https://tasstipset.se/plats/basta-umea",
                    }
                ]
            }
        ),
        encoding="utf-8",
    )

    result = sync.sync_curated_sources(places_path, curated_path, quiet=True)
    payload = json.loads(places_path.read_text(encoding="utf-8"))

    assert result["updated"] == 0
    assert result["skipped_out_of_scope"] == 1
    assert payload["places"][0]["sourceName"] == "OpenStreetMap"
