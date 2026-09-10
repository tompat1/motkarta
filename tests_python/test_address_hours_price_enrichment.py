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
    assert lvl == 1
    assert "45" in sek

    michelin = {"name": "Frantzén", "kind": "Restaurant", "tags": ["Michelin", "Fine dining"]}
    lvl, sek = determine_venue_price(michelin, None, (None, None))
    assert lvl == 4
    assert "750" in sek

    trattoria = {"name": "Pasta Uno", "kind": "Restaurant", "tags": ["Italian"]}
    lvl, sek = determine_venue_price(trattoria, "$$", (None, None))
    assert lvl == 2
    assert "160" in sek


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
