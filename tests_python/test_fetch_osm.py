import json

import scripts.fetch_osm as fetch_osm


def test_municipality_query_uses_stockholm_scb_boundary():
    query = fetch_osm.query_for_boundary("municipality")

    assert '"name"="Stockholms kommun"' in query
    assert "area.searchArea" in query
    assert fetch_osm.BBOX not in query


def test_load_or_fetch_payload_uses_cache_without_network(tmp_path, monkeypatch):
    cache = tmp_path / "osm.json"
    metadata = tmp_path / "metadata.json"
    payload = {"elements": [{"type": "node", "id": 1, "tags": {"name": "Cached"}, "lat": 59.3, "lon": 18.0}]}
    cache.write_text(json.dumps(payload), encoding="utf-8")

    def fail_fetch(*args, **kwargs):
        raise AssertionError("network should not be called when cache exists")

    monkeypatch.setattr(fetch_osm, "fetch_overpass", fail_fetch)

    loaded = fetch_osm.load_or_fetch_payload(
        query="query",
        urls=["https://example.test"],
        cache_path=cache,
        metadata_path=metadata,
        refresh=False,
        boundary="municipality",
    )

    assert loaded == payload


def test_load_or_fetch_payload_refresh_writes_cache_and_metadata(tmp_path, monkeypatch):
    cache = tmp_path / "osm.json"
    metadata = tmp_path / "metadata.json"
    payload = {"elements": [{"type": "node", "id": 1, "tags": {"name": "Fresh"}, "lat": 59.3, "lon": 18.0}]}

    monkeypatch.setattr(fetch_osm, "fetch_overpass", lambda query, urls: (payload, urls[0]))

    loaded = fetch_osm.load_or_fetch_payload(
        query="query",
        urls=["https://overpass.example.test"],
        cache_path=cache,
        metadata_path=metadata,
        refresh=True,
        boundary="municipality",
    )

    source_metadata = json.loads(metadata.read_text(encoding="utf-8"))
    assert loaded == payload
    assert json.loads(cache.read_text(encoding="utf-8")) == payload
    assert source_metadata["source"] == "OpenStreetMap Overpass API"
    assert source_metadata["boundary"] == "municipality"
    assert source_metadata["source_url"] == "https://overpass.example.test"
    assert source_metadata["query_hash"]


def test_rows_from_payload_normalizes_establishment_types():
    payload = {
        "elements": [
            {
                "type": "node",
                "id": 10,
                "tags": {
                    "name": "Boundary Bistro",
                    "amenity": "restaurant",
                    "cuisine": "bistro",
                    "addr:street": "Testgatan",
                    "addr:housenumber": "1",
                },
                "lat": 59.3,
                "lon": 18.0,
            }
        ]
    }

    rows = fetch_osm.rows_from_payload(payload)

    assert rows[0]["establishment_type"] == "Restaurant"
    assert rows[0]["source"] == "OpenStreetMap"
