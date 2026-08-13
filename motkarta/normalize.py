from __future__ import annotations

from dataclasses import dataclass


ESTABLISHMENT_TYPES = {"Restaurant", "Bakery", "Café", "Specialty coffee"}


@dataclass(frozen=True)
class OsmFoodPlace:
    osm_type: str
    osm_id: str
    name: str
    category: str
    cuisine: str = ""
    opening_hours: str = ""
    street: str = ""
    house_number: str = ""
    website: str = ""
    latitude: float | None = None
    longitude: float | None = None
    source: str = "OpenStreetMap"


def normalize_osm_establishment_type(category: str, cuisine: str = "") -> str | None:
    """Map OSM food categories to the four product establishment types.

    A normal OSM cafe stays a Café. It is not upgraded to Specialty coffee just
    because the cuisine text mentions coffee.
    """

    value = category.strip().lower()
    if value in {"coffee", "coffee_roaster"}:
        return "Specialty coffee"
    if value in {"bakery", "pastry", "confectionery"}:
        return "Bakery"
    if value in {"restaurant", "fast_food", "food_court"}:
        return "Restaurant"
    if value == "cafe":
        return "Café"
    return None


def osm_tags(place: OsmFoodPlace) -> list[str]:
    tags: list[str] = []
    for value in [place.category.replace("_", " "), *place.cuisine.split(";")]:
        cleaned = value.strip()
        if cleaned:
            tags.append(cleaned.title())
    if place.website:
        tags.append("Website")
    if place.opening_hours:
        tags.append("Opening hours")
    return list(dict.fromkeys(tags))


def osm_address(place: OsmFoodPlace) -> str:
    return " ".join(part for part in [place.street, place.house_number] if part).strip()


def osm_description(place: OsmFoodPlace, establishment_type: str) -> str:
    address = osm_address(place)
    suffix = f" at {address}" if address else ""
    return (
        f"{establishment_type} imported from OpenStreetMap{suffix}. "
        "Needs source enrichment before quality scoring."
    )
