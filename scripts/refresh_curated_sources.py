#!/usr/bin/env python3
"""Monthly curated open sources & verified guides refresher for Motkarta.

Probes all 16 curated open sources powering Motkarta, runs the unified coverage
audit (`scripts/verify_curated_sources.py`), detects upstream content changes
via ETag / Last-Modified / SHA-256 digest, and writes an operator- and UI-facing
freshness artifact to `public/data/curated_sources_status.json`.

Commercial ratings, review counts, and price levels are never imported.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
import urllib.error
import urllib.request
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from scripts.verify_curated_sources import PLACES_FILE, verify_all_curated_sources

DEFAULT_OUTPUT_FILE = ROOT / "public" / "data" / "curated_sources_status.json"
DEFAULT_TIMEOUT_SECONDS = 12
USER_AGENT = "MotkartaBot/1.0 (+https://motkarta.rynell.org; Stockholm open food map monthly audit)"


@dataclass(frozen=True)
class CuratedSourceSpec:
    id: str
    name: str
    url: str
    cadence: str
    mode: str  # "live-api" | "live-scraper" | "public-web" | "editorial-check"


CURATED_SOURCE_SPECS: tuple[CuratedSourceSpec, ...] = (
    CuratedSourceSpec(
        id="husa-guide",
        name="Anders Husa & Kaitlin Orr Guide",
        url="https://andershusa.com/city-guide/stockholm/",
        cadence="monthly",
        mode="public-web",
    ),
    CuratedSourceSpec(
        id="stockholm-stad",
        name="Stockholms Stad Livsmedelskontroll",
        url="https://miljo.stockholm.se",
        cadence="monthly",
        mode="live-api",
    ),
    CuratedSourceSpec(
        id="openstreetmap",
        name="OpenStreetMap Contributors",
        url="https://www.openstreetmap.org",
        cadence="monthly",
        mode="live-api",
    ),
    CuratedSourceSpec(
        id="white-guide",
        name="White Guide Nordic",
        url="https://whiteguide.com/se/sv",
        cadence="monthly",
        mode="public-web",
    ),
    CuratedSourceSpec(
        id="specialty-coffee-se",
        name="Specialty Coffee Sweden Registry",
        url="https://europeancoffeetrip.com/stockholm/",
        cadence="monthly",
        mode="public-web",
    ),
    CuratedSourceSpec(
        id="visit-stockholm",
        name="Visit Stockholm (Officiella Stadsguiden)",
        url="https://www.visitstockholm.com/eat-drink/",
        cadence="monthly",
        mode="public-web",
    ),
    CuratedSourceSpec(
        id="tasstipset",
        name="Tasstipset (Hundvänliga ställen)",
        url="https://tasstipset.se",
        cadence="monthly",
        mode="live-scraper",
    ),
    CuratedSourceSpec(
        id="spotted-by-locals",
        name="Spotted by Locals Stockholm",
        url="https://www.spottedbylocals.com/stockholm/",
        cadence="monthly",
        mode="public-web",
    ),
    CuratedSourceSpec(
        id="burgerdudes",
        name="Burgerdudes",
        url="https://www.burgerdudes.se/sweden/stockholm/",
        cadence="monthly",
        mode="public-web",
    ),
    CuratedSourceSpec(
        id="michelin-guide",
        name="Guide Michelin Nordic",
        url="https://guide.michelin.com/se/sv/stockholm-region/stockholm/restaurants",
        cadence="monthly",
        mode="public-web",
    ),
    CuratedSourceSpec(
        id="dn-krog",
        name="Dagens Nyheter (Krogkommissionen & DN På Stan)",
        url="https://www.dn.se/om/krogkommissionen/",
        cadence="monthly",
        mode="editorial-check",
    ),
    CuratedSourceSpec(
        id="svd-krogguiden",
        name="Svenska Dagbladet (SvD Krogguiden)",
        url="https://www.svd.se/av/krog",
        cadence="monthly",
        mode="editorial-check",
    ),
    CuratedSourceSpec(
        id="allt-om-mat",
        name="Allt om Mat (Krogrecensioner & Bästa Krogarna)",
        url="https://alltommat.expressen.se/restaurang/",
        cadence="monthly",
        mode="editorial-check",
    ),
    CuratedSourceSpec(
        id="vagabond",
        name="Vagabond Resemagasin (Stockholmsguiden)",
        url="https://www.vagabond.se/sverige/stockholm/",
        cadence="monthly",
        mode="editorial-check",
    ),
    CuratedSourceSpec(
        id="stora-restaurangpriset",
        name="Stora Restaurangpriset / Svenska Gastronomipriset",
        url="https://restaurangpriset.se",
        cadence="monthly",
        mode="editorial-check",
    ),
    CuratedSourceSpec(
        id="sveriges-basta",
        name="Sveriges Bästa (Bord, Barer & Krogtoppen)",
        url="https://sverigesbasta.com",
        cadence="monthly",
        mode="editorial-check",
    ),
)

# Map verify_curated_sources.py report IDs -> canonical UI/D1 curated_sources IDs
VERIFY_ID_MAP: dict[str, str] = {
    "husa-guide": "husa-guide",
    "stockholm-stad": "stockholm-stad",
    "openstreetmap": "openstreetmap",
    "white-guide": "white-guide",
    "specialty-coffee-se": "specialty-coffee-se",
    "visit-stockholm": "visit-stockholm",
    "tasstipset": "tasstipset",
    "spotted-by-locals": "spotted-by-locals",
    "burgerdudes": "burgerdudes",
    "michelin": "michelin-guide",
    "michelin-guide": "michelin-guide",
    "dn-krog": "dn-krog",
    "svd-krog": "svd-krogguiden",
    "svd-krogguiden": "svd-krogguiden",
    "allt-om-mat": "allt-om-mat",
    "vagabond": "vagabond",
    "stora-restaurangpriset": "stora-restaurangpriset",
    "sveriges-basta": "sveriges-basta",
}


def iso_now() -> str:
    return datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def probe_source_url(url: str, timeout: int = DEFAULT_TIMEOUT_SECONDS) -> dict[str, Any]:
    """Politely probe a curated source URL without failing the overall pipeline."""
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": USER_AGENT,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "sv-SE,sv;q=0.9,en;q=0.8",
        },
        method="GET",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            status_code = int(getattr(resp, "status", 200) or 200)
            body = resp.read(256 * 1024)
            digest = hashlib.sha256(body).hexdigest()[:16] if body else None
            return {
                "reachable": 200 <= status_code < 400,
                "httpStatus": status_code,
                "etag": resp.headers.get("ETag"),
                "lastModified": resp.headers.get("Last-Modified"),
                "contentHash": digest,
                "error": None,
            }
    except urllib.error.HTTPError as exc:
        return {
            "reachable": False,
            "httpStatus": int(exc.code),
            "etag": None,
            "lastModified": None,
            "contentHash": None,
            "error": f"HTTP {exc.code}",
        }
    except Exception as exc:  # noqa: BLE001
        return {
            "reachable": False,
            "httpStatus": None,
            "etag": None,
            "lastModified": None,
            "contentHash": None,
            "error": str(exc)[:180],
        }


def load_previous_status(output_file: Path) -> dict[str, dict[str, Any]]:
    if not output_file.exists():
        return {}
    try:
        payload = json.loads(output_file.read_text(encoding="utf-8"))
        entries = payload.get("sources", [])
        if isinstance(entries, list):
            return {str(item["id"]): item for item in entries if isinstance(item, dict) and item.get("id")}
    except Exception:  # noqa: BLE001
        return {}
    return {}


def refresh_curated_sources(
    places_file: Path = PLACES_FILE,
    output_file: Path = DEFAULT_OUTPUT_FILE,
    offline: bool = False,
    timeout: int = DEFAULT_TIMEOUT_SECONDS,
    probe_fn: Any = probe_source_url,
    quiet: bool = False,
) -> dict[str, Any]:
    checked_at = iso_now()
    previous_by_id = load_previous_status(output_file)
    audit = verify_all_curated_sources(places_file=places_file, quiet=True)

    coverage_by_id: dict[str, dict[str, Any]] = {}
    for entry in audit.get("sources", []):
        mapped_id = VERIFY_ID_MAP.get(str(entry.get("id", "")), str(entry.get("id", "")))
        if mapped_id:
            coverage_by_id[mapped_id] = entry

    results: list[dict[str, Any]] = []
    for spec in CURATED_SOURCE_SPECS:
        prev = previous_by_id.get(spec.id, {})
        cov = coverage_by_id.get(spec.id, {})

        if offline:
            probe = {
                "reachable": prev.get("reachable"),
                "httpStatus": prev.get("httpStatus"),
                "etag": prev.get("etag"),
                "lastModified": prev.get("lastModified"),
                "contentHash": prev.get("contentHash"),
                "error": None,
            }
            changed = False
        else:
            probe = probe_fn(spec.url, timeout=timeout)
            prev_hash = prev.get("contentHash")
            new_hash = probe.get("contentHash")
            changed = bool(prev_hash and new_hash and prev_hash != new_hash)

        scraped_points = cov.get("source_data_points")
        matched_places = cov.get("matched_places")
        coverage_pct = cov.get("coverage_pct")
        audit_status = cov.get("status", "UNKNOWN")

        results.append(
            {
                "id": spec.id,
                "name": spec.name,
                "url": spec.url,
                "cadence": spec.cadence,
                "mode": spec.mode,
                "lastScrapedAt": checked_at,
                "lastCheckedAt": checked_at,
                "reachable": probe["reachable"],
                "httpStatus": probe["httpStatus"],
                "etag": probe["etag"],
                "lastModified": probe["lastModified"],
                "contentHash": probe["contentHash"],
                "changedSincePrevious": changed,
                "error": probe["error"],
                "scrapedPoints": scraped_points,
                "verifiedCount": matched_places,
                "importedCount": matched_places,
                "coveragePercent": coverage_pct,
                "status": audit_status,
            }
        )

    report = {
        "version": "1.0",
        "schedule": "0 4 1 * *",
        "cadence": "monthly",
        "generatedAt": checked_at,
        "offline": offline,
        "totalSources": len(results),
        "passingSources": sum(1 for item in results if item["status"] == "PASS"),
        "reachableSources": sum(1 for item in results if item["reachable"] is True),
        "changedSources": sum(1 for item in results if item["changedSincePrevious"] is True),
        "sources": results,
    }

    output_file.parent.mkdir(parents=True, exist_ok=True)
    output_file.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    if not quiet:
        print(
            f"Refreshed {report['totalSources']} curated sources "
            f"({report['passingSources']}/{report['totalSources']} PASS, "
            f"{report['reachableSources']} reachable, {report['changedSources']} changed) "
            f"-> {output_file}"
        )

    return report


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Monthly curated open sources & verified guides refresher")
    parser.add_argument("--places-file", type=Path, default=PLACES_FILE, help="Path to public/data/places.json")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT_FILE, help="Output status JSON path")
    parser.add_argument("--offline", action="store_true", help="Skip live HTTP probes and audit local coverage only")
    parser.add_argument("--timeout", type=int, default=DEFAULT_TIMEOUT_SECONDS, help="HTTP probe timeout in seconds")
    parser.add_argument("--quiet", action="store_true", help="Suppress progress output")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    refresh_curated_sources(
        places_file=args.places_file,
        output_file=args.output,
        offline=args.offline,
        timeout=args.timeout,
        quiet=args.quiet,
    )


if __name__ == "__main__":
    main()
