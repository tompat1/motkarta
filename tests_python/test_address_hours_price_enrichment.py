"""
Unit tests for Motkarta address, hours, and price enrichment logic.
"""

from __future__ import annotations

import pytest
from scripts.fetch_place_hours_and_prices import (
    classify_price_level,
    price_level_to_symbol,
    price_level_to_sek,
    format_osm_opening_hours,
    parse_schema_json_ld,
    parse_menu_prices_from_text,
    determine_venue_price,
)
from scripts.enrich_street_addresses import (
    has_street_number,
    format_street_address,
    normalize_text,
    haversine_distance,
)


def test_classify_price_level():
    assert classify_price_level(45) == 1
    assert classify_price_level(140) == 1
    assert classify_price_level(150) == 2
    assert classify_price_level(260) == 2
    assert classify_price_level(350) == 2
    assert classify_price_level(351) == 3
    assert classify_price_level(650) == 3
    assert classify_price_level(750) == 3
    assert classify_price_level(751) == 4
    assert classify_price_level(1200) == 4


def test_price_level_symbols_and_sek():
    assert price_level_to_symbol(1) == "$"
    assert price_level_to_symbol(2) == "$$"
    assert price_level_to_symbol(3) == "$$$"
    assert price_level_to_symbol(4) == "$$$$"

    assert "45" in price_level_to_sek(1)
    assert "160" in price_level_to_sek(2)
    assert "380" in price_level_to_sek(3)
    assert "750" in price_level_to_sek(4)


def test_format_osm_opening_hours():
    specs = [
        {"dayOfWeek": ["Monday", "Tuesday", "Wednesday"], "opens": "11:00", "closes": "22:00"},
        {"dayOfWeek": "Thursday", "opens": "11:00", "closes": "22:00"},
        {"dayOfWeek": "Friday", "opens": "11:00", "closes": "23:00"},
        {"dayOfWeek": "Saturday", "opens": "12:00", "closes": "23:00"},
        {"dayOfWeek": "Sunday", "opens": "12:00", "closes": "21:00"},
    ]
    hours_str = format_osm_opening_hours(specs)
    assert hours_str is not None
    assert "Mo-Th 11:00-22:00" in hours_str
    assert "Fr 11:00-23:00" in hours_str
    assert "Sa 12:00-23:00" in hours_str
    assert "Su 12:00-21:00" in hours_str


def test_parse_schema_json_ld():
    html = """
    <html>
      <head>
        <script type="application/ld+json">
        {
          "@context": "https://schema.org",
          "@type": "Restaurant",
          "name": "Trattoria Bella",
          "priceRange": "$$",
          "address": {
            "@type": "PostalAddress",
            "streetAddress": "Sveavägen 42",
            "addressLocality": "Stockholm"
          },
          "openingHoursSpecification": [
            {
              "@type": "OpeningHoursSpecification",
              "dayOfWeek": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
              "opens": "11:30",
              "closes": "22:00"
            }
          ]
        }
        </script>
      </head>
      <body></body>
    </html>
    """
    res = parse_schema_json_ld(html)
    assert res["price_range"] == "$$"
    assert res["street_address"] == "Sveavägen 42, Stockholm"
    assert "Mo-Fr 11:30-22:00" in res["opening_hours"]


def test_parse_menu_prices_from_text():
    html = """
    <div>
      <h2>Vår Meny</h2>
      <p>Dagens lunch 145 kr inkl sallad och bröd</p>
      <p>Kvällens varmrätter: Oxkind 285 kr, Röding 295 kr</p>
    </div>
    """
    lvl, sek = parse_menu_prices_from_text(html)
    assert lvl == 2  # Average is ~240 kr -> Tier 2 ($$)
    assert sek is not None
    assert "145" in sek


def test_determine_venue_price():
    bakery = {"name": "Lilla Bageriet", "kind": "Bakery", "tags": ["Bakery", "Fika"]}
    lvl, sek = determine_venue_price(bakery, None, (None, None))
    assert (lvl, sek) == (None, None)

    michelin = {"name": "Frantzén", "kind": "Restaurant", "tags": ["Michelin", "Fine dining"]}
    lvl, sek = determine_venue_price(michelin, None, (None, None))
    assert (lvl, sek) == (None, None)

    trattoria = {"name": "Pasta Uno", "kind": "Restaurant", "tags": ["Italian"]}
    lvl, sek = determine_venue_price(trattoria, "$$", (None, None))
    assert lvl == 2
    assert sek == "$$"


def test_has_street_number():
    assert has_street_number("Drottninggatan 12, Stockholm") is True
    assert has_street_number("Hälsingegatan 2A, Vasastan") is True
    assert has_street_number("Sveavägen 101, Stockholm") is True
    assert has_street_number("Central Stockholm, Stockholm") is False
    assert has_street_number("Södermalm, Stockholm") is False
    assert has_street_number("Stockholm") is False
    assert has_street_number(None) is False


def test_format_street_address():
    assert format_street_address("Odengatan", "45", "Vasastan") == "Odengatan 45, Vasastan"
    assert format_street_address("Götgatan 78", "", "Södermalm") == "Götgatan 78, Södermalm"
    assert format_street_address("Hornsgatan", "12") == "Hornsgatan 12, Stockholm"


def test_haversine_distance():
    # Known distance: Sergels Torg (59.3326, 18.0649) to Hötorget (59.3346, 18.0628) ~ 250m
    dist = haversine_distance(59.3326, 18.0649, 59.3346, 18.0628)
    assert 200 < dist < 300


def test_numeric_prices_are_not_tier_digits():
    assert determine_venue_price({}, '145 SEK', (None, None)) == (1, '145')
    assert determine_venue_price({}, 'SEK 200–400', (None, None)) == (2, '200–400')
    assert determine_venue_price({}, '4', (None, None)) == (None, None)
    assert determine_venue_price({}, '$$$$', (None, None)) == (4, '$$$$')


def test_graph_and_split_hours():
    import json
    venue = {'@type': 'Restaurant', 'openingHoursSpecification': [
        {'dayOfWeek': 'Monday', 'opens': '11:00', 'closes': '14:00'},
        {'dayOfWeek': 'Monday', 'opens': '17:00', 'closes': '22:00'},
    ]}
    html = '<script type="application/ld+json">' + json.dumps({'@graph': [venue]}) + '</script>'
    assert parse_schema_json_ld(html)['opening_hours'] == 'Mo 11:00-14:00,17:00-22:00'


def test_failed_scrape_and_limit_preserve_existing_values(tmp_path, monkeypatch):
    import json
    import scripts.fetch_place_hours_and_prices as module
    rows = [{'id': i, 'website': f'https://example.org/{i}', 'openingHours': '24/7', 'priceSEK': '250'} for i in range(2)]
    target = tmp_path / 'places.json'
    target.write_text(json.dumps({'places': rows}))
    calls = []
    monkeypatch.setattr(module, 'fetch_website_metadata', lambda url: calls.append(url))
    module.enrich_hours_and_prices(target, limit_sites=1)
    assert len(calls) == 1
    assert json.loads(target.read_text())['places'] == rows


def test_overlay_clears_only_unsupported_defaults_and_refreshes_owned_facts():
    from execution.apply_enrichment import apply_overlay
    rows = [{'id': 1, 'openingHours': 'Mo-Sa 17:00-23:00', 'priceSEK': '160–320'}]
    fact = {'id': '1:osm:openingHours', 'placeId': 1, 'field': 'openingHours', 'value': '24/7', 'source': 'OpenStreetMap', 'url': 'https://www.openstreetmap.org/node/1', 'capturedAt': '2026-09-17T00:00:00Z'}
    apply_overlay(rows, {'1': [fact]})
    assert rows[0]['openingHours'] == '24/7'
    assert 'priceSEK' not in rows[0]
    next_fact = {**fact, 'value': 'Mo-Fr 12:00-14:00', 'capturedAt': '2026-09-18T00:00:00Z'}
    apply_overlay(rows, {'1': [next_fact]})
    apply_overlay(rows, {'1': [fact]})
    assert rows[0]['openingHours'] == next_fact['value']
    assert len(rows[0]['sourceFacts']) == 1


def test_osm_matching_and_wifi_fee_semantics():
    from execution.enrich_catalog import build_place_index, extract_osm_facts
    places = [{'id': 1, 'name': 'Cafe', 'latitude': 59.3, 'longitude': 18}, {'id': 2, 'name': 'Cafe', 'latitude': 60.3, 'longitude': 19}]
    element = {'type': 'node', 'id': 5, 'lat': 59.3, 'lon': 18, 'tags': {'name': 'Cafe', 'opening_hours': '24/7', 'internet_access': 'wlan'}}
    facts = extract_osm_facts([element], build_place_index(places))
    assert set(facts) == {1}
    assert any(f['value'] == '24/7' for f in facts[1])
    assert any(f['value'] == 'Wi-Fi' for f in facts[1])
    for fee, expected in [('no', 'Free Wi-Fi'), ('customers', 'Wi-Fi free for customers'), ('yes', 'Paid Wi-Fi')]:
        element['tags']['internet_access:fee'] = fee
        facts = extract_osm_facts([element], build_place_index(places))
        assert any(f['value'] == expected for f in facts[1])
    element['tags']['internet_access'] = 'yes'
    facts = extract_osm_facts([element], build_place_index(places))
    assert not any(f['value'] == 'Free Wi-Fi' for f in facts[1])
