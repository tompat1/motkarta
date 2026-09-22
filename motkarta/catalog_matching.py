"""Shared helpers for matching external source records against the live catalog."""

from __future__ import annotations

import json
from pathlib import Path

import pandas as pd


def clean_text(value: object) -> str:
    return str(value or "").strip()


def load_catalog_dataframe(path: Path) -> pd.DataFrame:
    payload = json.loads(path.read_text(encoding="utf-8"))
    records = payload.get("places", payload if isinstance(payload, list) else [])
    rows = []
    for place in records:
        rows.append(
            {
                "osm_type": "catalog",
                "osm_id": str(place.get("id", "")),
                "name": clean_text(place.get("name")),
                "address": clean_text(place.get("address")),
                "latitude": place.get("latitude"),
                "longitude": place.get("longitude"),
            }
        )
    return pd.DataFrame(rows).fillna("")
