import json
from unittest.mock import MagicMock

import pytest
import requests

import scripts.fetch_osm as fetch_osm


def test_build_chunk_query_uses_stockholm_municipality_boundary():
    query = fetch_osm.build_chunk_query(
        "amenity",
        "restaurant",
        "59.30,18.00,59.40,18.10",
        boundary="municipality",
        page_size=500,
    )

    assert '"name"="Stockholms kommun"' in query
    assert "area.searchArea" in query
    assert 'nwr["amenity"="restaurant"]' in query
    assert "out center meta 500" in query


def test_bbox_tiles_splits_stockholm_bbox_into_grid():
    tiles = fetch_osm.bbox_tiles(fetch_osm.BBOX, rows=3, cols=3)

    assert len(tiles) == 9
    assert all(len(tile.split(",")) == 4 for tile in tiles)


def test_load_or_fetch_payload_uses_cache_without_network(tmp_path, monkeypatch):
    cache = tmp_path / "osm.json"
    metadata = tmp_path / "metadata.json"
    payload = {"elements": [{"type": "node", "id": 1, "tags": {"name": "Cached"}, "lat": 59.3, "lon": 18.0}]}
    cache.write_text(json.dumps(payload), encoding="utf-8")

    def fail_fetch(*args, **kwargs):
        raise AssertionError("network should not be called when cache exists")

    monkeypatch.setattr(fetch_osm, "fetch_chunked_overpass", fail_fetch)

    loaded = fetch_osm.load_or_fetch_payload(
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

    monkeypatch.setattr(
        fetch_osm,
        "fetch_chunked_overpass",
        lambda urls, boundary, **kwargs: (payload, ["https://overpass.example.test"], 12),
    )

    loaded = fetch_osm.load_or_fetch_payload(
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
    assert source_metadata["source_url"] == ["https://overpass.example.test"]
    assert source_metadata["fetch_mode"] == "chunked"
    assert source_metadata["chunk_requests"] == 12
    assert source_metadata["page_size"] == 500
    assert source_metadata["query_hash"]


def test_fetch_overpass_retries_transient_errors(monkeypatch):
    calls = {"count": 0}

    def fake_post(url, **kwargs):
        calls["count"] += 1
        if calls["count"] < 3:
            response = MagicMock()
            response.status_code = 504
            response.text = "gateway timeout"
            raise requests.HTTPError("504 Server Error", response=response)
        response = MagicMock()
        response.status_code = 200
        response.json.return_value = {"elements": []}
        response.raise_for_status.return_value = None
        return response

    monkeypatch.setattr(fetch_osm.requests, "post", fake_post)
    monkeypatch.setattr(fetch_osm.time, "sleep", lambda _seconds: None)

    payload, endpoint = fetch_osm.fetch_overpass(
        "query",
        ["https://overpass.example.test"],
        attempts_per_url=3,
        initial_backoff_seconds=1.0,
        max_backoff_seconds=1.0,
    )

    assert payload == {"elements": []}
    assert endpoint == "https://overpass.example.test"
    assert calls["count"] == 3


def test_fetch_chunked_overpass_paginates_and_dedupes(monkeypatch):
    calls = {"count": 0}

    def fake_fetch_overpass(query, urls):
        calls["count"] += 1
        if "if:id() > 2" in query:
            return {"elements": [{"type": "node", "id": 3, "tags": {"name": "Late"}}]}, urls[0]
        if calls["count"] == 1:
            return {
                "elements": [
                    {"type": "node", "id": 1, "tags": {"name": "One"}},
                    {"type": "node", "id": 2, "tags": {"name": "Two"}},
                ]
            }, urls[0]
        return {"elements": []}, urls[0]

    monkeypatch.setattr(fetch_osm, "fetch_overpass", fake_fetch_overpass)
    monkeypatch.setattr(fetch_osm, "FILTER_SLICES", [("amenity", "restaurant")])
    monkeypatch.setattr(fetch_osm, "bbox_tiles", lambda bbox, rows, cols: ["59.30,18.00,59.40,18.10"])
    monkeypatch.setattr(fetch_osm.time, "sleep", lambda _seconds: None)

    payload, endpoints, request_count = fetch_osm.fetch_chunked_overpass(
        ["https://overpass.example.test"],
        "municipality",
        page_size=2,
        rows=1,
        cols=1,
        pause_seconds=0,
    )

    assert request_count == 2
    assert len(payload["elements"]) == 3
    assert endpoints == ["https://overpass.example.test", "https://overpass.example.test"]


def test_load_or_fetch_payload_refresh_falls_back_to_stale_cache(tmp_path, monkeypatch):
    cache = tmp_path / "osm.json"
    metadata = tmp_path / "metadata.json"
    payload = {"elements": [{"type": "node", "id": 1, "tags": {"name": "Cached"}, "lat": 59.3, "lon": 18.0}]}
    cache.write_text(json.dumps(payload), encoding="utf-8")

    def fail_fetch(*args, **kwargs):
        raise RuntimeError("Overpass request failed:\nhttps://overpass.example.test: 504")

    monkeypatch.setattr(fetch_osm, "fetch_chunked_overpass", fail_fetch)

    loaded = fetch_osm.load_or_fetch_payload(
        urls=["https://overpass.example.test"],
        cache_path=cache,
        metadata_path=metadata,
        refresh=True,
        boundary="municipality",
    )

    source_metadata = json.loads(metadata.read_text(encoding="utf-8"))
    assert loaded == payload
    assert source_metadata["stale_fallback"] is True
    assert "504" in source_metadata["stale_fallback_reason"]


def test_load_or_fetch_payload_refresh_without_cache_raises(tmp_path, monkeypatch):
    cache = tmp_path / "osm.json"
    metadata = tmp_path / "metadata.json"

    def fail_fetch(*args, **kwargs):
        raise RuntimeError("Overpass request failed")

    monkeypatch.setattr(fetch_osm, "fetch_chunked_overpass", fail_fetch)

    with pytest.raises(RuntimeError, match="Overpass request failed"):
        fetch_osm.load_or_fetch_payload(
            urls=["https://overpass.example.test"],
            cache_path=cache,
            metadata_path=metadata,
            refresh=True,
            boundary="municipality",
        )


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
