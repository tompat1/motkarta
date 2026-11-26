#!/usr/bin/env python3
"""Polite scraper & ground-truth merger for Thatsup Stockholm editorial guides.

Usage:
  python3 scripts/scrape_thatsup_guide.py \
    --url https://thatsup.se/stockholm/guide/guiden-till-stockholms-basta-olbarer \
    --category "Thatsup Ölbar & Pub" \
    --tags "Pub,Beer,Craft Beer,Ölbar" \
    --fetch-details

Supports offline parsing via --html-file for deterministic tests and local runs.
Strictly obeys robots.txt and excludes commercial chains via motkarta.catalog_exclusions.
Thatsup entries are treated as discovery leads (never inflating independent quality scores)
and record whether Thatsup marks an entry as a featured partner (`place_is_featured`).
"""

from __future__ import annotations

import argparse
import html as html_lib
import json
import re
import sys
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
import urllib.robotparser
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from motkarta.catalog_exclusions import is_excluded_catalog_name  # noqa: E402

USER_AGENT = "MotkartaBot/1.0 (+https://motkarta.rynell.org)"
DEFAULT_GUIDE_URL = "https://thatsup.se/stockholm/guide/guiden-till-stockholms-basta-olbarer"
DEFAULT_OUTPUT = ROOT / "data" / "thatsup_ground_truth.json"

AREA_NORMALIZATION: dict[str, str] = {
    "södermalm": "Södermalm",
    "vasastan": "Vasastan",
    "östermalm": "Östermalm",
    "norrmalm": "Norrmalm",
    "city": "Norrmalm",
    "kungsholmen": "Kungsholmen",
    "gamla stan": "Gamla Stan",
    "djurgården": "Djurgården",
    "hammarby sjöstad": "Söderort",
    "frihamnen": "Östermalm",
    "gärdet": "Östermalm",
    "hökarängen": "Söderort",
    "johanneshov": "Söderort",
    "slakthusområdet": "Söderort",
    "årsta": "Söderort",
    "hägersten-liljeholmen": "Söderort",
    "liljeholmen": "Söderort",
    "sundbyberg": "Västerort",
    "solna": "Norrort",
    "nacka": "Söderort",
    "hornstull": "Södermalm",
    "mariatorget": "Södermalm",
    "medborgarplatsen": "Södermalm",
    "sofo": "Södermalm",
    "odenplan": "Vasastan",
    "st eriksplan": "Vasastan",
    "sankt eriksplan": "Vasastan",
}


CUISINE_KEYWORD_MAP: dict[str, str] = {
    "italiensk": "italian",
    "fransk": "french",
    "spansk": "spanish",
    "tapas": "tapas",
    "japansk": "japanese",
    "sushi": "sushi",
    "ramen": "ramen",
    "kinesisk": "chinese",
    "koreansk": "korean",
    "vietnamesisk": "vietnamese",
    "thailändsk": "thai",
    "indisk": "indian",
    "mexikansk": "mexican",
    "tacos": "mexican",
    "grekisk": "greek",
    "mellanöstern": "middle eastern",
    "libanesisk": "lebanese",
    "svensk": "swedish",
    "husmanskost": "husman",
    "nordisk": "scandinavian",
    "skandinavisk": "scandinavian",
    "bistro": "bistro",
    "pizza": "pizza",
    "burgare": "burger",
    "hamburgare": "burger",
    "fisk": "seafood",
    "skaldjur": "seafood",
    "grill": "grill",
    "bbq": "grill",
    "amerikansk": "american",
    "asiatisk": "asian",
    "tysk": "german",
    "belgisk": "belgian",
    "polsk": "polish",
    "brittisk": "pub",
    "pubmat": "pub",
}


def normalize_name(value: str) -> str:
    text = unicodedata.normalize("NFKD", str(value or "").lower())
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    return re.sub(r"[^a-z0-9]+", "", text)


def normalize_stockholm_area(raw_area: str) -> str:
    cleaned = str(raw_area or "").strip()
    if not cleaned:
        return "Stockholm"
    lower = cleaned.lower()
    if lower in AREA_NORMALIZATION:
        return AREA_NORMALIZATION[lower]
    for key, canonical in AREA_NORMALIZATION.items():
        if key in lower:
            return canonical
    return cleaned


def _strip_html(fragment: str) -> str:
    text = re.sub(r"<[^>]+>", " ", fragment)
    text = html_lib.unescape(text)
    return re.sub(r"\s+", " ", text).strip()


def fetch_url(url: str, timeout: int = 20) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read().decode("utf-8", errors="replace")


def check_robots_allowed(url: str, user_agent: str = USER_AGENT) -> bool:
    parsed = urllib.parse.urlparse(url)
    robots_url = f"{parsed.scheme}://{parsed.netloc}/robots.txt"
    try:
        raw = fetch_url(robots_url, timeout=10)
    except Exception:
        return False
    # Strip trailing whitespace on each line (Thatsup's robots.txt has trailing spaces after User-Agent: *)
    lines = [line.strip() for line in raw.splitlines()]
    rp = urllib.robotparser.RobotFileParser()
    rp.set_url(robots_url)
    rp.parse(lines)
    return rp.can_fetch(user_agent, url)


def parse_guide_html(
    raw_html: str,
    guide_url: str,
    category: str = "Thatsup Ölbar & Pub",
    extra_tags: list[str] | None = None,
) -> list[dict[str, Any]]:
    """Extract venue leads from a Thatsup Stockholm guide HTML document."""
    tags = [t.strip() for t in (extra_tags or []) if t.strip()]
    parts = raw_html.split('class="article-list__element__title')
    venues: list[dict[str, Any]] = []
    seen_norms: set[str] = set()

    for chunk in parts[1:]:
        block = chunk[:8000]

        # Extract official website referral if present
        m_web = re.search(
            r'href="(https?://[^"]+)"[^>]*class="[^"]*referral-page', block
        ) or re.search(
            r'href="(https?://[^"]+)"[^>]*data-track="[^"]*Website referrals', block
        )
        website = html_lib.unescape(m_web.group(1)).strip() if m_web else ""

        # Extract Thatsup partner/featured flag (used strictly for transparency & scoring exclusion)
        m_feat = re.search(r"place_is_featured(?:&quot;|\"):(\d)", block)
        is_featured = bool(int(m_feat.group(1))) if m_feat else False

        # Extract first editorial paragraph
        m_p = re.search(r"<p[^>]*>(.*?)</p>", block, re.S)
        excerpt = _strip_html(m_p.group(1)) if m_p else ""
        if len(excerpt) > 260:
            excerpt = excerpt[:257].rstrip() + "..."

        # Multi-location drawer modal (e.g. "Omnipollos hatt & Omnipollos Kyrka")
        drawer_items = re.findall(
            r'<drawer-modal-nav-item[^>]*href="([^"]+)"[^>]*title="([^"]+)"',
            block,
            re.S,
        )

        extracted_pairs: list[tuple[str, str]] = []
        if drawer_items:
            for item_url, item_name in drawer_items:
                extracted_pairs.append((html_lib.unescape(item_name).strip(), item_url.strip()))
        else:
            m_title = re.search(
                r'<h3[^>]*>.*?<a[^>]+href="([^"]+)"[^>]*>(.*?)</a>', block, re.S
            )
            if m_title:
                extracted_pairs.append(
                    (_strip_html(m_title.group(2)), m_title.group(1).strip())
                )
            else:
                m_h3 = re.search(r"<h3[^>]*>(.*?)</h3>", block, re.S)
                if m_h3:
                    name_only = _strip_html(m_h3.group(1))
                    if name_only:
                        extracted_pairs.append((name_only, guide_url))

        for name, place_url in extracted_pairs:
            if not name or is_excluded_catalog_name(name):
                continue
            key = normalize_name(name)
            if not key or key in seen_norms:
                continue
            seen_norms.add(key)

            entry: dict[str, Any] = {
                "name": name,
                "area": "Stockholm",
                "category": category,
                "url": guide_url,
                "thatsupPlaceUrl": place_url,
                "isFeaturedPartner": is_featured,
                "tags": list(tags),
            }
            if website:
                entry["website"] = website
            if excerpt:
                entry["editorialExcerpt"] = excerpt
            venues.append(entry)

    return venues


def parse_place_page_html(raw_html: str) -> dict[str, Any]:
    """Extract address, neighborhood, coordinates, and priceRange from a Thatsup place page."""
    details: dict[str, Any] = {}

    for m in re.finditer(
        r'<script[^>]+type="application/ld\+json"[^>]*>(.*?)</script>', raw_html, re.S
    ):
        try:
            payload = json.loads(m.group(1))
        except json.JSONDecodeError:
            continue

        if isinstance(payload, dict) and "@graph" in payload:
            for node in payload["@graph"]:
                if not isinstance(node, dict):
                    continue
                addr = node.get("address")
                if isinstance(addr, dict) and addr.get("streetAddress"):
                    street = str(addr.get("streetAddress", "")).strip()
                    locality = str(addr.get("addressLocality", "Stockholm")).strip()
                    details["streetAddress"] = street
                    details["address"] = f"{street}, {locality}" if locality else street
                geo = node.get("geo")
                if isinstance(geo, dict) and geo.get("latitude") and geo.get("longitude"):
                    details["latitude"] = float(geo["latitude"])
                    details["longitude"] = float(geo["longitude"])
                if node.get("priceRange"):
                    details["priceRange"] = str(node["priceRange"]).strip()

        if isinstance(payload, dict) and payload.get("@type") == "BreadcrumbList":
            items = payload.get("itemListElement") or []
            if len(items) >= 2 and isinstance(items[1], dict):
                item_obj = items[1].get("item") or {}
                raw_area = item_obj.get("name")
                if raw_area and str(raw_area).lower() != "stockholm":
                    details["area"] = normalize_stockholm_area(str(raw_area))

        if isinstance(payload, dict) and payload.get("@type") == "FAQPage":
            inferred_tags: list[str] = list(details.get("inferredTags") or [])
            for qa in payload.get("mainEntity") or []:
                if not isinstance(qa, dict):
                    continue
                q_name = str(qa.get("name") or "").lower()
                ans_text = str((qa.get("acceptedAnswer") or {}).get("text") or "").lower()
                if "vilken typ av bar" in q_name or "bar" in q_name:
                    if any(w in ans_text for w in ("cocktailbar", "drinkbar", "hotellbar", "takbar", "skybar", "ginbar", "speakeasy", "loungebar")):
                        for t in ("Bar", "Cocktail bar", "Cocktails"):
                            if t not in inferred_tags:
                                inferred_tags.append(t)
                    if any(w in ans_text for w in ("vinbar", "naturvin", "champagnebar")):
                        for t in ("Bar", "Wine bar", "Vinbar"):
                            if t not in inferred_tags:
                                inferred_tags.append(t)
                    if any(w in ans_text for w in ("ölbar", "pub", "gastropub", "ölhall", "bryggeri")):
                        for t in ("Pub", "Beer", "Craft Beer", "Ölbar"):
                            if t not in inferred_tags:
                                inferred_tags.append(t)
                if "vilken typ av mat" in q_name or "mat serveras" in q_name:
                    inferred_cuisines: list[str] = list(details.get("inferredCuisines") or [])
                    for kw, canonical in CUISINE_KEYWORD_MAP.items():
                        if kw in ans_text and canonical not in inferred_cuisines:
                            inferred_cuisines.append(canonical)
                    if inferred_cuisines:
                        details["inferredCuisines"] = inferred_cuisines
            if inferred_tags:
                details["inferredTags"] = inferred_tags

    # Fallback coordinate extraction from embedded map/place JSON
    if "latitude" not in details or "longitude" not in details:
        m_geo = re.search(
            r'"latitude"\s*:\s*(59\.\d+)\s*,\s*"longitude"\s*:\s*(1[78]\.\d+)',
            raw_html,
        )
        if m_geo:
            details["latitude"] = float(m_geo.group(1))
            details["longitude"] = float(m_geo.group(2))

    # Refine address with normalized area if available
    if details.get("streetAddress") and details.get("area") and details["area"] != "Stockholm":
        details["address"] = f"{details['streetAddress']}, {details['area']}"

    return details


def merge_ground_truth(
    existing: list[dict[str, Any]],
    scraped: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Merge newly scraped venues into existing ground truth without losing prior entries."""
    merged: list[dict[str, Any]] = [dict(item) for item in existing]
    by_norm: dict[str, int] = {
        normalize_name(item.get("name", "")): idx for idx, item in enumerate(merged)
    }

    for entry in scraped:
        key = normalize_name(entry.get("name", ""))
        if not key or is_excluded_catalog_name(entry.get("name", "")):
            continue
        if key in by_norm:
            target = merged[by_norm[key]]
            for field in (
                "thatsupPlaceUrl",
                "website",
                "address",
                "cuisine",
                "latitude",
                "longitude",
                "priceRange",
                "editorialExcerpt",
                "isFeaturedPartner",
            ):
                if entry.get(field) not in (None, ""):
                    target[field] = entry[field]
            if entry.get("area") and entry["area"] != "Stockholm":
                target["area"] = entry["area"]
            if entry.get("url"):
                target["url"] = entry["url"]
            if entry.get("category"):
                target["category"] = entry["category"]
            existing_tags = list(target.get("tags") or [])
            for tag in entry.get("tags") or []:
                if tag not in existing_tags:
                    existing_tags.append(tag)
            if existing_tags:
                target["tags"] = existing_tags
        else:
            by_norm[key] = len(merged)
            merged.append(entry)

    return merged


def main() -> int:
    parser = argparse.ArgumentParser(description="Scrape a Thatsup Stockholm guide into ground truth JSON.")
    parser.add_argument("--url", default=DEFAULT_GUIDE_URL, help="Thatsup Stockholm guide URL")
    parser.add_argument("--html-file", type=Path, help="Optional local HTML snapshot instead of live fetch")
    parser.add_argument("--category", default="Thatsup Ölbar & Pub", help="Category label for SourceFact")
    parser.add_argument("--tags", default="Pub,Beer,Craft Beer,Ölbar", help="Comma-separated tags to attach")
    parser.add_argument("--fetch-details", action="store_true", help="Politely fetch each place page for address/geo")
    parser.add_argument("--delay", type=float, default=0.35, help="Delay between detail requests in seconds")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT, help="Output ground truth JSON path")
    args = parser.parse_args()

    extra_tags = [t.strip() for t in args.tags.split(",") if t.strip()]

    if args.html_file:
        raw_html = args.html_file.read_text(encoding="utf-8")
    else:
        if not check_robots_allowed(args.url):
            print(f"ERROR: robots.txt disallows fetching {args.url}", file=sys.stderr)
            return 2
        raw_html = fetch_url(args.url)

    scraped = parse_guide_html(raw_html, args.url, category=args.category, extra_tags=extra_tags)
    print(f"Parsed {len(scraped)} venues from {args.url}")

    if args.fetch_details:
        for idx, entry in enumerate(scraped, 1):
            place_url = entry.get("thatsupPlaceUrl", "")
            if not place_url or not place_url.startswith("https://thatsup.se/"):
                continue
            try:
                place_html = fetch_url(place_url, timeout=15)
                details = parse_place_page_html(place_html)
                for k, v in details.items():
                    if k == "inferredTags" and isinstance(v, list):
                        cur_tags = list(entry.get("tags") or [])
                        for t in v:
                            if t not in cur_tags:
                                cur_tags.append(t)
                        entry["tags"] = cur_tags
                    elif k == "inferredCuisines" and isinstance(v, list):
                        entry["cuisine"] = ";".join(v)
                    elif k != "streetAddress" and v not in (None, ""):
                        entry[k] = v
                print(
                    f"  [{idx:2d}/{len(scraped)}] {entry['name']} -> "
                    f"{entry.get('area', '?')} | {entry.get('address', '?')} | "
                    f"geo=({entry.get('latitude')}, {entry.get('longitude')})"
                )
            except (urllib.error.URLError, TimeoutError, ValueError) as exc:
                print(f"  [{idx:2d}/{len(scraped)}] WARN {entry['name']}: {exc}", file=sys.stderr)
            if args.delay > 0:
                time.sleep(args.delay)

    existing: list[dict[str, Any]] = []
    if args.output.exists():
        existing = json.loads(args.output.read_text(encoding="utf-8"))

    merged = merge_ground_truth(existing, scraped)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(merged, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(
        f"Saved {len(merged)} total Thatsup venues to {args.output} "
        f"(updated {datetime.now(UTC).strftime('%Y-%m-%dT%H:%M:%SZ')})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
