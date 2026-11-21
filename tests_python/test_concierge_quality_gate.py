"""CI release gate for the deterministic portion of Concierge RAG.

This deliberately does not score mocked semantic or synthesis providers. Live
provider quality, latency, and cost require authorized captures and are gated
separately.
"""

from __future__ import annotations

import json
from pathlib import Path
import subprocess

from execution.evaluate_concierge import report


ROOT = Path(__file__).resolve().parents[1]
FIXTURES = ROOT / "tests/fixtures/concierge"
RUNNER = ROOT / "execution/run_concierge_evaluation.mjs"


def run_retrieval(catalog: Path, queries: Path, output: Path) -> dict:
    subprocess.run(
        ["node", str(RUNNER), str(catalog), str(queries), str(output), "-", "-"],
        cwd=ROOT,
        check=True,
    )
    return json.loads(output.read_text())


def test_corrected_lexical_rag_meets_frozen_quality_and_safety_floors(tmp_path):
    catalog_data = json.loads((FIXTURES / "places.json").read_text())
    query_data = json.loads((FIXTURES / "queries.json").read_text())
    queries = query_data["queries"]

    assert len(queries) == 128
    assert len({query["family"] for query in queries}) == 32
    assert {query["language"] for query in queries} == {"en", "pl", "sv"}
    assert all(
        len([query for query in queries if query["family"] == family]) == 4
        for family in {query["family"] for query in queries}
    )

    first = run_retrieval(
        FIXTURES / "places.json", FIXTURES / "queries.json", tmp_path / "first.json"
    )
    second = run_retrieval(
        FIXTURES / "places.json", FIXTURES / "queries.json", tmp_path / "second.json"
    )

    assert first["semanticMeasured"] is False
    assert first["corpusHash"] == second["corpusHash"]
    assert [row["id"] for row in first["results"]] == [
        query["id"] for query in queries
    ]
    assert [row["corrected"] for row in first["results"]] == [
        row["corrected"] for row in second["results"]
    ]
    for row in first["results"]:
        assert len(row["corrected"]) <= 50
        assert len(row["corrected"]) == len(set(row["corrected"]))

    evaluation = report(
        first,
        query_data,
        {str(place["id"]): place for place in catalog_data["places"]},
    )
    corrected = evaluation["methods"]["corrected"]
    aggregate = corrected["aggregate"]

    assert aggregate["queryCount"] == 128
    assert aggregate["recallAt50"] >= 0.90
    assert aggregate["ndcgAt5"] >= 0.90
    assert aggregate["unsupportedAbstention"] == 1.0
    assert aggregate["exactNameSuccess"] == 1.0
    assert aggregate["catalogCoverage"] >= 0.70
    assert aggregate["exposureGini"] <= 0.45
    assert aggregate["independentExposureShare"] == 1.0
    assert aggregate["satisfaction"] is None

    slices = corrected["slices"]
    for split in ("development", "holdout"):
        assert slices[f"split:{split}"]["recallAt50"] >= 0.90
        assert slices[f"split:{split}"]["ndcgAt5"] >= 0.90
    assert slices["language:en"]["recallAt50"] >= 0.95
    assert slices["language:sv"]["recallAt50"] >= 0.75
    assert slices["language:pl"]["recallAt50"] == 1.0
    assert slices["venueType:Specialty coffee"]["recallAt50"] == 1.0
    assert slices["chainStatus:not_applicable"]["unsupportedAbstention"] == 1.0


def test_evaluation_uses_full_candidate_budget_without_duplicates(tmp_path):
    seed = next(
        place
        for place in json.loads((FIXTURES / "places.json").read_text())["places"]
        if place["id"] == 8
    )
    places = [
        {**seed, "id": 10_000 + index, "name": f"Independent Thai {index:02d}"}
        for index in range(80)
    ]
    catalog = tmp_path / "places.json"
    queries = tmp_path / "queries.json"
    catalog.write_text(json.dumps({"places": places}))
    queries.write_text(json.dumps({"queries": [{"id": "saturated", "query": "thai"}]}))

    first = run_retrieval(catalog, queries, tmp_path / "capacity-first.json")
    second = run_retrieval(catalog, queries, tmp_path / "capacity-second.json")
    candidates = first["results"][0]["corrected"]

    assert len(candidates) == 50
    assert len(set(candidates)) == 50
    assert candidates == second["results"][0]["corrected"]
    assert set(candidates).issubset({place["id"] for place in places})
