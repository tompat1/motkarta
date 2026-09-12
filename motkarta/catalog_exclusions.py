"""Explicit catalog exclusions, mirrored by lib/catalog-exclusions.ts."""

import re
import json
from pathlib import Path

_POLICY = json.loads((Path(__file__).resolve().parents[1] / "lib/catalog-exclusions.json").read_text())
_TASSTIPSET_ONLY_NAMES = {place["id"]: place["name"].lower() for place in _POLICY["tasstipsetOnlyPlaces"]}


def is_excluded_catalog_place(place: dict) -> bool:
    return (is_excluded_catalog_name(place.get("name"))
            or (_TASSTIPSET_ONLY_NAMES.get(place.get("id")) == str(place.get("name", "")).lower())
            or "tasstipset" in str(place.get("sourceName", "")).lower())


def is_olearys_name(name: object) -> bool:
    return isinstance(name, str) and bool(re.search(r"\bo[\s'’‘`´-]*learys\b", name, re.IGNORECASE))


def is_excluded_catalog_name(name: object) -> bool:
    return is_olearys_name(name) or (
        isinstance(name, str)
        and bool(re.search(r"^stf\s+stockholm(?:\s|\/).*\bvandrarhem\b", name.strip(), re.IGNORECASE))
    )
