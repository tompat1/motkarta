"""
On-Demand Web Search & Editorial Guide Enrichment for Motkarta.

Extracts venue facts (dishes, opening hours, price indications, atmosphere) from
editorial guides (e.g., SvD Krogmätarna, Guide to Stockholm, Visit Stockholm)
and official venue self-reported websites.

Strict Invariants:
- Excludes commercial aggregators (Yelp, TripAdvisor, Google Stars, paid ads).
- Preserves explicit source provenance (source, url, verification='listed', capturedAt UTC timestamp).
- Emits structured overlay JSON compatible with execution/apply_enrichment.py.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import unicodedata
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

try:
    from bs4 import BeautifulSoup
except ImportError:
    BeautifulSoup = None  # type: ignore[assignment,misc]

ROOT = Path(__file__).resolve().parents[1]
PLACES_JSON = ROOT / "public" / "data" / "places.json"
DEFAULT_OVERLAY = ROOT / "data" / "enrichment_overlay.json"

PROHIBITED_DOMAINS = {
    "yelp.com",
    "tripadvisor.com",
    "google.com",
    "facebook.com",
    "instagram.com",
    "zomato.com",
    "foursquare.com",
    "trustpilot.com",
}


def is_commercial_aggregator(url: str) -> bool:
    """Return True if URL originates from a prohibited commercial aggregator or rating platform."""
    try:
        domain = urllib.parse.urlparse(url).netloc.lower()
        return any(domain == p or domain.endswith("." + p) for p in PROHIBITED_DOMAINS)
    except Exception:
        return False


def normalize_name(name: str) -> str:
    """Normalize a venue name for fuzzy matching."""
    s = name.lower().strip()
    s = unicodedata.normalize("NFKD", s)
    s = re.sub(r"[\u0300-\u036f]", "", s)
    s = s.replace("ł", "l")
    s = re.sub(r"[^a-z0-9]+", " ", s).strip()
    return s


def extract_facts_from_guide_html(
    html_content: str,
    source_url: str,
    places_catalog: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Extract factual venue annotations from an editorial guide or venue page."""
    if is_commercial_aggregator(source_url):
        return []

    domain = urllib.parse.urlparse(source_url).netloc or "web"
    source_tag = f"Editorial Guide ({domain})"
    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    # Build fuzzy index of catalog places
    catalog_map: dict[str, dict[str, Any]] = {}
    for p in places_catalog:
        norm = normalize_name(p.get("name", ""))
        if norm:
            catalog_map[norm] = p

    extracted_facts: list[dict[str, Any]] = []
    text_content = html_content

    if BeautifulSoup is not None:
        try:
            soup = BeautifulSoup(html_content, "html.parser")
            # Remove scripts & styles
            for elem in soup(["script", "style", "nav", "footer", "header"]):
                elem.extract()
            text_content = soup.get_text(separator="\n")
        except Exception:
            text_content = html_content

    # Match catalog places mentioned in text
    lines = [line.strip() for line in text_content.splitlines() if line.strip()]
    full_text = "\n".join(lines)

    for norm_name, place in catalog_map.items():
        place_name = place.get("name", "")
        if len(place_name) < 3:
            continue

        # Check if place name is mentioned in text
        if re.search(r"\b" + re.escape(place_name) + r"\b", full_text, re.IGNORECASE) or norm_name in normalize_name(full_text):
            place_id = place.get("id")
            if not place_id:
                continue

            # Extract dish context around mention
            dish_keywords = ["pad thai", "curry", "tom yum", "pierogi", "sushi", "ramen", "tacos", "pasta", "pizza", "bageri", "kaffe", "fika", "soppa", "wok"]
            for dish in dish_keywords:
                if re.search(r"\b" + re.escape(dish) + r"\b", full_text, re.IGNORECASE):
                    fact_id = hashlib.md5(f"{place_id}:dish:{dish}:{source_url}".encode("utf-8")).hexdigest()[:12]
                    extracted_facts.append({
                        "id": fact_id,
                        "placeId": place_id,
                        "field": "dish",
                        "value": dish,
                        "source": source_tag,
                        "url": source_url,
                        "verification": "listed",
                        "capturedAt": timestamp,
                    })

            # Extract atmosphere indicators
            atmosphere_terms = ["uteservering", "uteserveringen", "mysigt", "trädgård", "takbar", "vibe", "lively", "cozy"]
            for term in atmosphere_terms:
                if term in full_text.lower():
                    mapped_val = "outdoor seating" if "uteservering" in term else ("garden seating" if "trädgård" in term else ("rooftop" if "takbar" in term else "cozy"))
                    fact_id = hashlib.md5(f"{place_id}:atmosphere:{mapped_val}:{source_url}".encode("utf-8")).hexdigest()[:12]
                    extracted_facts.append({
                        "id": fact_id,
                        "placeId": place_id,
                        "field": "atmosphere",
                        "value": mapped_val,
                        "source": source_tag,
                        "url": source_url,
                        "verification": "listed",
                        "capturedAt": timestamp,
                    })

    # Deduplicate extracted facts
    seen_ids = set()
    unique_facts = []
    for f in extracted_facts:
        if f["id"] not in seen_ids:
            seen_ids.add(f["id"])
            unique_facts.append(f)

    return unique_facts


def enrich_from_url(url: str, output_path: Path = DEFAULT_OVERLAY) -> list[dict[str, Any]]:
    """Fetch URL, extract facts, and merge into output overlay JSON."""
    if is_commercial_aggregator(url):
        print(f"Skipping prohibited commercial domain: {url}")
        return []

    places: list[dict[str, Any]] = []
    if PLACES_JSON.exists():
        try:
            data = json.loads(PLACES_JSON.read_text(encoding="utf-8"))
            places = data.get("places", data) if isinstance(data, dict) else data
        except Exception:
            pass

    print(f"Fetching editorial guide: {url}")
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "Motkarta-Bot/1.0 (+https://motkarta.se/bot; open data research)"},
    )

    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            html_text = resp.read().decode("utf-8", errors="ignore")
    except Exception as err:
        print(f"Failed to fetch {url}: {err}")
        return []

    facts = extract_facts_from_guide_html(html_text, url, places)
    print(f"Extracted {len(facts)} facts from {url}")

    if facts and output_path:
        overlay: dict[str, Any] = {}
        if output_path.exists():
            try:
                loaded = json.loads(output_path.read_text(encoding="utf-8"))
                if isinstance(loaded, dict) and "facts" in loaded:
                    overlay = loaded
            except Exception:
                pass

        if not overlay or "facts" not in overlay:
            overlay = {
                "version": "enrichment-overlay-v1",
                "generatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
                "sourcePlacesCount": len(places),
                "enrichedPlacesCount": 0,
                "totalFacts": 0,
                "fieldCounts": {},
                "facts": {},
            }

        facts_dict: dict[str, list[dict[str, Any]]] = overlay.get("facts", {})

        new_count = 0
        for f in facts:
            pid_str = str(f["placeId"])
            if pid_str not in facts_dict:
                facts_dict[pid_str] = []

            existing_ids = {ef.get("id") for ef in facts_dict[pid_str] if isinstance(ef, dict)}
            if f["id"] not in existing_ids:
                facts_dict[pid_str].append(f)
                new_count += 1

        overlay["facts"] = facts_dict
        overlay["enrichedPlacesCount"] = len(facts_dict)
        overlay["totalFacts"] = sum(len(v) for v in facts_dict.values())
        overlay["generatedAt"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(json.dumps(overlay, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"Updated {output_path} (added {new_count} new facts)")

    return facts


def main() -> None:
    parser = argparse.ArgumentParser(description="Enrich Motkarta catalog with web search & editorial guide facts.")
    parser.add_argument("--url", type=str, help="Target URL of editorial guide or venue website")
    parser.add_argument("--output", type=Path, default=DEFAULT_OVERLAY, help="Path to output overlay JSON")
    args = parser.parse_args()

    if args.url:
        enrich_from_url(args.url, args.output)
    else:
        print("Please provide a --url parameter (e.g. python execution/enrich_web_search.py --url 'https://www.guidetostockholm.se/...').")


if __name__ == "__main__":
    main()
