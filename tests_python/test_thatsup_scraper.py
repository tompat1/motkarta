from __future__ import annotations

import json
from pathlib import Path

from motkarta.catalog_exclusions import is_excluded_catalog_name
from scripts.scrape_thatsup_guide import (
    merge_ground_truth,
    parse_guide_html,
    parse_place_page_html,
)

ROOT = Path(__file__).resolve().parents[1]
PLACES_FILE = ROOT / "public" / "data" / "places.json"
THATSUP_GT_FILE = ROOT / "data" / "thatsup_ground_truth.json"


SAMPLE_GUIDE_HTML = """
<div class="article-list__element">
  <div class="article-list__element__title d-flex">
    <h3><a href="https://thatsup.se/stockholm/restaurang/akkurat">Akkurat</a></h3>
  </div>
  <div class="article-list__element__body">
    <a href="http://www.akkurat.se" data-track="[&quot;Website referrals&quot;,{&quot;place_is_featured&quot;:0}]" class="referral-page">Hemsida</a>
    <p>Detta öl- och whiskymecka på Söder serverar belgisk hantverksöl och musslor.</p>
  </div>
</div>
<div class="article-list__element">
  <div class="article-list__element__title d-flex">
    <drawer-modal title="Välj ett alternativ">
      <drawer-modal-nav>
        <drawer-modal-nav-item href="https://thatsup.se/stockholm/restaurang/omnipollos-hatt" title="Omnipollos hatt">Omnipollos hatt</drawer-modal-nav-item>
        <drawer-modal-nav-item href="https://thatsup.se/stockholm/bar/omnipollos-kyrka" title="Omnipollos Kyrka">Omnipollos Kyrka</drawer-modal-nav-item>
      </drawer-modal-nav>
    </drawer-modal>
  </div>
  <div class="article-list__element__body">
    <a href="http://www.omnipolloshatt.com" data-track="[&quot;Website referrals&quot;,{&quot;place_is_featured&quot;:1}]" class="referral-page">Hemsida</a>
    <p>Hantverksöl och pizza på Södermalm samt bryggerikyrka.</p>
  </div>
</div>
<div class="article-list__element">
  <div class="article-list__element__title d-flex">
    <h3><a href="https://thatsup.se/stockholm/bar/olearys">O'Learys</a></h3>
  </div>
  <div class="article-list__element__body">
    <p>Kommersiell sportbarkedja som ska exkluderas.</p>
  </div>
</div>
"""

SAMPLE_PLACE_HTML = """
<html><head>
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [{
    "@type": "Restaurant",
    "name": "The Churchill Arms",
    "address": {"streetAddress": "Tulegatan 21", "addressLocality": "Stockholm"},
    "geo": {"latitude": 59.3434, "longitude": 18.0609},
    "priceRange": "$$"
  }]
}
</script>
<script type="application/ld+json">
{
  "@context": "http://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    {"position": 1, "item": {"name": "Stockholm"}},
    {"position": 2, "item": {"name": "Vasastan"}}
  ]
}
</script>
</head></html>
"""


def test_parse_guide_html_extracts_single_and_multi_venues_and_excludes_chains():
    venues = parse_guide_html(
        SAMPLE_GUIDE_HTML,
        "https://thatsup.se/stockholm/guide/guiden-till-stockholms-basta-olbarer",
        category="Thatsup Ölbar & Pub",
        extra_tags=["Pub", "Beer", "Craft Beer", "Ölbar"],
    )
    names = [v["name"] for v in venues]
    assert names == ["Akkurat", "Omnipollos hatt", "Omnipollos Kyrka"]
    assert venues[0]["isFeaturedPartner"] is False
    assert venues[0]["website"] == "http://www.akkurat.se"
    assert venues[1]["isFeaturedPartner"] is True
    assert venues[2]["thatsupPlaceUrl"] == "https://thatsup.se/stockholm/bar/omnipollos-kyrka"
    assert "Pub" in venues[0]["tags"]


def test_parse_place_page_html_extracts_area_address_and_geo():
    details = parse_place_page_html(SAMPLE_PLACE_HTML)
    assert details["area"] == "Vasastan"
    assert details["address"] == "Tulegatan 21, Vasastan"
    assert details["latitude"] == 59.3434
    assert details["longitude"] == 18.0609
    assert details["priceRange"] == "$$"


def test_merge_ground_truth_preserves_existing_and_updates_matches():
    existing = [
        {"name": "Barbro", "area": "Södermalm", "category": "Thatsup Redaktionsfavorit"},
        {"name": "Akkurat", "area": "Stockholm", "category": "Old"},
    ]
    scraped = [
        {
            "name": "Akkurat",
            "area": "Södermalm",
            "category": "Thatsup Ölbar & Pub",
            "url": "https://thatsup.se/stockholm/guide/guiden-till-stockholms-basta-olbarer",
            "tags": ["Pub", "Beer"],
        },
        {
            "name": "Tritonia",
            "area": "Gamla Stan",
            "category": "Thatsup Ölbar & Pub",
            "url": "https://thatsup.se/stockholm/guide/guiden-till-stockholms-basta-olbarer",
            "tags": ["Pub", "Beer"],
        },
    ]
    merged = merge_ground_truth(existing, scraped)
    assert [m["name"] for m in merged] == ["Barbro", "Akkurat", "Tritonia"]
    assert merged[1]["area"] == "Södermalm"
    assert "Pub" in merged[1]["tags"]


def test_catalog_contains_enriched_thatsup_beer_bars_with_neutral_policy():
    gt = json.loads(THATSUP_GT_FILE.read_text(encoding="utf-8"))
    assert len(gt) >= 40
    assert not any(is_excluded_catalog_name(item["name"]) for item in gt)

    places = json.loads(PLACES_FILE.read_text(encoding="utf-8"))["places"]
    thatsup_pubs = [
        p
        for p in places
        if "Thatsup" in (p.get("tags") or [])
        and "pub" in [c.strip().lower() for c in str(p.get("cuisine") or "").split(";")]
    ]
    assert len(thatsup_pubs) >= 30

    for place in thatsup_pubs:
        assert not is_excluded_catalog_name(place["name"])
        thatsup_facts = [
            f for f in (place.get("sourceFacts") or []) if "thatsup" in str(f.get("source", "")).lower()
        ]
        assert thatsup_facts, f"{place['name']} missing Thatsup SourceFact"
        assert all(f.get("verification") == "listed" for f in thatsup_facts)
