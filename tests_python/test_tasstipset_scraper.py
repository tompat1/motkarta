import json
from unittest.mock import patch

import pytest

from scripts import fetch_tasstipset_dog_places as scraper


SAMPLE_STOCKHOLM_HTML = """
<!DOCTYPE html>
<html>
<head>
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "ItemList",
  "name": "Hundvänliga ställen i Stockholm",
  "numberOfItems": 2,
  "itemListElement": [
    {
      "@type": "ListItem",
      "position": 1,
      "name": "Drop Coffee Roasters",
      "url": "https://tasstipset.se/plats/drop-coffee-roasters"
    },
    {
      "@type": "ListItem",
      "position": 2,
      "name": "Capri Due",
      "url": "https://tasstipset.se/plats/capri-due-stockholm"
    }
  ]
}
</script>
</head>
<body>
  <nav>
    <a href="/stad/stockholm/sodermalm">Södermalm</a>
    <a href="/stad/stockholm/vasastan">Vasastan</a>
  </nav>
</body>
</html>
"""

SAMPLE_DROP_COFFEE_HTML = """
<!DOCTYPE html>
<html>
<head>
<title>Drop Coffee Roasters — hundvänligt café i Södermalm · Tasstipset</title>
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "CafeOrCoffeeShop",
  "name": "Drop Coffee Roasters",
  "url": "https://tasstipset.se/plats/drop-coffee-roasters",
  "petsAllowed": true,
  "description": "Specialty coffee-rosteri vid Mariatorget.",
  "telephone": "+46704239229",
  "sameAs": ["https://www.dropcoffee.com/"],
  "address": {
    "@type": "PostalAddress",
    "streetAddress": "Wollmar Yxkullsgatan 10, 118 50 Stockholm",
    "addressLocality": "Stockholm",
    "addressCountry": "SE"
  },
  "geo": {
    "@type": "GeoCoordinates",
    "latitude": 59.3175,
    "longitude": 18.0598
  }
}
</script>
</head>
<body>
  <header>
    <span>☕ Café</span>
    <span>Södermalm</span>
    <span title="Restaurangen själv har bekräftat policyn via mejl">✓ Verifierat av stället</span>
    <h1>Drop Coffee Roasters</h1>
    <p>Wollmar Yxkullsgatan 10, 118 50 Stockholm</p>
    <span class="bg-emerald-100">🏠 Hundar inne & ute</span>
  </header>
  <main>
    <section>
      <h2>Hundpolicy</h2>
      <p>Lugna hundar välkomna inomhus. Plats vid bordet är begränsad — undvik högtrafik.</p>
    </section>
  </main>
</body>
</html>
"""

SAMPLE_PATIO_ONLY_HTML = """
<!DOCTYPE html>
<html>
<head>
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Restaurant",
  "name": "Uteserveringsbaren",
  "url": "https://tasstipset.se/plats/uteserveringsbaren",
  "address": {
    "streetAddress": "Strandvägen 1"
  },
  "geo": {
    "latitude": 59.33,
    "longitude": 18.08
  }
}
</script>
</head>
<body>
  <header>
    <span>Restaurang</span>
    <span>Östermalm</span>
    <h1>Uteserveringsbaren</h1>
    <span class="badge">🌿 Endast ute</span>
  </header>
  <main>
    <section>
      <h2>Hundpolicy</h2>
      <p>Hundar är välkomna på vår stora uteservering.</p>
    </section>
  </main>
</body>
</html>
"""


def test_extract_json_ld_blocks():
    blocks = scraper.extract_json_ld_blocks(SAMPLE_STOCKHOLM_HTML)
    assert len(blocks) == 1
    assert blocks[0]["@type"] == "ItemList"
    assert len(blocks[0]["itemListElement"]) == 2


def test_extract_stockholm_place_links():
    links = scraper.extract_stockholm_place_links(SAMPLE_STOCKHOLM_HTML)
    assert len(links) == 2
    assert links[0]["name"] == "Drop Coffee Roasters"
    assert links[0]["url"] == "https://tasstipset.se/plats/drop-coffee-roasters"
    assert links[1]["name"] == "Capri Due"


def test_map_category_to_kind():
    assert scraper.map_category_to_kind("Café") == "Café"
    assert scraper.map_category_to_kind("Bageri") == "Bakery"
    assert scraper.map_category_to_kind("Restaurang") == "Restaurant"
    assert scraper.map_category_to_kind("Vinbar") == "Restaurant"
    assert scraper.map_category_to_kind("Hotell") == "Hotell"
    assert scraper.map_category_to_kind("Park") == "Park"


def test_parse_tasstipset_place_page_drop_coffee():
    record = scraper.parse_tasstipset_place_page(
        SAMPLE_DROP_COFFEE_HTML, "https://tasstipset.se/plats/drop-coffee-roasters"
    )
    assert record.source_id == "tasstipset:drop-coffee-roasters"
    assert record.name == "Drop Coffee Roasters"
    assert record.kind == "Café"
    assert record.area == "Södermalm"
    assert "Wollmar Yxkullsgatan 10" in record.address
    assert record.latitude == 59.3175
    assert record.longitude == 18.0598
    assert record.phone == "+46704239229"
    assert record.website == "https://www.dropcoffee.com/"
    assert "inne" in record.dog_policy.lower() and "ute" in record.dog_policy.lower()
    assert record.dog_policy_quote == "Lugna hundar välkomna inomhus. Plats vid bordet är begränsad — undvik högtrafik."
    assert record.is_venue_verified is True
    assert "Dog friendly" in record.tags
    assert "Hundvänligt" in record.tags
    assert "Hundar inne & ute" in record.tags
    assert "Verifierad hundpolicy" in record.tags


def test_parse_tasstipset_place_page_patio_only():
    record = scraper.parse_tasstipset_place_page(
        SAMPLE_PATIO_ONLY_HTML, "https://tasstipset.se/plats/uteserveringsbaren"
    )
    assert record.name == "Uteserveringsbaren"
    assert record.kind == "Restaurant"
    assert record.area == "Östermalm"
    assert record.is_venue_verified is False
    assert "Endast uteservering" in record.tags


def test_scrape_tasstipset_stockholm_mocked(tmp_path):
    output_file = tmp_path / "dog_places.json"

    def mock_fetch(url: str, **kwargs):
        if "stad/stockholm" in url:
            return SAMPLE_STOCKHOLM_HTML
        if "drop-coffee-roasters" in url:
            return SAMPLE_DROP_COFFEE_HTML
        if "capri-due" in url:
            return SAMPLE_DROP_COFFEE_HTML.replace("Drop Coffee Roasters", "Capri Due")
        return ""

    with patch("scripts.fetch_tasstipset_dog_places.fetch_url", side_effect=mock_fetch):
        places = scraper.scrape_tasstipset_stockholm(output_path=output_file, limit=2, delay=0, quiet=True)

    assert len(places) == 2
    assert output_file.exists()
    saved = json.loads(output_file.read_text(encoding="utf-8"))
    assert saved["city"] == "Stockholm"
    assert saved["total_places"] == 2
    assert saved["places"][0]["name"] == "Drop Coffee Roasters"
    assert saved["places"][1]["name"] == "Capri Due"
