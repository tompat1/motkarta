from __future__ import annotations

import json
from pathlib import Path

from motkarta.catalog_exclusions import is_excluded_catalog_name
from scripts.fetch_visit_stockholm_api import (
    is_food_and_drink_label,
    parse_visit_stockholm_object,
)

ROOT = Path(__file__).resolve().parents[1]
VS_API_FILE = ROOT / "data" / "visit_stockholm_api_places.json"


def test_is_food_and_drink_label_filters_non_food_categories():
    assert is_food_and_drink_label("Restaurant") is True
    assert is_food_and_drink_label("Coffee Shop / Café") is True
    assert is_food_and_drink_label("Bar") is True
    assert is_food_and_drink_label("Bakery") is True
    assert is_food_and_drink_label("Hotel") is False
    assert is_food_and_drink_label("Museum") is False
    assert is_food_and_drink_label("Shop") is False


def test_parse_visit_stockholm_object_extracts_fields_and_excludes_chains():
    sample = {
        "id": "abc-123",
        "title": "A.B.Café",
        "label": "Coffee Shop / Café",
        "text": "Retro café in Midsommarkransen.",
        "href": "https://www.visitstockholm.com/o/abcafe/",
        "location": {"lat": 59.3001, "lng": 18.0123},
        "contact": {
            "addresses": [{"address": "Valborgsmässovägen 34, 126 37 Hägersten"}],
            "href": "https://www.abcafe.se/",
        },
    }
    parsed = parse_visit_stockholm_object(sample)
    assert parsed is not None
    assert parsed["name"] == "A.B.Café"
    assert parsed["kind"] == "Café"
    assert parsed["area"] == "Söderort"
    assert parsed["latitude"] == 59.3001
    assert parsed["longitude"] == 18.0123
    assert parsed["website"] == "https://www.abcafe.se/"

    chain = {**sample, "title": "Espresso House"}
    assert parse_visit_stockholm_object(chain) is None


def test_visit_stockholm_api_snapshot_is_populated_and_clean():
    data = json.loads(VS_API_FILE.read_text(encoding="utf-8"))
    assert data["totalFoodVenues"] >= 500
    assert data["geolocatedVenues"] >= 500
    assert not any(is_excluded_catalog_name(p["name"]) for p in data["places"])
