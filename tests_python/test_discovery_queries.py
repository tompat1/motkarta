from motkarta.discovery_queries import (
    CITYWIDE_DISCOVERY_QUERIES,
    STOCKHOLM_DISCOVERY_DISTRICTS,
    build_discovery_queries,
)


def test_build_discovery_queries_includes_citywide_and_vasastan_pizzeria():
    queries = build_discovery_queries(districts=["Vasastan"], include_citywide=True)
    assert "new independent restaurants Stockholm" in queries
    assert "pizzeria Vasastan Stockholm" in queries
    assert "independent restaurants Vasastan Stockholm" in queries


def test_build_discovery_queries_deduplicates_templates():
    queries = build_discovery_queries(districts=["Vasastan", "Vasastan"])
    assert queries.count("pizzeria Vasastan Stockholm") == 1


def test_default_discovery_queries_cover_core_districts():
    queries = build_discovery_queries()
    assert len(queries) > len(CITYWIDE_DISCOVERY_QUERIES)
    assert any("Vasastan" in query for query in queries)
    assert any(district in " ".join(queries) for district in STOCKHOLM_DISCOVERY_DISTRICTS[:3])
