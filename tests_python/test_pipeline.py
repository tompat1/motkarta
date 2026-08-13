from pathlib import Path
import json

from motkarta.concierge import answer_query, load_rag_corpus
from motkarta.pipeline import clean_places, dedupe_places, load_raw_csv, score_places, write_place_inputs_json
from scripts.run_mvp_pipeline import run_pipeline


FIXTURE = Path("tests_python/fixtures/stockholm_food_places_raw.csv")


def test_clean_dedupe_and_score_pipeline():
    raw = load_raw_csv(FIXTURE)
    clean = clean_places(raw)

    assert set(clean["establishment_type"]) == {"Café", "Specialty coffee", "Bakery", "Bistro"}
    assert clean.loc[0, "website"] == "https://example.com"
    assert clean.loc[0, "address"] == "Testgatan 1"

    deduped, duplicates = dedupe_places(clean)
    assert len(deduped) == 4
    assert len(duplicates) == 1

    scored = score_places(deduped)
    assert "discovery_score" in scored
    assert scored["discovery_score"].between(0, 100).all()


def test_full_mvp_pipeline_writes_artifacts(tmp_path):
    data_dir = tmp_path / "data"
    output_dir = tmp_path / "outputs"

    run_pipeline(FIXTURE, data_dir, output_dir)

    assert (data_dir / "stockholm_food_places_clean.csv").exists()
    assert (data_dir / "stockholm_food_places_deduped.csv").exists()
    assert (data_dir / "stockholm_food_places_scored.csv").exists()
    assert (output_dir / "stockholm_food_map.html").exists()
    assert (output_dir / "stockholm_food_places.geojson").exists()
    assert (output_dir / "coverage_report.md").exists()
    assert (output_dir / "rag_corpus.jsonl").exists()

    map_html = (output_dir / "stockholm_food_map.html").read_text(encoding="utf-8")
    assert 'Type \\u00b7 Specialty coffee' in map_html
    assert 'Neighbourhood \\u00b7 Central Stockholm' in map_html
    assert 'Cuisine \\u00b7 Coffee' in map_html
    assert 'Missing info \\u00b7 Missing opening hours' in map_html

    geojson = json.loads((output_dir / "stockholm_food_places.geojson").read_text(encoding="utf-8"))
    assert geojson["type"] == "FeatureCollection"
    assert len(geojson["features"]) == 4

    public_data = tmp_path / "public" / "data"
    run_pipeline(FIXTURE, data_dir, output_dir, public_data)
    places_payload = json.loads((public_data / "places.json").read_text(encoding="utf-8"))
    assert places_payload["source"] == "osm"
    assert places_payload["places"][0]["kind"] in {"Café", "Specialty coffee", "Bakery", "Bistro"}

    documents = load_rag_corpus(output_dir / "rag_corpus.jsonl")
    results = answer_query("filter coffee roaster", documents, limit=1)
    assert results[0]["title"] == "Small Roaster"


def test_full_mvp_pipeline_appends_source_metadata(tmp_path):
    data_dir = tmp_path / "data"
    output_dir = tmp_path / "outputs"
    metadata_path = tmp_path / "raw" / "metadata.json"
    metadata_path.parent.mkdir(parents=True)
    metadata_path.write_text(
        json.dumps(
            {
                "source": "OpenStreetMap Overpass API",
                "boundary_reference": "OSM administrative area named Stockholms kommun",
                "fetched_at": "2026-08-13T12:00:00+00:00",
                "query_hash": "abc123",
                "cache_path": "data/raw/osm.json",
                "license": "ODbL",
            }
        ),
        encoding="utf-8",
    )

    run_pipeline(FIXTURE, data_dir, output_dir, source_metadata_path=metadata_path)

    report = (output_dir / "coverage_report.md").read_text(encoding="utf-8")
    assert "## Source Metadata" in report
    assert "Stockholms kommun" in report


def test_place_inputs_json_matches_frontend_shape(tmp_path):
    scored = score_places(dedupe_places(clean_places(load_raw_csv(FIXTURE)))[0])
    target = tmp_path / "places.json"

    write_place_inputs_json(scored, target)

    payload = json.loads(target.read_text(encoding="utf-8"))
    place = payload["places"][0]
    assert payload["source"] == "osm"
    assert {"id", "name", "kind", "area", "tags", "evidence", "engagement", "x", "y"} <= set(place)
    assert place["evidence"]["confidence"] == "Low"
