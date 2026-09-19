from __future__ import annotations

import json
from pathlib import Path
from execution.enrich_catalog import (
    WebsiteScraper,
    build_cuisine_dish_map,
    build_dish_keywords,
    extract_facts_from_html,
    extract_ground_truth_facts,
    extract_curated_place_facts,
    extract_osm_facts,
    load_cuisine_dish_registry,
    merge_facts,
    normalize_name,
)


def test_cuisine_dish_registry_loader() -> None:
    registry = load_cuisine_dish_registry()
    assert registry["version"] == "concierge-cuisine-dishes-v2"
    cuisine_map = build_cuisine_dish_map(registry)
    keywords = build_dish_keywords(registry)
    assert "polish" in cuisine_map
    assert "pierogi" in cuisine_map["polish"]
    assert "belgian" in cuisine_map
    assert "moules-frites" in cuisine_map["belgian"]
    assert keywords["moules frites"] == "moules-frites"
    assert keywords["lohikeitto"] == "lohikeitto"
    assert keywords["salmon soup"] == "lohikeitto"


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


def test_venue_enrichment_priority() -> None:
    from execution.enrich_catalog import venue_enrichment_priority

    missing_both = {"id": 1}
    missing_hours = {"id": 2, "priceSEK": "150-300"}
    missing_price = {"id": 3, "openingHours": "Tu-Sa 17:00-23:00"}
    fully_enriched = {"id": 4, "openingHours": "Tu-Sa 17:00-23:00", "priceSEK": "220-450"}

    assert venue_enrichment_priority(missing_both) == 0
    assert venue_enrichment_priority(missing_hours) == 1
    assert venue_enrichment_priority(missing_price) == 2
    assert venue_enrichment_priority(fully_enriched) == 3  # top level is now 3 (no legacy-default tier)


def test_extract_facts_jsonld_takes_precedence_over_regex() -> None:
    """JSON-LD structured hours/price are extracted before BeautifulSoup strips scripts.
    Regex fallback must not produce a duplicate fact when JSON-LD already provided the field.
    """
    html = (
        '<html><head><script type="application/ld+json">{'
        '"@type": "Restaurant",'
        '"openingHoursSpecification": [{"dayOfWeek": ["Monday", "Tuesday"],'
        ' "opens": "11:00", "closes": "22:00"}],'
        '"priceRange": "$$"'
        '}</script></head>'
        '<body><p>\xd6ppettider: M\xe5ndag-Fredag 11:00-22:00. Lunch 145 kr.</p></body></html>'
    )
    facts = extract_facts_from_html(html, "https://example.com", 99, "2026-01-01T00:00:00Z")
    hours_facts = [f for f in facts if f["field"] == "openingHours"]
    price_facts = [f for f in facts if f["field"] == "priceSEK"]
    # Exactly one hours fact from JSON-LD, not a duplicate from regex
    assert len(hours_facts) == 1
    # Two separate dayOfWeek entries are formatted with a comma separator
    assert hours_facts[0]["value"] in ("Mo, Tu 11:00-22:00", "Mo-Tu 11:00-22:00")
    # Price from JSON-LD symbol; regex 145 kr body text must be suppressed
    assert len(price_facts) == 1
    assert price_facts[0]["value"] == "$$"


def test_extract_facts_jsonld_address() -> None:
    """JSON-LD PostalAddress emits an address fact."""
    html = (
        '<html><head><script type="application/ld+json">{'
        '"@type": "Restaurant",'
        '"address": {"@type": "PostalAddress",'
        ' "streetAddress": "Drottninggatan 12", "addressLocality": "Stockholm"}'
        '}</script></head><body>text</body></html>'
    )
    facts = extract_facts_from_html(html, "https://example.com", 42, "2026-01-01T00:00:00Z")
    addr_facts = [f for f in facts if f["field"] == "address"]
    assert len(addr_facts) == 1
    assert addr_facts[0]["value"] == "Drottninggatan 12, Stockholm"


def test_website_scraper_stale_cache_refetches(tmp_path: Path, monkeypatch) -> None:
    """A cache file older than max_age_days must trigger a real HTTP fetch, not serve stale HTML."""
    import hashlib, time
    from execution.enrich_catalog import WebsiteScraper

    scraper = WebsiteScraper(cache_dir=tmp_path, max_age_days=7)
    url = "https://example.com/test-stale"
    url_hash = hashlib.sha256(url.encode("utf-8")).hexdigest()[:16]
    cache_file = tmp_path / f"{url_hash}.html"
    stale_content = "<html><body>stale content</body></html>"
    cache_file.write_text(stale_content, encoding="utf-8")

    # Backdate the mtime by 8 days so it exceeds the 7-day limit
    old_mtime = time.time() - 8 * 86400
    import os
    os.utime(cache_file, (old_mtime, old_mtime))

    fetched_urls = []

    def fake_can_fetch(url):
        return False  # robots.txt blocks — simulates a cache-miss that can't re-fetch
    monkeypatch.setattr(scraper, "can_fetch", fake_can_fetch)

    result = scraper.fetch_url(url)
    # Stale cache was expired; can_fetch returned False, so result is None (not stale HTML)
    assert result is None, "Stale cache must not be served; expected None when blocked by robots"


def test_website_scraper_fresh_cache_served(tmp_path: Path) -> None:
    """A cache file within max_age_days must be served without any HTTP request."""
    import hashlib
    from execution.enrich_catalog import WebsiteScraper

    scraper = WebsiteScraper(cache_dir=tmp_path, max_age_days=30)
    url = "https://example.com/fresh-cache"
    url_hash = hashlib.sha256(url.encode("utf-8")).hexdigest()[:16]
    cache_file = tmp_path / f"{url_hash}.html"
    fresh_content = "<html><body>fresh cached content</body></html>"
    cache_file.write_text(fresh_content, encoding="utf-8")
    # mtime defaults to now — within 30 days

    result = scraper.fetch_url(url)
    assert result == fresh_content


def test_extract_facts_swedish_opening_hours() -> None:
    sample_html = """
    <div>
        <h2>Öppettider</h2>
        <p>Vardagar: 11:00 - 22:00, Helger: 12:00 - 23:00</p>
        <p>Dagens lunch 145:- inklusive kaffe och kaka.</p>
    </div>
    """
    facts = extract_facts_from_html(sample_html, "https://example.com", 999, "2026-09-09T12:00:00Z")
    fields = {f["field"]: f["value"] for f in facts}
    assert "openingHours" in fields
    assert "priceSEK" in fields
    assert "145 SEK" in fields["priceSEK"]


