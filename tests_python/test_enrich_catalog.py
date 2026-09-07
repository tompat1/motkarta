from __future__ import annotations

import json
from pathlib import Path
from execution.enrich_catalog import (
    WebsiteScraper,
    extract_facts_from_html,
    extract_ground_truth_facts,
    extract_curated_place_facts,
    extract_osm_facts,
    merge_facts,
    normalize_name,
)


def test_normalize_name() -> None:
    assert normalize_name("85 Kvadrat!") == "85 kvadrat"
    assert normalize_name("Frantzén") == "frantzen"
    assert normalize_name("Lykke Nytorget") == "lykke nytorget"


def test_extract_facts_from_html_dishes_and_atmosphere() -> None:
    sample_html = """
    <html>
    <head><title>85 Kvadrat Pierogarnia</title></head>
    <body>
        <h1>Välkommen till 85 Kvadrat</h1>
        <p>Vi serverar hemmagjorda <strong>pierogi</strong>, bigos och żurek i en mysig atmosfär.</p>
        <p>Öppettider: Mån-Fre 17:00 - 22:30</p>
        <p>Pris: 120:- till 220 kr per rätt.</p>
    </body>
    </html>
    """
    facts = extract_facts_from_html(
        sample_html,
        "https://85kvadrat.gastrogate.com/",
        1386457571,
        "2026-09-07T12:00:00Z",
    )

    fields = {f["field"]: f["value"] for f in facts}
    assert "pierogi" in [f["value"] for f in facts if f["field"] == "dish"]
    assert "bigos" in [f["value"] for f in facts if f["field"] == "dish"]
    assert "cozy" in [f["value"] for f in facts if f["field"] == "atmosphere"]
    assert "openingHours" in fields
    assert "priceSEK" in fields
    assert all(f["source"] == "Venue Website (85kvadrat.gastrogate.com)" for f in facts)
    assert all(f["verification"] == "listed" for f in facts)


def test_website_scraper_cache(tmp_path: Path) -> None:
    scraper = WebsiteScraper(cache_dir=tmp_path)
    url = "https://example.com/test-menu"
    import hashlib
    url_hash = hashlib.sha256(url.encode("utf-8")).hexdigest()[:16]
    cache_file = tmp_path / f"{url_hash}.html"
    cache_file.write_text("<html><body>Cardamom bun & espresso</body></html>", encoding="utf-8")

    content = scraper.fetch_url(url)
    assert content == "<html><body>Cardamom bun & espresso</body></html>"

