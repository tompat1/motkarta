"""
Catalog source-fact enrichment for Motkarta.

Phase 1: Deterministic extraction from existing local data.
  - OSM raw JSON → openingHours, website, outdoor_seating, wheelchair,
    diet:vegetarian, diet:vegan, description
  - Ground-truth files → dish, atmosphere, tags from editorial sources
  - Curated places → sourceFacts from tags that map to dishes/atmosphere

Phase 2 (--scrape flag): Website-based enrichment (external).
  - Scrape venue websites for dish, price, atmosphere, hours.

Every emitted fact is source-attributed. No commercial platform signals.
Verification status is always 'listed' unless independently confirmed.

Usage:
  python execution/enrich_catalog.py --output data/enrichment_overlay.json
  python execution/enrich_catalog.py --output data/enrichment_overlay.json --scrape
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import html
import json
import re
import sys
import time
import unicodedata
import urllib.parse
import urllib.request
import urllib.robotparser
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

try:
    from bs4 import BeautifulSoup
except ImportError:
    BeautifulSoup = None  # type: ignore[assignment,misc]


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from motkarta.dog_friendly import eligible_dog_friendly_target
CUISINE_DISH_REGISTRY = ROOT / "data" / "concierge" / "cuisine-dishes.json"
OSM_RAW = ROOT / "data" / "raw" / "osm_stockholm_food_places.json"
PLACES_JSON = ROOT / "public" / "data" / "places.json"
HUSA_GUIDE = ROOT / "data" / "husa_guide_ground_truth.json"
WHITE_GUIDE = ROOT / "data" / "white_guide_ground_truth.json"
VISIT_STOCKHOLM = ROOT / "data" / "visit_stockholm_ground_truth.json"
TASSTIPSET = ROOT / "data" / "tasstipset_stockholm_ground_truth.csv"
CURATED_PLACES = ROOT / "data" / "curated_open_places.json"
ENRICH_MEDIA = ROOT / "execution" / "enrich_media.py"

# ---------------------------------------------------------------------------
# Normalisation helpers
# ---------------------------------------------------------------------------

def normalize_name(name: str) -> str:
    """Normalize a venue name for fuzzy matching."""
    s = name.lower().strip()
    s = unicodedata.normalize("NFKD", s)
    s = re.sub(r"[\u0300-\u036f]", "", s)  # strip combining diacritics
    s = s.replace("ł", "l")
    s = re.sub(r"[^a-z0-9]+", " ", s).strip()
    return s


# ---------------------------------------------------------------------------
# OSM → SourceFact extraction
# ---------------------------------------------------------------------------

def load_cuisine_dish_registry() -> dict[str, Any]:
    """Load canonical cuisine↔dish registry shared with concierge TS modules."""
    with CUISINE_DISH_REGISTRY.open(encoding="utf-8") as handle:
        return json.load(handle)


def build_cuisine_dish_map(registry: dict[str, Any]) -> dict[str, list[str]]:
    return {k: list(v) for k, v in registry.get("signatureDishes", {}).items()}


def build_dish_keywords(registry: dict[str, Any]) -> dict[str, str]:
    """Map lowercase scrape keywords → canonical dish value for SourceFacts."""
    keywords: dict[str, str] = {}
    for _cuisine, dishes in registry.get("signatureDishes", {}).items():
        for dish in dishes:
            keywords[dish.lower()] = dish
    for hint in registry.get("dishHints", []):
        canonical = str(hint.get("dish") or "")
        for term in list(hint.get("terms", [])) + list(hint.get("match", [])):
            keywords[str(term).lower()] = canonical or str(term)
    # Common website variants not always present as standalone terms
    keywords.setdefault("zurek", "żurek")
    keywords.setdefault("surdegsbrod", "sourdough bread")
    keywords.setdefault("surdegsbröd", "sourdough bread")
    keywords.setdefault("kardemummabulle", "cardamom bun")
    keywords.setdefault("corn tortillas", "corn tortillas")
    keywords.setdefault("tortillas", "corn tortillas")
    keywords.setdefault("smorrebrod", "smørrebrød")
    return keywords


_CUISINE_REGISTRY = load_cuisine_dish_registry()
CUISINE_DISH_MAP: dict[str, list[str]] = build_cuisine_dish_map(_CUISINE_REGISTRY)
DISH_KEYWORDS: dict[str, str] = build_dish_keywords(_CUISINE_REGISTRY)

# OSM outdoor_seating / description keywords → atmosphere facts.
ATMOSPHERE_KEYWORDS: dict[str, list[str]] = {
    "outdoor cafe": ["outdoor seating"],
    "outdoor garden": ["garden seating"],
    "summer only": ["seasonal", "outdoor"],
    "courtyard": ["courtyard"],
    "rooftop": ["rooftop"],
    "cozy": ["cozy"],
    "intimate": ["intimate"],
    "lively": ["lively"],
    "casual": ["casual"],
    "elegant": ["elegant"],
    "historic": ["historic"],
    "modern": ["modern"],
}


def extract_osm_facts(
    osm_elements: list[dict[str, Any]],
    place_index: dict[str, list[dict[str, Any]]],
    captured_at: str | None = None,
) -> dict[int, list[dict[str, Any]]]:
    """Extract SourceFacts from raw OSM elements, matched to public catalog IDs."""
    facts_by_id: dict[int, list[dict[str, Any]]] = {}
    timestamp = captured_at

    for el in osm_elements:
        tags = el.get("tags", {})
        osm_name = tags.get("name", "")
        if not osm_name:
            continue

        # Match by OSM identity (type:id)
        osm_type = el.get("type", "node")
        osm_id = str(el.get("id", ""))
        osm_identity = f"{osm_type}:{osm_id}"

        matched_places = place_index.get(osm_identity, [])
        if not matched_places:
            # Fallback: match by normalized name + proximity
            norm = normalize_name(osm_name)
            candidates = place_index.get(norm, [])
            center = el.get("center", el)
            from scripts.enrich_street_addresses import haversine_distance
            matched_places = []
            for candidate in candidates:
                # Never override a different known identity based on its name.
                if candidate.get("osmIdentity") and candidate["osmIdentity"] != osm_identity:
                    continue
                try:
                    distance = haversine_distance(float(center["lat"]), float(center["lon"]),
                                                  float(candidate["latitude"]), float(candidate["longitude"]))
                    if distance <= 100:
                        matched_places.append(candidate)
                except (KeyError, TypeError, ValueError):
                    continue
            if len(matched_places) != 1:
                matched_places = []

        if not matched_places:
            continue

        for place in matched_places:
            pid = place["id"]
            if pid not in facts_by_id:
                facts_by_id[pid] = []

            fact_base = {
                "placeId": pid,
                "source": "OpenStreetMap",
                "url": f"https://www.openstreetmap.org/{osm_type}/{osm_id}",
                "verification": "listed",
                "capturedAt": timestamp or el.get("timestamp", ""),
            }

            # Opening hours
            hours = tags.get("opening_hours")
            if hours:
                facts_by_id[pid].append({
                    **fact_base,
                    "id": f"{pid}:osm:openingHours",
                    "field": "openingHours",
                    "value": hours,
                })

            # Availability and fees are separate: unknown fee is never "free".
            access = tags.get("internet_access", "").lower()
            fee = tags.get("internet_access:fee", "").lower()
            wifi = None
            if access == "wlan":
                wifi = {"no": "Free Wi-Fi", "customers": "Wi-Fi free for customers", "yes": "Paid Wi-Fi"}.get(fee, "Wi-Fi")
            elif access == "no":
                wifi = "No Wi-Fi"
            elif access == "yes":
                wifi = "Internet access (type unknown)"
            if wifi:
                facts_by_id[pid].append({**fact_base, "id": f"{pid}:osm:wifi", "field": "tags", "value": wifi})

            # Website (contact:website takes precedence)
            website = tags.get("contact:website") or tags.get("website")
            if website and website.startswith("http"):
                # Don't duplicate if already present — we add as a fact
                facts_by_id[pid].append({
                    **fact_base,
                    "id": f"{pid}:osm:website",
                    "field": "tags",
                    "value": f"Website: {website}",
                })

            # Outdoor seating → atmosphere
            outdoor = tags.get("outdoor_seating", "")
            if outdoor and outdoor != "no":
                atmo_value = "outdoor seating"
                if outdoor in ("terrace", "patio", "garden", "rooftop", "veranda", "roof", "sidewalk", "pedestrian_zone"):
                    atmo_value = f"{outdoor} seating"
                facts_by_id[pid].append({
                    **fact_base,
                    "id": f"{pid}:osm:atmosphere:outdoor",
                    "field": "atmosphere",
                    "value": atmo_value,
                })

            # Indoor seating
            indoor = tags.get("indoor_seating", "")
            if indoor == "yes":
                facts_by_id[pid].append({
                    **fact_base,
                    "id": f"{pid}:osm:atmosphere:indoor",
                    "field": "atmosphere",
                    "value": "indoor seating",
                })

            # Wheelchair
            wheelchair = tags.get("wheelchair", "")
            if wheelchair in ("yes", "limited"):
                facts_by_id[pid].append({
                    **fact_base,
                    "id": f"{pid}:osm:tags:wheelchair",
                    "field": "tags",
                    "value": f"Wheelchair accessible ({wheelchair})",
                })

            # Diet info
            for diet_key in ("diet:vegetarian", "diet:vegan"):
                diet_val = tags.get(diet_key, "")
                if diet_val in ("yes", "only"):
                    label = diet_key.split(":")[1].title()
                    qualifier = "options" if diet_val == "yes" else "only"
                    facts_by_id[pid].append({
                        **fact_base,
                        "id": f"{pid}:osm:tags:{diet_key.replace(':', '_')}",
                        "field": "tags",
                        "value": f"{label} {qualifier}",
                    })

            # Description → atmosphere extraction
            desc = tags.get("description", "")
            if desc:
                desc_lower = desc.lower()
                for keyword, atmospheres in ATMOSPHERE_KEYWORDS.items():
                    if keyword in desc_lower:
                        for atmo in atmospheres:
                            facts_by_id[pid].append({
                                **fact_base,
                                "id": f"{pid}:osm:atmosphere:{normalize_name(atmo)}",
                                "field": "atmosphere",
                                "value": atmo,
                            })

            # Cuisine sub-tags → dish facts
            cuisine_raw = tags.get("cuisine", "")
            if cuisine_raw:
                for cuisine_part in cuisine_raw.split(";"):
                    cuisine_norm = cuisine_part.strip().lower()
                    if cuisine_norm in CUISINE_DISH_MAP:
                        for dish in CUISINE_DISH_MAP[cuisine_norm]:
                            facts_by_id[pid].append({
                                **fact_base,
                                "id": f"{pid}:osm:dish:{normalize_name(dish)}",
                                "field": "dish",
                                "value": dish,
                            })

    return facts_by_id


# ---------------------------------------------------------------------------
# Ground-truth → SourceFact extraction
# ---------------------------------------------------------------------------

# Category patterns from Husa / Visit Stockholm that imply atmosphere
CATEGORY_ATMOSPHERE_MAP: dict[str, list[str]] = {
    "fine dining": ["elegant", "fine dining"],
    "bistro": ["casual", "bistro"],
    "brasserie": ["lively", "brasserie"],
    "kvarterskrog": ["cozy", "neighborhood"],
    "husmanskost": ["traditional", "cozy"],
    "swedish husmanskost": ["traditional", "cozy"],
    "nordisk bistro": ["modern", "casual"],
    "klassisk krog": ["elegant", "classic"],
    "klassisk husmanskost": ["traditional", "cozy"],
    "historisk krog": ["historic", "classic"],
    "historiskt värdshus": ["historic", "charming"],
    "klassiskt värdshus": ["classic", "charming"],
    "boutique gastronomi": ["intimate", "elegant"],
    "fransk gastronomi": ["elegant", "french-inspired"],
    "hantverksbageri": ["artisan"],
    "hantverksmat": ["artisan", "crafted"],
    "smårätter & hantverk": ["intimate", "artisan"],
    "vinbar & mat": ["intimate", "cozy"],
    "nordisk modern mat": ["modern", "creative"],
    "modern nordisk mat": ["modern", "creative"],
    "hållbar gastronomi": ["modern", "sustainable"],
    "deli & bar": ["casual", "lively"],
    "klassisk matkonst": ["elegant", "classic"],
    "medelhavsmat": ["warm", "mediterranean"],
    "svensk mat & utsikt": ["scenic", "traditional"],
    "klassisk krog & utsikt": ["scenic", "elegant"],
    "fisk & skaldjur": ["classic", "seafood-focused"],
    "northern swedish": ["traditional", "rustic"],
    "international": ["modern", "diverse"],
    "franskt brasserie": ["lively", "french-inspired"],
    "internationellt brasserie": ["lively", "cosmopolitan"],
}

# Category patterns from Husa Guide that imply dish types
CATEGORY_DISH_MAP: dict[str, list[str]] = {
    "yakitori": ["yakitori", "tsukune"],
    "izakaya": ["yakitori", "edamame"],
    "taqueria": ["tacos", "tortillas"],
    "mexikansk taqueria": ["tacos", "tortillas"],
    "pierogarnia": ["pierogi"],
    "crêperie": ["crêpes"],
    "sushi": ["sushi", "sashimi"],
    "fisk & skaldjur": ["seafood"],
    "bistro & skaldjur": ["seafood"],
}


def extract_ground_truth_facts(
    place_index: dict[str, list[dict[str, Any]]],
) -> dict[int, list[dict[str, Any]]]:
    """Extract atmosphere/dish facts from editorial ground-truth files."""
    facts_by_id: dict[int, list[dict[str, Any]]] = {}
    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    def add_facts(
        name: str,
        source_name: str,
        source_url: str,
        category: str,
    ) -> None:
        norm = normalize_name(name)
        matched = place_index.get(norm, [])
        if not matched:
            return

        cat_lower = category.lower().strip()
        for place in matched:
            pid = place["id"]
            if pid not in facts_by_id:
                facts_by_id[pid] = []

            fact_base = {
                "placeId": pid,
                "source": source_name,
                "url": source_url,
                "verification": "listed",
                "capturedAt": timestamp,
            }

            # Atmosphere from category
            for pattern, atmospheres in CATEGORY_ATMOSPHERE_MAP.items():
                if pattern in cat_lower:
                    for atmo in atmospheres:
                        fact_id = f"{pid}:{normalize_name(source_name)}:atmosphere:{normalize_name(atmo)}"
                        facts_by_id[pid].append({
                            **fact_base,
                            "id": fact_id,
                            "field": "atmosphere",
                            "value": atmo,
                        })

            # Dishes from category
            for pattern, dishes in CATEGORY_DISH_MAP.items():
                if pattern in cat_lower:
                    for dish in dishes:
                        fact_id = f"{pid}:{normalize_name(source_name)}:dish:{normalize_name(dish)}"
                        facts_by_id[pid].append({
                            **fact_base,
                            "id": fact_id,
                            "field": "dish",
                            "value": dish,
                        })

    # Visit Stockholm
    if VISIT_STOCKHOLM.exists():
        for entry in json.loads(VISIT_STOCKHOLM.read_text(encoding="utf-8")):
            add_facts(
                entry.get("name", ""),
                "Visit Stockholm",
                "https://www.visitstockholm.se/",
                entry.get("category", ""),
            )

    # White Guide
    if WHITE_GUIDE.exists():
        for entry in json.loads(WHITE_GUIDE.read_text(encoding="utf-8")):
            add_facts(
                entry.get("name", ""),
                "White Guide Nordic",
                "https://whiteguide.com",
                entry.get("classification", ""),
            )

    # Husa Guide
    if HUSA_GUIDE.exists():
        for entry in json.loads(HUSA_GUIDE.read_text(encoding="utf-8")):
            add_facts(
                entry.get("name", ""),
                "Anders Husa & Kaitlin Orr Guide",
                "https://andershusa.com",
                entry.get("category", ""),
            )

    # Tasstipset (dog-friendly)
    if TASSTIPSET.exists():
        with open(TASSTIPSET, encoding="utf-8") as f:
            for row in csv.DictReader(f):
                name = row.get("name", "")
                norm = normalize_name(name)
                matched = place_index.get(norm, [])
                for place in matched:
                    if not eligible_dog_friendly_target(place):
                        continue
                    pid = place["id"]
                    if pid not in facts_by_id:
                        facts_by_id[pid] = []
                    facts_by_id[pid].append({
                        "id": f"{pid}:tasstipset:dogFriendly",
                        "placeId": pid,
                        "field": "dogFriendly",
                        "value": "true",
                        "source": "Tasstipset",
                        "url": "https://tasstipset.se",
                        "verification": "listed",
                        "capturedAt": timestamp,
                    })

    return facts_by_id


# ---------------------------------------------------------------------------
# Curated editorial reviews → dish/atmosphere SourceFacts
# ---------------------------------------------------------------------------

# Keyword extraction from the existing CURATED_GUIDE_REVIEWS in enrich_media.py
EDITORIAL_DISH_KEYWORDS: dict[str, list[str]] = {
    "yakitori": ["yakitori"],
    "izakaya": ["izakaya"],
    "tsukune": ["tsukune"],
    "chicken skewers": ["chicken skewers"],
    "steak": ["steak", "dry-aged beef"],
    "sourdough": ["sourdough"],
    "cardamom bun": ["cardamom bun"],
    "cardamom buns": ["cardamom bun"],
    "pierogi": ["pierogi"],
    "dumplings": ["dumplings"],
    "borscht": ["borscht"],
    "tacos": ["tacos"],
    "tortillas": ["corn tortillas"],
    "espresso": ["espresso"],
    "pastries": ["pastries"],
    "tasting menu": ["tasting menu"],
    "corn tortilla": ["corn tortillas"],
    "salsa": ["salsa"],
}

EDITORIAL_ATMOSPHERE_KEYWORDS: dict[str, list[str]] = {
    "casual": ["casual"],
    "cozy": ["cozy"],
    "intimate": ["intimate"],
    "lively": ["lively"],
    "charming": ["charming"],
    "grand": ["grand", "elegant"],
    "elegant": ["elegant"],
    "vibrant": ["lively"],
    "tiny cult": ["intimate", "cult following"],
    "neighborhood": ["neighborhood"],
}


def extract_editorial_facts(
    place_index: dict[str, list[dict[str, Any]]],
) -> dict[int, list[dict[str, Any]]]:
    """Extract dish/atmosphere facts from CURATED_GUIDE_REVIEWS in enrich_media.py."""
    # Import the reviews dict directly rather than parsing the file
    # We replicate the known entries to avoid import side-effects
    reviews = {
        "frantzén": "Sweden's first and only three-Michelin-starred restaurant. Head chef Björn Frantzén sources only the best ingredients from around the world.",
        "miyakodori": "Casual yakitori restaurant and izakaya from former Frantzén chefs. Delicious modern Japanese food, tsukune chicken skewers, and signature sesame dessert.",
        "ag": "Unmatched steak restaurant in Stockholm with a large dry-aging room and top cuts of meat from Sweden, Japan, and the U.S.",
        "drop coffee": "Award-winning independent specialty coffee roaster at Mariatorget with light-roasted, single-origin beans and precision hand brew options.",
        "pascal": "Popular specialty coffee café with outstanding espresso, rotating single-origin beans, and top-tier cardamom buns.",
        "la neta": "Authentic Mexican taqueria serving fresh corn tortillas, braised meats, and homemade salsa bar in Södermalm.",
        "svedjan bageri": "Artisan bakery in Zinkensdamm specializing in organic sourdough bread, traditional pastries, and exceptional fika.",
        "pyza ii": "Authentic Polish pierogarnia in Gamla Stan serving fresh handmade dumplings, borscht, and traditional comfort food.",
        "operakällaren": "Iconic Stockholm fine dining landmark located inside the Royal Opera House with grand dining room elegance and top gastronomy.",
        "schmaltz": "Charming European delicatessen and neighborhood bistro serving European classics, natural wines, and cured meats.",
        "lillebrors bageri": "Tiny cult bakery in Vasastan famous for freshly baked cardamom buns, sourdough loaves, and queues out the door.",
        "lykke nytorget": "Vibrant specialty coffee hub on Nytorget with direct-trade beans, lively atmosphere, and great breakfast items.",
    }

    facts_by_id: dict[int, list[dict[str, Any]]] = {}
    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    for venue_name, content in reviews.items():
        norm = normalize_name(venue_name)
        matched = place_index.get(norm, [])
        if not matched:
            continue

        content_lower = content.lower()
        for place in matched:
            pid = place["id"]
            if pid not in facts_by_id:
                facts_by_id[pid] = []

            fact_base = {
                "placeId": pid,
                "source": "Editorial Guide (Anders Husa & Kaitlin Orr)",
                "url": "https://andershusa.com",
                "verification": "listed",
                "capturedAt": timestamp,
            }

            # Dish extraction
            for keyword, dishes in EDITORIAL_DISH_KEYWORDS.items():
                if keyword in content_lower:
                    for dish in dishes:
                        facts_by_id[pid].append({
                            **fact_base,
                            "id": f"{pid}:editorial:dish:{normalize_name(dish)}",
                            "field": "dish",
                            "value": dish,
                        })

            # Atmosphere extraction
            for keyword, atmospheres in EDITORIAL_ATMOSPHERE_KEYWORDS.items():
                if keyword in content_lower:
                    for atmo in atmospheres:
                        facts_by_id[pid].append({
                            **fact_base,
                            "id": f"{pid}:editorial:atmosphere:{normalize_name(atmo)}",
                            "field": "atmosphere",
                            "value": atmo,
                        })

    return facts_by_id


# ---------------------------------------------------------------------------
# Curated open places → SourceFact conversion
# ---------------------------------------------------------------------------

# Map curated tags to dish/atmosphere facts
CURATED_TAG_DISH_MAP: dict[str, str] = {
    "taqueria": "tacos",
    "nixtamal": "nixtamal tortillas",
    "mezcal": "mezcal",
    "pasta": "pasta",
    "pizza": "pizza",
    "sourdough": "sourdough bread",
    "cardamom bun": "cardamom bun",
    "natural wine": "natural wine",
    "fika": "fika",
}

CURATED_TAG_ATMOSPHERE_MAP: dict[str, str] = {
    "trattoria": "trattoria-style",
}


def extract_curated_place_facts(
    place_index: dict[str, list[dict[str, Any]]],
) -> dict[int, list[dict[str, Any]]]:
    """Convert curated place tags into explicit SourceFacts."""
    facts_by_id: dict[int, list[dict[str, Any]]] = {}
    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    if not CURATED_PLACES.exists():
        return facts_by_id

    curated = json.loads(CURATED_PLACES.read_text(encoding="utf-8"))
    for entry in curated.get("places", []):
        name = entry.get("name", "")
        norm = normalize_name(name)
        matched = place_index.get(norm, [])
        if not matched:
            continue

        source_name = entry.get("sourceName", "Curated open source")
        source_url = entry.get("sourceUrl", "")
        tags = entry.get("tags", [])

        for place in matched:
            pid = place["id"]
            if pid not in facts_by_id:
                facts_by_id[pid] = []

            fact_base = {
                "placeId": pid,
                "source": source_name,
                "url": source_url,
                "verification": "listed",
                "capturedAt": timestamp,
            }

            for tag in tags:
                tag_lower = tag.lower().strip()

                # Dish mapping
                if tag_lower in CURATED_TAG_DISH_MAP:
                    dish = CURATED_TAG_DISH_MAP[tag_lower]
                    facts_by_id[pid].append({
                        **fact_base,
                        "id": f"{pid}:curated:dish:{normalize_name(dish)}",
                        "field": "dish",
                        "value": dish,
                    })

                # Atmosphere mapping
                if tag_lower in CURATED_TAG_ATMOSPHERE_MAP:
                    atmo = CURATED_TAG_ATMOSPHERE_MAP[tag_lower]
                    facts_by_id[pid].append({
                        **fact_base,
                        "id": f"{pid}:curated:atmosphere:{normalize_name(atmo)}",
                        "field": "atmosphere",
                        "value": atmo,
                    })

    return facts_by_id


# ---------------------------------------------------------------------------
# Phase 2: Website scraping & HTML fact extraction
# ---------------------------------------------------------------------------

USER_AGENT = "MotkartaBot/1.0 (+https://motkarta.se/bot; open catalog project)"


class WebsiteScraper:
    """Website scraper respecting robots.txt, rate limits, and local HTML caching."""

    def __init__(self, cache_dir: Path | None = None, delay_seconds: float = 0.5,
                 max_age_days: int = 30):
        self.cache_dir = cache_dir or (ROOT / ".tmp" / "scraped_html_cache")
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.delay_seconds = delay_seconds
        self.max_age_seconds = max_age_days * 86400
        self.robot_parsers: dict[str, urllib.robotparser.RobotFileParser] = {}
        self.last_request_time: float = 0.0

    def can_fetch(self, url: str) -> bool:
        """Check robots.txt for the host."""
        parsed = urllib.parse.urlparse(url)
        domain = parsed.netloc.lower()
        if not domain:
            return False
        if domain not in self.robot_parsers:
            rp = urllib.robotparser.RobotFileParser()
            robots_url = f"{parsed.scheme or 'https'}://{domain}/robots.txt"
            try:
                req = urllib.request.Request(robots_url, headers={"User-Agent": USER_AGENT})
                with urllib.request.urlopen(req, timeout=3) as resp:
                    rp.parse(resp.read().decode("utf-8", errors="ignore").splitlines())
            except Exception:
                rp.parse(["User-agent: *", "Allow: /"])
            self.robot_parsers[domain] = rp
        return self.robot_parsers[domain].can_fetch(USER_AGENT, url)

    def fetch_url(self, url: str) -> str | None:
        """Fetch URL content with local file caching, freshness limit, and rate limiting."""
        url_hash = hashlib.sha256(url.encode("utf-8")).hexdigest()[:16]
        cache_file = self.cache_dir / f"{url_hash}.html"
        if cache_file.exists():
            age = time.time() - cache_file.stat().st_mtime
            if age < self.max_age_seconds:
                return cache_file.read_text(encoding="utf-8", errors="ignore")
            print(f"  [Scraper] Cache stale ({int(age / 86400)}d > {int(self.max_age_seconds / 86400)}d): {url}")

        if not self.can_fetch(url):
            print(f"  [Scraper] Disallowed by robots.txt: {url}")
            return None

        # Rate limit
        elapsed = time.time() - self.last_request_time
        if elapsed < self.delay_seconds:
            time.sleep(self.delay_seconds - elapsed)

        print(f"  [Scraper] Fetching: {url}")
        try:
            req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(req, timeout=5) as resp:
                self.last_request_time = time.time()
                content = resp.read().decode("utf-8", errors="ignore")
                cache_file.write_text(content, encoding="utf-8")
                return content
        except Exception as err:
            print(f"  [Scraper] Failed to fetch {url}: {err}")
            return None


def extract_facts_from_html(
    html_text: str,
    url: str,
    place_id: int,
    timestamp: str,
) -> list[dict[str, Any]]:
    """Extract opening hours, dish, atmosphere, and price facts from raw HTML.

    JSON-LD structured data is parsed before BeautifulSoup strips script tags,
    so structured hours, price and address are not lost to the text preprocessor.
    """
    facts: list[dict[str, Any]] = []
    if not html_text:
        return facts

    from scripts.fetch_place_hours_and_prices import parse_schema_json_ld, determine_venue_price

    parsed_url = urllib.parse.urlparse(url)
    domain = parsed_url.netloc or "venue-website"

    fact_base: dict[str, Any] = {
        "placeId": place_id,
        "source": f"Venue Website ({domain})",
        "url": url,
        "verification": "listed",
        "capturedAt": timestamp,
    }

    # --- Structured JSON-LD extraction (before script tags are stripped) ---
    schema = parse_schema_json_ld(html_text)
    jsonld_has_hours = False
    jsonld_has_price = False

    if schema.get("opening_hours"):
        facts.append({
            **fact_base,
            "id": f"{place_id}:website:openingHours",
            "field": "openingHours",
            "value": schema["opening_hours"],
        })
        jsonld_has_hours = True

    if schema.get("price_range"):
        _, price_sek = determine_venue_price({}, schema["price_range"], (None, None))
        if price_sek:
            facts.append({
                **fact_base,
                "id": f"{place_id}:website:price",
                "field": "priceSEK",
                "value": price_sek,
            })
            jsonld_has_price = True

    if schema.get("street_address"):
        facts.append({
            **fact_base,
            "id": f"{place_id}:website:address",
            "field": "address",
            "value": schema["street_address"],
        })

    # --- Plain-text extraction (regex fallback for non-structured pages) ---
    if BeautifulSoup:
        soup = BeautifulSoup(html_text, "html.parser")
        for tag in soup(["script", "style", "nav", "footer"]):
            tag.decompose()
        text = soup.get_text(separator=" ", strip=True)
    else:
        text = re.sub(r"<[^>]+>", " ", html_text)
        text = html.unescape(text)

    text_lower = text.lower()

    # 1. Opening Hours (regex fallback — only if JSON-LD did not provide hours)
    hours_patterns = [
        r"(?:öppettider|opening hours)[:\s]*([a-zåäö0-9\s:,\.-–]{5,80})",
        r"\b(?:mån(?:dag)?|tis(?:dag)?|ons(?:dag)?|tors(?:dag)?|fre(?:dag)?|lör(?:dag)?|sön(?:dag)?|mo|tu|we|th|fr|sa|su)[-–a-z\s]*\d{1,2}[:.]\d{2}\s*[-–]\s*\d{1,2}[:.]\d{2}\b",
        r"\b(?:vardagar|helger|alla dagar)[:\s]*\d{1,2}[:.]\d{2}\s*[-–]\s*\d{1,2}[:.]\d{2}\b",
        r"\b(?:mån|tis|ons|tors|fre|lör|sön)[-–a-z\s]*\d{1,2}\s*[-–]\s*\d{1,2}\b",
    ]
    if not jsonld_has_hours:
        for pattern in hours_patterns:
            match = re.search(pattern, text_lower)
            if match:
                raw_hours = match.group(0).strip()
                if 5 <= len(raw_hours) <= 80:
                    facts.append({
                        **fact_base,
                        "id": f"{place_id}:website:openingHours",
                        "field": "openingHours",
                        "value": raw_hours,
                    })
                    break

    # 2. Dishes (keywords loaded from data/concierge/cuisine-dishes.json)
    for kw, dish_val in DISH_KEYWORDS.items():
        if kw in text_lower:
            facts.append({
                **fact_base,
                "id": f"{place_id}:website:dish:{normalize_name(dish_val)}",
                "field": "dish",
                "value": dish_val,
            })

    # 3. Atmosphere
    ATMOSPHERE_KEYWORDS = {
        "mysig": "cozy",
        "cozy": "cozy",
        "intimate": "intimate",
        "intim": "intimate",
        "kvarterskrog": "neighborhood",
        "uteservering": "outdoor seating",
        "outdoor seating": "outdoor seating",
        "bistro": "bistro",
        "vinbar": "wine bar",
        "lively": "lively",
        "familjärt": "welcoming",
        "hemtrevligt": "cozy",
    }
    for kw, atmo_val in ATMOSPHERE_KEYWORDS.items():
        if kw in text_lower:
            facts.append({
                **fact_base,
                "id": f"{place_id}:website:atmosphere:{normalize_name(atmo_val)}",
                "field": "atmosphere",
                "value": atmo_val,
            })

    # 4. Price pattern (regex fallback — only if JSON-LD did not provide price)
    if not jsonld_has_price:
        price_matches = re.findall(r"\b(\d{2,4})\s*(?:kr|sek|:-)", text_lower)
        if not price_matches:
            price_matches = re.findall(r"(?:lunch|dagens|meny|pris|från)[:\s]*(\d{2,4})\s*(?:kr|sek|:-)?", text_lower)
        if price_matches:
            prices = [int(p) for p in price_matches if 40 <= int(p) <= 1200]
            if prices:
                min_p, max_p = min(prices), max(prices)
                price_val = f"{min_p} SEK" if min_p == max_p else f"{min_p} - {max_p} SEK"
                facts.append({
                    **fact_base,
                    "id": f"{place_id}:website:price",
                    "field": "priceSEK",
                    "value": price_val,
                })

    return facts


def venue_enrichment_priority(place: dict[str, Any]) -> int:
    """Prioritize venues for website enrichment.
    0: Missing both openingHours and priceSEK (must-have priority)
    1: Missing openingHours
    2: Missing priceSEK
    3: Already has both sourced fields
    """
    has_hours = bool(place.get("openingHours"))
    has_price = bool(place.get("priceSEK"))
    if not has_hours and not has_price:
        return 0
    if not has_hours:
        return 1
    if not has_price:
        return 2
    return 3


def scrape_venue_websites(
    places: list[dict[str, Any]],
    limit: int = 0,
) -> dict[int, list[dict[str, Any]]]:
    """Scrape venue websites for places with valid website URLs, prioritizing missing must-have data."""
    facts_by_id: dict[int, list[dict[str, Any]]] = {}
    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    candidates: list[dict[str, Any]] = []
    for place in places:
        url = place.get("website") or ""
        if not url or not url.startswith("http"):
            for sf in place.get("sourceFacts", []):
                val = sf.get("value", "")
                if val.startswith("Website: http"):
                    url = val.replace("Website: ", "").strip()
                    break
        if url and url.startswith("http"):
            candidates.append({"place": place, "url": url})

    # Prioritize places missing must-have data (openingHours & priceSEK)
    candidates.sort(key=lambda c: (venue_enrichment_priority(c["place"]), c["place"].get("id", 0)))

    if limit > 0:
        candidates = candidates[:limit]

    print(f"Scraping {len(candidates)} venue websites (prioritizing missing hours & prices)...")
    scraper = WebsiteScraper()

    for item in candidates:
        place = item["place"]
        url = item["url"]
        pid = place["id"]

        html_content = scraper.fetch_url(url)
        if not html_content:
            continue

        extracted = extract_facts_from_html(html_content, url, pid, timestamp)
        if extracted:
            facts_by_id[pid] = extracted

    return facts_by_id



# ---------------------------------------------------------------------------
# Build place index for matching
# ---------------------------------------------------------------------------

def build_place_index(places: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    """Build a lookup index keyed by normalized name and OSM identity."""
    index: dict[str, list[dict[str, Any]]] = {}
    for place in places:
        # Index by normalized name
        norm = normalize_name(place.get("name", ""))
        if norm:
            index.setdefault(norm, []).append(place)

        # Index by OSM identity
        osm_id = place.get("osmIdentity", "")
        if osm_id:
            index.setdefault(osm_id, []).append(place)

        # Index by osm_type:osm_id pattern from CSV data
        osm_type = place.get("osm_type", "")
        osm_id_num = place.get("osm_id", "")
        if osm_type and osm_id_num:
            identity = f"{osm_type}:{osm_id_num}"
            index.setdefault(identity, []).append(place)

    return index


# ---------------------------------------------------------------------------
# Merge and deduplicate facts
# ---------------------------------------------------------------------------

def merge_facts(*fact_dicts: dict[int, list[dict[str, Any]]]) -> dict[int, list[dict[str, Any]]]:
    """Merge multiple fact dictionaries, deduplicating by fact ID."""
    merged: dict[int, list[dict[str, Any]]] = {}
    for fd in fact_dicts:
        for pid, facts in fd.items():
            if pid not in merged:
                merged[pid] = []
            merged[pid].extend(facts)

    # Deduplicate by fact ID within each place
    for pid in merged:
        seen: set[str] = set()
        deduped: list[dict[str, Any]] = []
        for fact in merged[pid]:
            fid = fact.get("id", "")
            if fid and fid not in seen:
                seen.add(fid)
                deduped.append(fact)
        merged[pid] = deduped

    return merged


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Enrich catalog with source facts from local data."
    )
    parser.add_argument(
        "--output", "-o",
        default=str(ROOT / "data" / "enrichment_overlay.json"),
        help="Output path for the enrichment overlay JSON.",
    )
    parser.add_argument(
        "--places",
        default=str(PLACES_JSON),
        help="Path to public/data/places.json.",
    )
    parser.add_argument(
        "--scrape",
        action="store_true",
        help="Phase 2: also scrape venue websites (external HTTP calls).",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=0,
        help="Limit number of venue websites to scrape (0 = all).",
    )
    args = parser.parse_args()

    # Load the public catalog
    places_path = Path(args.places)
    if not places_path.exists():
        print(f"ERROR: Places file not found: {places_path}", file=sys.stderr)
        sys.exit(1)

    catalog = json.loads(places_path.read_text(encoding="utf-8"))
    places = catalog.get("places", catalog) if isinstance(catalog, dict) else catalog
    if not isinstance(places, list):
        print("ERROR: Expected a list of places", file=sys.stderr)
        sys.exit(1)

    print(f"Loaded {len(places)} places from {places_path}")
    index = build_place_index(places)

    # Phase 1: OSM re-extraction
    osm_facts: dict[int, list[dict[str, Any]]] = {}
    if OSM_RAW.exists():
        print(f"Extracting facts from OSM raw data ({OSM_RAW})...")
        osm_data = json.loads(OSM_RAW.read_text(encoding="utf-8"))
        elements = osm_data.get("elements", [])
        metadata_path = OSM_RAW.with_name("osm_stockholm_food_places.metadata.json")
        metadata = json.loads(metadata_path.read_text()) if metadata_path.exists() else {}
        osm_facts = extract_osm_facts(elements, index, metadata.get("fetched_at"))
        print(f"  OSM: {sum(len(v) for v in osm_facts.values())} facts for {len(osm_facts)} places")
    else:
        print(f"WARN: OSM raw file not found: {OSM_RAW}")

    # Phase 1: Ground-truth enrichment
    print("Extracting facts from ground-truth files...")
    gt_facts = extract_ground_truth_facts(index)
    print(f"  Ground-truth: {sum(len(v) for v in gt_facts.values())} facts for {len(gt_facts)} places")

    # Phase 1: Editorial review enrichment
    print("Extracting facts from editorial reviews...")
    editorial_facts = extract_editorial_facts(index)
    print(f"  Editorial: {sum(len(v) for v in editorial_facts.values())} facts for {len(editorial_facts)} places")

    # Phase 1: Curated places enrichment
    print("Extracting facts from curated open places...")
    curated_facts = extract_curated_place_facts(index)
    print(f"  Curated: {sum(len(v) for v in curated_facts.values())} facts for {len(curated_facts)} places")

    # Merge all Phase 1
    all_facts = merge_facts(osm_facts, gt_facts, editorial_facts, curated_facts)

    # Phase 2: Website scraping (if enabled)
    if args.scrape:
        print(f"\nPhase 2: Scraping venue websites (limit={args.limit or 'unlimited'})...")
        website_facts = scrape_venue_websites(places, limit=args.limit)
        print(f"  Website scraper: {sum(len(v) for v in website_facts.values())} facts for {len(website_facts)} places")
        all_facts = merge_facts(all_facts, website_facts)


    # Summary by field type
    field_counts: dict[str, int] = {}
    for facts in all_facts.values():
        for fact in facts:
            field = fact.get("field", "unknown")
            field_counts[field] = field_counts.get(field, 0) + 1

    print(f"\n=== Enrichment Summary ===")
    print(f"Total places enriched: {len(all_facts)} / {len(places)}")
    print(f"Total facts generated: {sum(len(v) for v in all_facts.values())}")
    print(f"Facts by field:")
    for field, count in sorted(field_counts.items(), key=lambda x: -x[1]):
        print(f"  {field}: {count}")

    # Write output
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    overlay = {
        "version": "enrichment-overlay-v1",
        "generatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "sourcePlacesCount": len(places),
        "enrichedPlacesCount": len(all_facts),
        "totalFacts": sum(len(v) for v in all_facts.values()),
        "fieldCounts": field_counts,
        "facts": {str(pid): facts for pid, facts in sorted(all_facts.items())},
    }

    output_path.write_text(
        json.dumps(overlay, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    print(f"\nWrote enrichment overlay: {output_path}")


if __name__ == "__main__":
    main()
