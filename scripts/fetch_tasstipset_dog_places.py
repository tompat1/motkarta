#!/usr/bin/env python3
"""Python scraper for verified dog-friendly places in Stockholm from https://tasstipset.se/.

Extracts structured venue records, dog-friendly policy badges (inside/outside),
verification quotes from venue owners, geographic coordinates, and metadata.
"""

from __future__ import annotations

import argparse
import html
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any

try:
    from bs4 import BeautifulSoup
except ImportError:
    BeautifulSoup = None  # type: ignore[assignment,misc]


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT_PATH = ROOT / "outputs" / "tasstipset_dog_places_stockholm.json"
BASE_URL = "https://tasstipset.se"
STOCKHOLM_URL = f"{BASE_URL}/stad/stockholm"

USER_AGENT = "MotkartaBot/1.0 (+https://motkarta.se; dog-friendly places aggregator)"


@dataclass
class DogPlaceRecord:
    source_id: str
    name: str
    url: str
    category: str
    kind: str
    area: str
    address: str
    latitude: float | None
    longitude: float | None
    phone: str | None = None
    website: str | None = None
    description: str | None = None
    dog_policy: str = "Hundar välkomna"
    dog_policy_quote: str | None = None
    is_venue_verified: bool = False
    verification_date: str | None = None
    tags: list[str] = field(default_factory=list)
    source_name: str = "Tasstipset"
    source_url: str = "https://tasstipset.se/"
    last_scraped: str = field(default_factory=lambda: time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()))


def fetch_url(url: str, timeout: int = 15) -> str:
    """Fetch content from a URL using standard urllib with custom headers."""
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": USER_AGENT,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "sv-SE,sv;q=0.9,en-US;q=0.8,en;q=0.7",
        },
    )
    with urllib.request.urlopen(req, timeout=timeout) as response:
        charset = response.headers.get_content_charset() or "utf-8"
        return response.read().decode(charset, errors="replace")


def extract_json_ld_blocks(html_content: str) -> list[dict[str, Any]]:
    """Extract all valid JSON-LD script blocks from an HTML page."""
    blocks: list[dict[str, Any]] = []
    
    if BeautifulSoup:
        soup = BeautifulSoup(html_content, "html.parser")
        for script in soup.find_all("script", type="application/ld+json"):
            text = script.string or script.get_text()
            if not text:
                continue
            try:
                data = json.loads(text)
                if isinstance(data, list):
                    blocks.extend(d for d in data if isinstance(d, dict))
                elif isinstance(data, dict):
                    blocks.append(data)
            except Exception:
                continue
    else:
        # Fallback regex extraction if bs4 is unavailable
        pattern = re.compile(r'<script[^>]*type=[\'"]application/ld\+json[\'"][^>]*>(.*?)</script>', re.DOTALL | re.IGNORECASE)
        for match in pattern.finditer(html_content):
            text = match.group(1).strip()
            if not text:
                continue
            try:
                data = json.loads(text)
                if isinstance(data, list):
                    blocks.extend(d for d in data if isinstance(d, dict))
                elif isinstance(data, dict):
                    blocks.append(data)
            except Exception:
                continue

    return blocks


def extract_stockholm_place_links(
    html_content: str,
    base_url: str = BASE_URL,
    crawl_subpages: bool = False,
) -> list[dict[str, str]]:
    """Extract list of Stockholm venue links from the city landing page and optionally its subpages."""
    links: list[dict[str, str]] = []
    seen_urls: set[str] = set()

    def add_from_html(content: str) -> None:
        # 1. Try extracting from ItemList in JSON-LD
        json_blocks = extract_json_ld_blocks(content)
        for block in json_blocks:
            if block.get("@type") == "ItemList" and "itemListElement" in block:
                for item in block["itemListElement"]:
                    url = item.get("url")
                    name = item.get("name", "")
                    if url and "/plats/" in url and url not in seen_urls:
                        seen_urls.add(url)
                        links.append({"name": name, "url": url})

        # 2. Fallback / supplement: regex extraction of href="/plats/..."
        href_pattern = re.compile(r'href=[\'"](/plats/[a-zA-Z0-9_\-]+)[\'"]', re.IGNORECASE)
        for match in href_pattern.finditer(content):
            path = match.group(1)
            full_url = urllib.parse.urljoin(base_url, path)
            if full_url not in seen_urls:
                seen_urls.add(full_url)
                slug = path.replace("/plats/", "").replace("-", " ").title()
                links.append({"name": slug, "url": full_url})

    add_from_html(html_content)

    if crawl_subpages:
        sub_pattern = re.compile(r'href=[\'"](/stad/stockholm/[a-zA-Z0-9_\-]+)[\'"]', re.IGNORECASE)
        sub_paths = sorted(set(sub_pattern.findall(html_content)))
        for sub in sub_paths:
            try:
                sub_url = urllib.parse.urljoin(base_url, sub)
                sub_html = fetch_url(sub_url)
                add_from_html(sub_html)
            except Exception:
                continue

    return links


def map_category_to_kind(category_str: str) -> str:
    """Map Tasstipset category string to Motkarta establishment kind."""
    cat_lower = category_str.lower()
    if "cafeorcoffeeshop" in cat_lower or "caf" in cat_lower or "kafe" in cat_lower or "fika" in cat_lower:
        return "Café"
    if "bakery" in cat_lower or "bageri" in cat_lower:
        return "Bakery"
    if "restaurang" in cat_lower or "restaurant" in cat_lower or "bistro" in cat_lower or "brasserie" in cat_lower:
        return "Restaurant"
    if "bar" in cat_lower or "pub" in cat_lower or "vin" in cat_lower:
        return "Restaurant"
    if "hotell" in cat_lower or "hotel" in cat_lower:
        return "Hotell"
    if "park" in cat_lower or "strand" in cat_lower:
        return "Park"
    return "Restaurant"


def clean_text_emojis(text: str) -> str:
    """Remove HTML tags and common decorative emojis from text strings."""
    stripped = re.sub(r"<[^>]+>", "", text)
    cleaned = re.sub(r"[☕🍽️🌳🛏️🛍️🏖️📍🐾🏠🌿✨✓✕›·]", "", stripped)
    return html.unescape(cleaned).strip()


def parse_tasstipset_place_page(html_content: str, url: str) -> DogPlaceRecord:
    """Parse an individual Tasstipset venue page into a DogPlaceRecord."""
    slug = url.rstrip("/").split("/")[-1]
    source_id = f"tasstipset:{slug}"

    # Extract JSON-LD data
    json_blocks = extract_json_ld_blocks(html_content)
    place_json: dict[str, Any] = {}
    json_ld_type = ""
    for block in json_blocks:
        btype = str(block.get("@type", ""))
        if any(k in btype.lower() for k in ["cafe", "restaurant", "bakery", "localbusiness", "foodestablishment", "store", "park", "hotel"]):
            place_json = block
            json_ld_type = btype
            break

    # Extract Name & Description
    name = place_json.get("name")
    if not name:
        h1_m = re.search(r'<h1[^>]*>(.*?)</h1>', html_content, re.IGNORECASE | re.DOTALL)
        if h1_m:
            name = clean_text_emojis(h1_m.group(1))
        else:
            name = slug.replace("-", " ").title()

    description = place_json.get("description")
    phone = place_json.get("telephone")
    if not phone:
        phone_m = re.search(r'href=[\'"]tel:([^\'"]+)[\'"]', html_content)
        if phone_m:
            phone = phone_m.group(1).strip()

    same_as = place_json.get("sameAs")
    website = same_as[0] if (isinstance(same_as, list) and same_as) else None
    if not website:
        web_m = re.search(r'href=[\'"](https?://[^\'"]+)[\'"][^>]*>[^<]*Webbplats', html_content, re.IGNORECASE)
        if web_m:
            website = web_m.group(1)

    # Address & Coordinates from JSON-LD or HTML
    addr_obj = place_json.get("address", {})
    street_address = addr_obj.get("streetAddress", "") if isinstance(addr_obj, dict) else ""
    if not street_address:
        header_m = re.search(r'<header[^>]*>(.*?)</header>', html_content, re.IGNORECASE | re.DOTALL)
        if header_m:
            p_matches = re.findall(r'<p[^>]*>(.*?)</p>', header_m.group(1), re.IGNORECASE | re.DOTALL)
            for p_text in p_matches:
                cleaned_p = clean_text_emojis(p_text)
                if any(c.isdigit() for c in cleaned_p) and "stockholm" in cleaned_p.lower():
                    street_address = cleaned_p
                    break

    geo_obj = place_json.get("geo", {})
    latitude = float(geo_obj["latitude"]) if isinstance(geo_obj, dict) and "latitude" in geo_obj else None
    longitude = float(geo_obj["longitude"]) if isinstance(geo_obj, dict) and "longitude" in geo_obj else None

    # Category & Area
    category = "Restaurang"
    if json_ld_type:
        category = json_ld_type

    area = "Stockholm"
    dog_policy = "Hundar välkomna"
    dog_policy_quote = None
    is_venue_verified = False
    verification_date = None

    KNOWN_AREAS = {
        "södermalm": "Södermalm",
        "norrmalm": "Norrmalm",
        "vasastan": "Vasastan",
        "östermalm": "Östermalm",
        "gamla stan": "Gamla stan",
        "kungsholmen": "Kungsholmen",
        "djurgården": "Djurgården",
        "norra djurgården": "Norra Djurgården",
        "liljeholmen": "Liljeholmen",
        "aspudden": "Aspudden",
        "midsommarkransen": "Midsommarkransen",
        "johanneshov": "Johanneshov",
        "hjorthagen": "Hjorthagen",
        "birkastan": "Birkastan",
        "marieberg": "Marieberg",
        "stadshagen": "Stadshagen",
        "farsta": "Farsta",
        "kista": "Kista",
        "ladugårdsgärdet": "Ladugårdsgärdet",
        "södra hammarbyhamnen": "Södra Hammarbyhamnen",
        "hammarby sjöstad": "Hammarby Sjöstad",
    }

    header_m = re.search(r'<header[^>]*>(.*?)</header>', html_content, re.IGNORECASE | re.DOTALL)
    if header_m:
        header_content = header_m.group(1)
        span_texts = [clean_text_emojis(s) for s in re.findall(r'<span[^>]*>(.*?)</span>', header_content, re.IGNORECASE | re.DOTALL)]
        for s in span_texts:
            if s in ["Café", "Restaurang", "Park", "Hotell", "Bageri", "Butik", "Strand"]:
                category = s
            if s.lower() in KNOWN_AREAS:
                area = KNOWN_AREAS[s.lower()]

    # Area fallback from breadcrumbs or title/body
    breadcrumb_m = re.search(r'<nav[^>]*aria-label=[\'"](?:Brödsmulor|Breadcrumbs)[\'"][^>]*>(.*?)</nav>', html_content, re.IGNORECASE | re.DOTALL)
    if breadcrumb_m:
        bc_items = re.findall(r'<li[^>]*>(.*?)</li>', breadcrumb_m.group(1), re.IGNORECASE | re.DOTALL)
        for item in bc_items:
            c = clean_text_emojis(item).lower()
            if c in KNOWN_AREAS:
                area = KNOWN_AREAS[c]

    if area == "Stockholm":
        # Search title and header for area keywords
        title_m = re.search(r'<title[^>]*>(.*?)</title>', html_content, re.IGNORECASE)
        title_text = title_m.group(1).lower() if title_m else ""
        for key, val in KNOWN_AREAS.items():
            if f"i {key}" in title_text or f"· {key}" in title_text or f"- {key}" in title_text:
                area = val
                break

    # Dog Policy Badge (e.g. "Hundar inne & ute", "Hundar inne", "Endast ute")
    badge_m = re.search(r'class="[^"]*(?:emerald|badge)[^"]*"[^>]*>(.*?)</span>', html_content, re.IGNORECASE | re.DOTALL)
    if badge_m:
        badge_text = clean_text_emojis(badge_m.group(1))
        if "hund" in badge_text.lower() or "ute" in badge_text.lower() or "inne" in badge_text.lower():
            dog_policy = badge_text

    # Dog Policy Quote / Section
    policy_sec_m = re.search(r'<section[^>]*>.*?<h2[^>]*>Hundpolicy</h2>\s*<p[^>]*>(.*?)</p>.*?</section>', html_content, re.IGNORECASE | re.DOTALL)
    if policy_sec_m:
        dog_policy_quote = clean_text_emojis(policy_sec_m.group(1))
    else:
        hitta_m = re.search(r'<section[^>]*>.*?<h2[^>]*>Hitta hit</h2>.*?<p[^>]*>(.*?)</p>.*?</section>', html_content, re.IGNORECASE | re.DOTALL)
        if hitta_m and "hund" in hitta_m.group(1).lower():
            dog_policy_quote = clean_text_emojis(hitta_m.group(1))

    # Verification Status
    if "Verifierat av stället" in html_content or "Restaurangen själv har bekräftat" in html_content:
        is_venue_verified = True

    # Verification Date
    date_match = re.search(r"kontrollerat\s+([0-9]+\s+[a-zåäöA-ZÅÄÖ]+\s+[0-9]{4})", html_content, re.IGNORECASE)
    if date_match:
        verification_date = date_match.group(1)
    elif date_match := re.search(r"\(([0-9]+\s+[a-zåäöA-ZÅÄÖ]+\s+[0-9]{4})\)", html_content):
        verification_date = date_match.group(1)

    kind = map_category_to_kind(category)

    tags = ["Dog friendly", "Hundvänligt", "Tasstipset"]
    if "inne" in dog_policy.lower() and "ute" in dog_policy.lower():
        tags.append("Hundar inne & ute")
    elif "inne" in dog_policy.lower():
        tags.append("Hundar inomhus")
    elif "ute" in dog_policy.lower():
        tags.append("Endast uteservering")

    if is_venue_verified:
        tags.append("Verifierad hundpolicy")



    return DogPlaceRecord(
        source_id=source_id,
        name=html.unescape(name).strip(),
        url=url,
        category=category,
        kind=kind,
        area=area,
        address=html.unescape(street_address).strip() if street_address else f"{area}, Stockholm",
        latitude=latitude,
        longitude=longitude,
        phone=phone,
        website=website,
        description=html.unescape(description).strip() if description else None,
        dog_policy=dog_policy,
        dog_policy_quote=html.unescape(dog_policy_quote).strip() if dog_policy_quote else None,
        is_venue_verified=is_venue_verified,
        verification_date=verification_date,
        tags=tags,
    )


def scrape_tasstipset_stockholm(
    output_path: Path = DEFAULT_OUTPUT_PATH,
    limit: int | None = None,
    delay: float = 0.25,
    quiet: bool = False,
) -> list[dict[str, Any]]:
    """Scrape all dog-friendly venues in Stockholm from Tasstipset."""
    if not quiet:
        print(f"🐶 Fetching Stockholm venue directory from: {STOCKHOLM_URL}")

    stockholm_html = fetch_url(STOCKHOLM_URL)
    place_links = extract_stockholm_place_links(stockholm_html)

    if not quiet:
        print(f"🐾 Found {len(place_links)} places in Stockholm directory.")

    if limit and limit > 0:
        place_links = place_links[:limit]
        if not quiet:
            print(f"⚡ Limiting scrape to first {limit} places.")

    records: list[DogPlaceRecord] = []
    for i, item in enumerate(place_links, 1):
        url = item["url"]
        name = item.get("name", "")
        if not quiet:
            print(f"[{i}/{len(place_links)}] Scraping: {name} ({url})")

        try:
            place_html = fetch_url(url)
            record = parse_tasstipset_place_page(place_html, url)
            records.append(record)
        except Exception as err:
            if not quiet:
                print(f"  ⚠️ Error scraping {url}: {err}", file=sys.stderr)

        if delay > 0:
            time.sleep(delay)

    output_data = {
        "source": "https://tasstipset.se",
        "city": "Stockholm",
        "total_places": len(records),
        "verified_places_count": sum(1 for r in records if r.is_venue_verified),
        "scraped_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "places": [asdict(r) for r in records],
    }

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(output_data, ensure_ascii=False, indent=2), encoding="utf-8")

    if not quiet:
        print(f"✨ Successfully saved {len(records)} dog-friendly places to: {output_path}")

    return output_data["places"]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Scrape dog-friendly places in Stockholm from Tasstipset.se")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT_PATH, help="Output JSON path")
    parser.add_argument("--limit", type=int, default=None, help="Limit number of places to scrape")
    parser.add_argument("--delay", type=float, default=0.2, help="Delay in seconds between requests")
    parser.add_argument("--quiet", action="store_true", help="Suppress progress output")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    scrape_tasstipset_stockholm(
        output_path=args.output,
        limit=args.limit,
        delay=args.delay,
        quiet=args.quiet,
    )


if __name__ == "__main__":
    main()
