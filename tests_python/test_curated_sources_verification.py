import pytest
from scripts.verify_curated_sources import verify_all_curated_sources


def test_verify_all_curated_sources():
    summary = verify_all_curated_sources(quiet=True)
    assert summary["status"] == "PASS"
    assert summary["total_sources"] == 7
    assert summary["sources_passed"] == 7

    sources_by_id = {s["id"]: s for s in summary["sources"]}

    # 1. Anders Husa & Kaitlin Orr Guide
    assert "husa-guide" in sources_by_id
    assert sources_by_id["husa-guide"]["coverage_pct"] >= 85.0
    assert sources_by_id["husa-guide"]["status"] == "PASS"

    # 2. Stockholms Stad Livsmedelskontroll
    assert "stockholm-stad" in sources_by_id
    assert sources_by_id["stockholm-stad"]["coverage_pct"] >= 70.0
    assert sources_by_id["stockholm-stad"]["status"] == "PASS"

    # 3. OpenStreetMap Contributors
    assert "openstreetmap" in sources_by_id
    assert sources_by_id["openstreetmap"]["coverage_pct"] >= 75.0
    assert sources_by_id["openstreetmap"]["status"] == "PASS"

    # 4. White Guide Nordic
    assert "white-guide" in sources_by_id
    assert sources_by_id["white-guide"]["coverage_pct"] >= 85.0
    assert sources_by_id["white-guide"]["status"] == "PASS"

    # 5. Specialty Coffee Sweden Registry
    assert "specialty-coffee-se" in sources_by_id
    assert sources_by_id["specialty-coffee-se"]["coverage_pct"] >= 85.0
    assert sources_by_id["specialty-coffee-se"]["status"] == "PASS"

    # 6. Visit Stockholm (Official City Guide)
    assert "visit-stockholm" in sources_by_id
    assert sources_by_id["visit-stockholm"]["coverage_pct"] >= 85.0
    assert sources_by_id["visit-stockholm"]["status"] == "PASS"

    # 7. Tasstipset (Hundvänliga ställen)
    assert "tasstipset" in sources_by_id
    assert sources_by_id["tasstipset"]["coverage_pct"] >= 60.0
    assert sources_by_id["tasstipset"]["matched_places"] >= 150
    assert sources_by_id["tasstipset"]["out_of_scope"] == 0
    assert sources_by_id["tasstipset"]["status"] == "PASS"
