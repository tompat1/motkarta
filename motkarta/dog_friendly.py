"""Tasstipset may only enrich the dog-friendly feature of existing food venues."""

import re
from motkarta.catalog_exclusions import is_excluded_catalog_name

ALLOWED_KINDS = {"restaurant", "bakery", "café", "cafe", "coffee shop", "coffeeshop", "specialty coffee"}
DOG_TAGS = {"Dog friendly", "Hundvänligt", "Tasstipset", "Verifierad hundpolicy", "Hundar inne & ute", "Endast uteservering"}


def is_tasstipset_source(value: object) -> bool:
    return isinstance(value, str) and "tasstipset" in value.lower()


def eligible_dog_friendly_target(place: dict) -> bool:
    return (str(place.get("kind", "")).strip().lower() in ALLOWED_KINDS
            and not is_excluded_catalog_name(place.get("name"))
            and not is_tasstipset_source(place.get("sourceName")))


def add_dog_friendly_feature(place: dict, record: dict) -> None:
    """Only tags and a source-attributed dogFriendly fact may change."""
    tags = set(place.get("tags", [])) | {"Dog friendly", "Hundvänligt", "Tasstipset"}
    tags.update(tag for tag in record.get("tags", []) if tag in DOG_TAGS)
    place["tags"] = sorted(tags)
    fact_id = f"{place['id']}:tasstipset:dogFriendly"
    fact = {
        "id": fact_id, "placeId": place["id"], "field": "dogFriendly",
        "value": record.get("dog_policy_quote") or record.get("dog_policy") or "Dogs welcome",
        "source": "Tasstipset", "verification": "listed",
        "url": record.get("url") or record.get("sourceUrl") or "https://tasstipset.se/",
    }
    place["sourceFacts"] = [f for f in place.get("sourceFacts", []) if f.get("id") != fact_id] + [fact]


def tasstipset_coverage(places: list[dict], references: list[dict]) -> dict:
    """Measure enrichment coverage only where an independently sourced venue exists."""
    def norm(name):
        return re.sub(r"[^a-z0-9åäö]+", "", str(name or "").lower())

    eligible = [(norm(p.get("name")), p) for p in places if eligible_dog_friendly_target(p)]
    existing = matched = 0
    for reference in references:
        name = norm(reference.get("name"))
        candidates = [p for pn, p in eligible if name and pn and (name == pn or (min(len(name), len(pn)) >= 5 and (name in pn or pn in name)))]
        if candidates:
            existing += 1
            matched += any("Dog friendly" in p.get("tags", []) or "Hundvänligt" in p.get("tags", []) for p in candidates)
    return {
        "eligible_existing_references": existing,
        "eligible_matched_references": matched,
        "unmatched_reference_venues": len(references) - existing,
        "eligible_coverage_pct": round(matched / existing * 100, 1) if existing else 0.0,
        "source_only_venues": sum(is_tasstipset_source(p.get("sourceName")) for p in places),
        "ineligible_dog_venues": sum("Tasstipset" in p.get("tags", []) and not eligible_dog_friendly_target(p) for p in places),
    }
