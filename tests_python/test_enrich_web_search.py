"""Unit tests for execution/enrich_web_search.py."""

from __future__ import annotations

import json
from pathlib import Path
from execution.enrich_web_search import (
    extract_facts_from_guide_html,
    is_commercial_aggregator,
    normalize_name,
)


def test_is_commercial_aggregator() -> None:
    assert is_commercial_aggregator("https://www.yelp.com/biz/tjabba-thai") is True
    assert is_commercial_aggregator("https://www.tripadvisor.com/Restaurant_Review-g189852") is True
    assert is_commercial_aggregator("https://www.google.com/maps/place/Farang") is True
    assert is_commercial_aggregator("https://www.facebook.com/patsthaikitchen") is True

    # Allowed editorial guides & venue websites
    assert is_commercial_aggregator("https://www.svd.se/a/5pEGmW/guide-stockholms-basta-thailandska-restauranger") is False
    assert is_commercial_aggregator("https://www.guidetostockholm.se/svenska/topplistor/b%C3%A4sta-thai-restaurangerna") is False
    assert is_commercial_aggregator("https://farang.se") is False


def test_extract_facts_from_guide_html() -> None:
    sample_places = [
        {"id": 1, "name": "Tjabba Thai", "area": "Norrmalm"},
        {"id": 2, "name": "Restaurang Farang", "area": "Vasastan"},
    ]

    sample_html = """
    <html>
    <body>
        <h1>Guide: Stockholms bästa thailändska restauranger</h1>
        <article>
            <h2>Tjabba Thai</h2>
            <p>Här serveras fantastisk pad thai och tom yum i härlig miljö med uteservering.</p>
        </article>
        <article>
            <h2>Restaurang Farang</h2>
            <p>Asiatisk mat i lyxig miljö med underbar curry och cozy vibe.</p>
        </article>
    </body>
    </html>
    """

    guide_url = "https://www.guidetostockholm.se/svenska/topplistor/basta-thai"
    facts = extract_facts_from_guide_html(sample_html, guide_url, sample_places)

    assert len(facts) > 0
    tjabba_facts = [f for f in facts if f["placeId"] == 1]
    assert len(tjabba_facts) > 0

    # Verify provenance fields
    fact = tjabba_facts[0]
    assert fact["source"] == "Editorial Guide (www.guidetostockholm.se)"
    assert fact["url"] == guide_url
    assert fact["verification"] == "listed"
    assert "capturedAt" in fact


def test_commercial_aggregator_rejection() -> None:
    sample_html = "<html><body>Tjabba Thai pad thai</body></html>"
    yelp_url = "https://www.yelp.com/biz/tjabba-thai"

    facts = extract_facts_from_guide_html(sample_html, yelp_url, [{"id": 1, "name": "Tjabba Thai"}])
    assert facts == []
