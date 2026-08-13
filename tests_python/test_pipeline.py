from pathlib import Path
import json

from motkarta.concierge import answer_query, load_rag_corpus
from motkarta.pipeline import clean_places, dedupe_places, load_raw_csv, score_places
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

    documents = load_rag_corpus(output_dir / "rag_corpus.jsonl")
    results = answer_query("filter coffee roaster", documents, limit=1)
    assert results[0]["title"] == "Small Roaster"
