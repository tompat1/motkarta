#!/usr/bin/env python3
"""Python scraper for verified dog-friendly places in Stockholm from https://tasstipset.se/.

Extracts structured venue records, dog-friendly policy badges (inside/outside),
verification quotes from venue owners, geographic coordinates, and metadata.
"""

from __future__ import annotations

import argparse
import html
import json
import math
import re
import sys
import time
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any

try:
    from bs4 import BeautifulSoup
except ImportError:
    BeautifulSoup = None  # type: ignore[assignment,misc]


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from motkarta.stockholm_boundary import is_stockholm_municipality_place
from motkarta.catalog_exclusions import is_excluded_catalog_name
from motkarta.dog_friendly import add_dog_friendly_feature, eligible_dog_friendly_target

DEFAULT_OUTPUT_PATH = ROOT / "outputs" / "tasstipset_dog_places_stockholm.json"
DEFAULT_PLACES_PATH = ROOT / "public" / "data" / "places.json"
DEFAULT_CURATED_PATH = ROOT / "data" / "curated_open_places.json"
BASE_URL = "https://tasstipset.se"
STOCKHOLM_URL = f"{BASE_URL}/stad/stockholm"
SITEMAP_URL = f"{BASE_URL}/sitemap.xml"

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
        pattern = re.compile(
            r'<script[^>]*type=[\'"]application/ld\+json[\'"][^>]*>(.*?)</script>',
            re.DOTALL | re.IGNORECASE,
        )
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


def extract_sitemap_place_urls(sitemap_content: str) -> list[str]:
    """Extract place URLs from sitemap XML content."""
    urls = re.findall(r"<loc>(https://tasstipset\.se/plats/[^<]+)</loc>", sitemap_content)
    return sorted(set(urls))


def is_in_greater_stockholm(lat: float | None, lon: float | None, area: str = "", address: str = "") -> bool:
    """Backward-compatible Stockholm municipality scope check."""
    return is_stockholm_municipality_place(lat, lon, area=area, address=address)


def is_in_stockholm_municipality(record: DogPlaceRecord | dict[str, Any]) -> bool:
    """Check if a parsed Tasstipset record belongs to Stockholm municipality."""
    getter = record.get if isinstance(record, dict) else lambda key, default=None: getattr(record, key, default)
    return is_stockholm_municipality_place(
        getter("latitude"),
        getter("longitude"),
        area=getter("area", ""),
        address=getter("address", ""),
        source_url=getter("url", ""),
        name=getter("name", ""),
    )


def extract_stockholm_place_links(
    html_content: str,
    base_url: str = BASE_URL,
    crawl_subpages: bool = False,
    max_workers: int = 8,
) -> list[dict[str, str]]:
    """Extract list of Stockholm venue links from the city landing page and optionally its subpages."""
    links: list[dict[str, str]] = []
    seen_urls: set[str] = set()

    def parse_links_from_text(content: str) -> list[tuple[str, str]]:
        found = []
        # 1. JSON-LD ItemList
        json_blocks = extract_json_ld_blocks(content)
        for block in json_blocks:
            if block.get("@type") == "ItemList" and "itemListElement" in block:
                for item in block["itemListElement"]:
                    url = item.get("url")
                    name = item.get("name", "")
                    if url and "/plats/" in url:
                        full_url = urllib.parse.urljoin(base_url, url)
                        found.append((name, full_url))

        # 2. Regex search
        href_pattern = re.compile(r'href=[\'"](/plats/[a-zA-Z0-9_\-]+)[\'"]', re.IGNORECASE)
        for match in href_pattern.finditer(content):
            path = match.group(1)
            full_url = urllib.parse.urljoin(base_url, path)
            slug = path.replace("/plats/", "").replace("-", " ").title()
            found.append((slug, full_url))

        return found

    for name, full_url in parse_links_from_text(html_content):
        if full_url not in seen_urls:
            seen_urls.add(full_url)
            links.append({"name": name, "url": full_url})

    if crawl_subpages:
        sub_pattern = re.compile(r'href=[\'"](/stad/stockholm(?:/[a-zA-Z0-9_\-]+)?)[\'"]', re.IGNORECASE)
        sub_paths = sorted(set(sub_pattern.findall(html_content)))
        sub_urls = [urllib.parse.urljoin(base_url, p) for p in sub_paths if p != "/stad/stockholm"]

        def fetch_sub(sub_url: str) -> list[tuple[str, str]]:
            try:
                sub_html = fetch_url(sub_url)
                return parse_links_from_text(sub_html)
            except Exception:
                return []

        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            sub_results = executor.map(fetch_sub, sub_urls)
            for items in sub_results:
                for name, full_url in items:
                    if full_url not in seen_urls:
                        seen_urls.add(full_url)
                        links.append({"name": name, "url": full_url})

    return links


def map_category_to_kind(category_str: str) -> str:
    """Map Tasstipset category string to Motkarta establishment kind."""
    cat_lower = category_str.lower()
    if any(k in cat_lower for k in ["cafeorcoffeeshop", "caf", "kafe", "fika", "kafé", "coffee shop", "coffeeshop", "specialty coffee"]):
        return "Café"
    if any(k in cat_lower for k in ["bakery", "bageri", "konditori"]):
        return "Bakery"
    if any(k in cat_lower for k in ["restaurang", "restaurant", "bistro", "brasserie", "krog"]):
        return "Restaurant"
    if any(k in cat_lower for k in ["hotell", "hotel", "hostel", "vandrarhem", "lodgingbusiness"]):
        return "Hotell"
    if any(k in cat_lower for k in ["park", "strand"]):
        return "Park"
    return "Unknown"


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
        if any(
            k in btype.lower()
            for k in [
                "cafe",
                "restaurant",
                "bakery",
                "localbusiness",
                "foodestablishment",
                "store",
                "park",
                "hotel",
                "hostel",
                "lodgingbusiness",
            ]
        ):
            place_json = block
            json_ld_type = btype
            break

    # Extract Name & Description
    name = place_json.get("name")
    if not name:
        h1_m = re.search(r"<h1[^>]*>(.*?)</h1>", html_content, re.IGNORECASE | re.DOTALL)
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
        web_m = re.search(
            r'href=[\'"](https?://[^\'"]+)[\'"][^>]*>[^<]*Webbplats',
            html_content,
            re.IGNORECASE,
        )
        if web_m:
            website = web_m.group(1)

    # Address & Coordinates from JSON-LD or HTML
    addr_obj = place_json.get("address", {})
    street_address = addr_obj.get("streetAddress", "") if isinstance(addr_obj, dict) else ""
    if not street_address:
        header_m = re.search(r"<header[^>]*>(.*?)</header>", html_content, re.IGNORECASE | re.DOTALL)
        if header_m:
            p_matches = re.findall(r"<p[^>]*>(.*?)</p>", header_m.group(1), re.IGNORECASE | re.DOTALL)
            for p_text in p_matches:
                cleaned_p = clean_text_emojis(p_text)
                if any(c.isdigit() for c in cleaned_p) and any(
                    city in cleaned_p.lower() for city in ["stockholm"]
                ):
                    street_address = cleaned_p
                    break

    geo_obj = place_json.get("geo", {})
    latitude = (
        float(geo_obj["latitude"])
        if isinstance(geo_obj, dict) and "latitude" in geo_obj and geo_obj["latitude"]
        else None
    )
    longitude = (
        float(geo_obj["longitude"])
        if isinstance(geo_obj, dict) and "longitude" in geo_obj and geo_obj["longitude"]
        else None
    )

    # Category & Area
    category = "Unknown"
    if json_ld_type:
        category = json_ld_type

    area = ""
    dog_policy = "Hundar välkomna"
    dog_policy_quote = None
    is_venue_verified = False
    verification_date = None

    # Parse HTML details (Header badges, area, verified status)
    header_m = re.search(r"<header[^>]*>(.*?)</header>", html_content, re.IGNORECASE | re.DOTALL)
    if header_m:
        header_html = header_m.group(1)
        spans = re.findall(r"<span[^>]*>(.*?)</span>", header_html, re.IGNORECASE | re.DOTALL)
        for span in spans:
            cleaned_s = clean_text_emojis(span)
            s_lower = cleaned_s.lower()
            if any(k in s_lower for k in ["café", "restaurang", "bageri", "hotell", "hostel", "vandrarhem", "park", "bar", "vinbar"]):
                category = cleaned_s
            elif any(
                dist in s_lower
                for dist in [
                    "södermalm",
                    "vasastan",
                    "östermalm",
                    "gamla stan",
                    "kungsholmen",
                    "norrmalm",
                    "djurgården",
                    "hammarby sjöstad",
                    "enskede",
                    "bromma",
                    "liljeholmen",
                    "årsta",
                    "stadshagen",
                    "kristineberg",
                    "farsta",
                    "kista",
                    "vällingby",
                    "skärholmen",
                    "hägersten",
                    "älvsjö",
                    "spånga",
                    "akalla",
                    "husby",
                    "rinkeby",
                    "hagsätra",
                    "midsommarkransen",
                    "aspudden",
                    "lilla essingen",
                    "stora essingen",
                    "fredhäll",
                    "hägersten-älvsjö",
                ]
            ):
                area = cleaned_s.title()
            elif "verifierat av stället" in s_lower or "bekräftat" in s_lower:
                is_venue_verified = True
            elif "inne" in s_lower and "ute" in s_lower:
                dog_policy = "Hundar välkomna inne och ute"
            elif "endast ute" in s_lower or "uteservering" in s_lower:
                dog_policy = "Endast uteservering"

    # Extract Dog Policy Quote / Section
    policy_m = re.search(
        r"<h[23][^>]*>Hundpolicy</h[23]>\s*<p[^>]*>(.*?)</p>",
        html_content,
        re.IGNORECASE | re.DOTALL,
    )
    if policy_m:
        dog_policy_quote = clean_text_emojis(policy_m.group(1))

    # Determine tags
    tags = ["Dog friendly", "Hundvänligt", "Tasstipset"]
    if is_venue_verified:
        tags.append("Verifierad hundpolicy")
    if "inne" in dog_policy.lower() and "ute" in dog_policy.lower():
        tags.append("Hundar inne & ute")
    elif "uteservering" in dog_policy.lower():
        tags.append("Endast uteservering")

    kind = map_category_to_kind(category)

    return DogPlaceRecord(
        source_id=source_id,
        name=html.unescape(name).strip(),
        url=url,
        category=category,
        kind=kind,
        area=area,
        address=html.unescape(street_address).strip(),
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


def is_food_establishment(record: DogPlaceRecord) -> bool:
    """Check if record is a food/drink establishment (not a dog park, pet salon, or pure hotel)."""
    name_l = record.name.lower()
    cat_l = record.category.lower()
    if is_excluded_catalog_name(record.name):
        return False
    if map_category_to_kind(cat_l or record.kind) not in {"Café", "Bakery", "Restaurant"}:
        return False
    if "hundrastgård" in name_l or "rastgård" in name_l or "hundpark" in name_l:
        return False
    if "hunddagis" in name_l or "veterinär" in name_l or "djursjukhus" in name_l:
        return False
    if cat_l in ["park"]:
        return False
    return True


def scrape_tasstipset_stockholm(
    output_path: Path = DEFAULT_OUTPUT_PATH,
    limit: int | None = None,
    delay: float = 0.02,
    crawl_sitemap: bool = False,
    max_workers: int = 16,
    quiet: bool = False,
) -> list[dict[str, Any]]:
    """Scrape dog-friendly venues in Stockholm municipality from Tasstipset."""
    if not quiet:
        print("🐶 Initiating Tasstipset scraper for Stockholm municipality...")

    place_urls: list[str] = []

    # 1. Optional country-wide sitemap crawl, always post-filtered to Stockholm.
    if crawl_sitemap:
        try:
            if not quiet:
                print(f"📡 Fetching sitemap from: {SITEMAP_URL}")
            sitemap_xml = fetch_url(SITEMAP_URL, timeout=12)
            place_urls = extract_sitemap_place_urls(sitemap_xml)
            if not quiet:
                print(f"🗺️ Found {len(place_urls)} total venue URLs in sitemap.")
        except Exception as e:
            if not quiet:
                print(f"⚠️ Sitemap fetch failed ({e}), falling back to HTML directory crawl.")

    # 2. Fallback / supplement via directory crawl
    if not place_urls:
        stockholm_html = fetch_url(STOCKHOLM_URL)
        place_links = extract_stockholm_place_links(
            stockholm_html,
            crawl_subpages=True,
            max_workers=max_workers,
        )
        place_urls = [item["url"] for item in place_links]

    if limit and limit > 0:
        place_urls = place_urls[:limit]
        if not quiet:
            print(f"⚡ Limiting scrape to first {limit} places.")

    records: list[DogPlaceRecord] = []

    def fetch_and_filter(url: str) -> DogPlaceRecord | None:
        try:
            place_html = fetch_url(url, timeout=12)
            rec = parse_tasstipset_place_page(place_html, url)
            if is_in_stockholm_municipality(rec):
                return rec
        except Exception:
            pass
        return None

    if not quiet:
        print(f"🚀 Parsing and filtering Stockholm venues ({len(place_urls)} candidates)...")

    if max_workers > 1 and len(place_urls) > 2:
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            for rec in executor.map(fetch_and_filter, place_urls):
                if rec:
                    records.append(rec)
    else:
        for url in place_urls:
            rec = fetch_and_filter(url)
            if rec:
                records.append(rec)
            if delay > 0:
                time.sleep(delay)

    output_data = {
        "source": "https://tasstipset.se",
        "city": "Stockholm",
        "region": "Stockholm municipality",
        "total_places": len(records),
        "food_places_count": sum(1 for r in records if is_food_establishment(r)),
        "verified_places_count": sum(1 for r in records if r.is_venue_verified),
        "scraped_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "places": [asdict(r) for r in records],
    }

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(output_data, ensure_ascii=False, indent=2), encoding="utf-8")

    if not quiet:
        print(f"✨ Successfully saved {len(records)} Stockholm dog-friendly places to: {output_path}")

    return output_data["places"]


def norm_str(s: Any) -> str:
    """Normalize string for fuzzy matching."""
    return re.sub(r"[^a-z0-9åäö]+", "", str(s or "").lower())


def haversine_distance_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate distance in meters between two lat/lon points."""
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2
    )
    return 6371000 * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def enrich_tasstipset_places(places: list[dict[str, Any]], dog_places: list[dict[str, Any]]) -> dict[str, int]:
    """Match existing food venues; Tasstipset never creates or promotes a venue."""
    import difflib

    matched_ids = set()
    skipped_out_of_scope = 0
    skipped_unmatched = 0
    targets = [p for p in places if eligible_dog_friendly_target(p)]
    for record in dog_places:
        if is_excluded_catalog_name(record.get("name")):
            continue
        if not is_in_stockholm_municipality(record):
            skipped_out_of_scope += 1
            continue
        category = record.get("category") or record.get("kind", "")
        dummy = DogPlaceRecord(source_id="", name=record.get("name", ""), url="",
                              category=category, kind=map_category_to_kind(category),
                              area=record.get("area", ""), address=record.get("address", ""),
                              latitude=record.get("latitude"), longitude=record.get("longitude"))
        if not is_food_establishment(dummy):
            continue
        name = norm_str(record.get("name", ""))
        matches = []
        for target in targets:
            candidate_name = norm_str(target.get("name", ""))
            if not name or not candidate_name:
                continue
            exact = name == candidate_name
            if not exact and difflib.SequenceMatcher(None, name, candidate_name).ratio() < 0.9:
                continue
            coords = [record.get("latitude"), record.get("longitude"), target.get("latitude"), target.get("longitude")]
            if all(isinstance(c, (int, float)) for c in coords):
                if haversine_distance_m(*coords) > 200:
                    continue
            elif not exact:
                continue
            matches.append(target)
        if len(matches) != 1:
            skipped_unmatched += 1
            continue
        target = matches[0]
        add_dog_friendly_feature(target, record)
        matched_ids.add(target["id"])
    return {"matched": len(matched_ids), "added": 0, "skipped_out_of_scope": skipped_out_of_scope,
            "skipped_unmatched": skipped_unmatched, "total": len(places)}


def sync_tasstipset_to_places(
    dog_places: list[dict[str, Any]],
    places_path: Path = DEFAULT_PLACES_PATH,
    curated_path: Path = DEFAULT_CURATED_PATH,
    quiet: bool = False,
) -> dict[str, int]:
    """Enrich only dog-friendly features; curated_path is retained for CLI compatibility."""
    payload = json.loads(places_path.read_text(encoding="utf-8"))
    places = payload.get("places", []) if isinstance(payload, dict) else payload
    if not isinstance(places, list):
        raise ValueError("Invalid places payload format.")
    stats = enrich_tasstipset_places(places, dog_places)
    if isinstance(payload, dict):
        payload["totalPlaces"] = len(places)
    places_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    if not quiet:
        print(f"Tasstipset: {stats['matched']} existing venues enriched; {stats['skipped_unmatched']} unmatched records skipped.")
    return stats


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Scrape dog-friendly places in Stockholm from Tasstipset.se")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT_PATH, help="Output JSON path")
    parser.add_argument("--places-file", type=Path, default=DEFAULT_PLACES_PATH, help="Live places JSON path")
    parser.add_argument("--limit", type=int, default=None, help="Limit number of places to scrape")
    parser.add_argument("--delay", type=float, default=0.01, help="Delay in seconds between requests")
    parser.add_argument("--workers", type=int, default=16, help="Number of concurrent scraper workers")
    parser.add_argument("--crawl-sitemap", action="store_true", help="Opt into crawling the country-wide sitemap")
    parser.add_argument("--sync", action="store_true", help="Sync scraped dog places into places.json")
    parser.add_argument("--quiet", action="store_true", help="Suppress progress output")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    scraped_places = scrape_tasstipset_stockholm(
        output_path=args.output,
        limit=args.limit,
        delay=args.delay,
        crawl_sitemap=args.crawl_sitemap,
        max_workers=args.workers,
        quiet=args.quiet,
    )
    if args.sync:
        sync_tasstipset_to_places(scraped_places, places_path=args.places_file, quiet=args.quiet)


if __name__ == "__main__":
    main()
