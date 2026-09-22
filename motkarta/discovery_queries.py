"""Neighborhood-aware discovery queries for monthly catalog freshness checks."""

from __future__ import annotations

# Core inner-city districts where independent venues are often missing first.
STOCKHOLM_DISCOVERY_DISTRICTS: tuple[str, ...] = (
    "Vasastan",
    "Södermalm",
    "Östermalm",
    "Norrmalm",
    "Kungsholmen",
    "Gamla Stan",
    "Djurgården",
    "Gärdet",
    "Söderort",
)

CITYWIDE_DISCOVERY_QUERIES: tuple[str, ...] = (
    "new independent restaurants Stockholm",
    "new cafes Stockholm",
    "new bakeries Stockholm",
    "new coffee shops Stockholm",
    "independent pubs Stockholm",
)

DISTRICT_DISCOVERY_TEMPLATES: tuple[str, ...] = (
    "independent restaurants {district} Stockholm",
    "cafes {district} Stockholm",
    "pizzeria {district} Stockholm",
    "bakery {district} Stockholm",
    "coffee shop {district} Stockholm",
)


def build_discovery_queries(
    districts: tuple[str, ...] | list[str] | None = None,
    include_citywide: bool = True,
) -> list[str]:
    """Build Google/OSM discovery queries with neighborhood coverage."""
    selected = tuple(districts or STOCKHOLM_DISCOVERY_DISTRICTS)
    queries: list[str] = []

    if include_citywide:
        queries.extend(CITYWIDE_DISCOVERY_QUERIES)

    for district in selected:
        for template in DISTRICT_DISCOVERY_TEMPLATES:
            queries.append(template.format(district=district))

    # Preserve order while removing duplicates.
    seen: set[str] = set()
    unique: list[str] = []
    for query in queries:
        normalized = query.strip().lower()
        if normalized in seen:
            continue
        seen.add(normalized)
        unique.append(query)
    return unique
