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
    if not isinstance(name, str):
        return False
    trimmed = name.strip()
    if is_olearys_name(trimmed):
        return True
    if re.search(r"^stf\s+stockholm(?:\s|\/).*\bvandrarhem\b", trimmed, re.IGNORECASE):
        return True
    if "\n" in trimmed or len(trimmed) > 300:
        return False
    if re.search(r"\b(?:minigolf\s*kiosk|bangolf(?:\s*&\s*caf[eé])?|badkiosk|strandkiosk|campingkiosk)\b", trimmed, re.IGNORECASE):
        return True
    if re.search(r"^kiosk,\s*caf[eé],\s*snabbmat$", trimmed, re.IGNORECASE):
        return True
    if re.search(r"(?:^|[^a-zA-ZåäöÅÄÖ0-9])(?:grundskol|förskol|forskol|gymnasi|dagis|fritidshem)[a-zA-ZåäöÅÄÖ0-9]*(?![a-zA-ZåäöÅÄÖ0-9])", trimmed, re.IGNORECASE):
        return True
    if re.search(r"(?:^|[^a-zA-ZåäöÅÄÖ0-9])[a-zA-ZåäöÅÄÖ0-9]*skol(?:a|an|or|orna)(?![a-zA-ZåäöÅÄÖ0-9])", trimmed, re.IGNORECASE):
        return True
    if re.search(r"(?:^|[^a-zA-ZåäöÅÄÖ0-9])(?:äldreboende|aldreboende|vårdboende|vardboende|servicehus|gruppboende|sjukhus)[a-zA-ZåäöÅÄÖ0-9]*(?![a-zA-ZåäöÅÄÖ0-9])", trimmed, re.IGNORECASE):
        return True
    return False
