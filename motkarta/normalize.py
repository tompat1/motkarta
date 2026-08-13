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


PRIME_SPECIALTY_NAMES = [
    "pascal",
    "drop coffee",
    "johan & nyström",
    "johan & nystrom",
    "johan och nyström",
    "solkant",
    "volca",
    "lykke",
    "höga kusten",
    "hoga kusten",
    "gast",
    "muttley",
    "nordic brew lab",
    "a.b.café",
    "ab cafe",
    "standout",
    "café blom",
    "cafe blom",
]

RESTAURANT_GRILL_KEYWORDS = [
    "grill",
    "grillen",
    "gastropub",
    "pub",
    "bar",
    "restaurang",
    "restaurant",
    "burger",
    "burgers",
    "pizza",
    "pizzeria",
    "kebab",
    "sushi",
    "steakhouse",
    "taverna",
    "sportsbar",
]


def is_prime_specialty_coffee(name: str = "", category: str = "", cuisine: str = "") -> bool:
    n = name.strip().lower()
    c = category.strip().lower()
    cu = cuisine.strip().lower()
    full_text = f"{n} {c} {cu}"

    if any(kw in full_text for kw in RESTAURANT_GRILL_KEYWORDS):
        return False

    if any(p in n for p in PRIME_SPECIALTY_NAMES):
        return True
    if any(r in n for r in ["roaster", "roastery", "rosteri"]):
        return True
    if "roaster" in c or "coffee_roaster" in cu:
        return True
    return False


def normalize_osm_establishment_type(category: str, cuisine: str = "", name: str = "") -> str | None:
    """Map OSM food categories to the four product establishment types."""
    n = name.strip().lower()
    c = category.strip().lower()
    cu = cuisine.strip().lower()
    full_text = f"{n} {c} {cu}"

    if any(kw in full_text for kw in RESTAURANT_GRILL_KEYWORDS):
        return "Restaurant"

    if is_prime_specialty_coffee(name, category, cuisine):
        return "Specialty coffee"

    value = category.strip().lower()
    if value in {"coffee", "coffee_roaster"}:
        return "Specialty coffee"
    if value in {"bakery", "pastry", "confectionery"}:
        return "Bakery"
    if value in {"restaurant", "fast_food", "food_court", "bistro", "bar", "pub"}:
        return "Restaurant"
    if value == "cafe":
        return "Café"
    return None


def osm_tags(place: OsmFoodPlace) -> list[str]:
    tags: list[str] = []
    if place.name and (any(p in place.name.lower() for p in PRIME_SPECIALTY_NAMES) or any(r in place.name.lower() for r in ["roaster", "roastery", "rosteri"])):
        tags.extend(["Specialty Coffee", "Single Origin", "Filter"])
        if any(r in place.name.lower() for r in ["roaster", "roastery", "rosteri"]):
            tags.append("Own Roastery")
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
