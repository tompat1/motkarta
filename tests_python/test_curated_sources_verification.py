from scripts.verify_curated_sources import verify_all_curated_sources


def test_verify_all_curated_sources():
    summary = verify_all_curated_sources(quiet=True)
    assert summary["status"] == "PASS"
    assert summary["total_sources"] == 18
    assert summary["sources_passed"] == 18

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
    assert sources_by_id["tasstipset"]["eligible_coverage_pct"] >= 50.0
    assert sources_by_id["tasstipset"]["source_only_venues"] == 0
    assert sources_by_id["tasstipset"]["ineligible_dog_venues"] == 0
    assert sources_by_id["tasstipset"]["matched_places"] >= 150
    assert sources_by_id["tasstipset"]["out_of_scope"] == 0
    assert sources_by_id["tasstipset"]["status"] == "PASS"

    # 8. Burgerdudes (Verified Burger Guide)
    assert "burgerdudes" in sources_by_id
    assert sources_by_id["burgerdudes"]["coverage_pct"] >= 85.0
    assert sources_by_id["burgerdudes"]["status"] == "PASS"

    # 9. Spotted by Locals
    assert "spotted-by-locals" in sources_by_id
    assert sources_by_id["spotted-by-locals"]["coverage_pct"] >= 85.0
    assert sources_by_id["spotted-by-locals"]["status"] == "PASS"

    # 10. Guide Michelin Nordic
    assert "michelin-guide" in sources_by_id
    assert sources_by_id["michelin-guide"]["coverage_pct"] >= 85.0
    assert sources_by_id["michelin-guide"]["status"] == "PASS"

    # 11. Dagens Nyheter
    assert "dn-krog" in sources_by_id
    assert sources_by_id["dn-krog"]["coverage_pct"] >= 85.0
    assert sources_by_id["dn-krog"]["status"] == "PASS"

    # 12. Svenska Dagbladet
    assert "svd-krogguiden" in sources_by_id
    assert sources_by_id["svd-krogguiden"]["coverage_pct"] >= 85.0
    assert sources_by_id["svd-krogguiden"]["status"] == "PASS"

    # 13. Allt om Mat
    assert "allt-om-mat" in sources_by_id
    assert sources_by_id["allt-om-mat"]["coverage_pct"] >= 85.0
    assert sources_by_id["allt-om-mat"]["status"] == "PASS"

    # 14. Vagabond
    assert "vagabond" in sources_by_id
    assert sources_by_id["vagabond"]["coverage_pct"] >= 85.0
    assert sources_by_id["vagabond"]["status"] == "PASS"

    # 15. Stora Restaurangpriset
    assert "stora-restaurangpriset" in sources_by_id
    assert sources_by_id["stora-restaurangpriset"]["coverage_pct"] >= 85.0
    assert sources_by_id["stora-restaurangpriset"]["status"] == "PASS"

    # 16. Sveriges Bästa
    assert "sveriges-basta" in sources_by_id
    assert sources_by_id["sveriges-basta"]["coverage_pct"] >= 85.0
    assert sources_by_id["sveriges-basta"]["status"] == "PASS"

    # 17. Thatsup Stockholm (discovery lead; separate corroboration required for quality)
    assert "thatsup" in sources_by_id
    assert sources_by_id["thatsup"]["coverage_pct"] >= 85.0
    assert sources_by_id["thatsup"]["status"] == "PASS"
