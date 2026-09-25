"""Fetch a Stockholm food-place baseline from OpenStreetMap via Overpass.

OpenStreetMap (OSM) is the map data; Overpass is the public query API that
returns OSM elements matching a filter. This script queries Overpass in small
chunks (category × map tile × 500-element pages) to avoid overloading public
mirrors, caches the merged JSON response, and writes a normalized CSV baseline.

Run locally: python scripts/fetch_osm.py
Output: data/stockholm_food_places.csv
"""
import argparse
import csv
import hashlib
import json
import sys
import time
from datetime import UTC, datetime
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from motkarta.normalize import normalize_osm_establishment_type

URLS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
]
RETRYABLE_STATUS_CODES = {429, 502, 503, 504}
ATTEMPTS_PER_URL = 3
INITIAL_BACKOFF_SECONDS = 15.0
MAX_BACKOFF_SECONDS = 120.0
PAGE_SIZE = 500
CHUNK_PAUSE_SECONDS = 1.0
GRID_ROWS = 3
GRID_COLS = 3
BBOX = "59.20,17.75,59.47,18.25"
FILTER_SLICES: list[tuple[str, str]] = [
    ("amenity", "restaurant"),
    ("amenity", "cafe"),
    ("amenity", "fast_food"),
    ("amenity", "food_court"),
    ("amenity", "bar"),
    ("amenity", "pub"),
    ("shop", "bakery"),
    ("shop", "pastry"),
    ("shop", "confectionery"),
    ("shop", "coffee"),
    ("craft", "coffee_roaster"),
]
FIELDS = [
    "osm_type",
    "osm_id",
    "name",
    "category",
    "establishment_type",
    "cuisine",
    "opening_hours",
    "internet_access",
    "internet_access_fee",
    "street",
    "house_number",
    "website",
    "latitude",
    "longitude",
    "osm_timestamp",
    "source",
]


def is_retryable_overpass_error(error: requests.RequestException) -> bool:
    if isinstance(error, (requests.Timeout, requests.ConnectionError)):
        return True
    response = getattr(error, "response", None)
    return response is not None and response.status_code in RETRYABLE_STATUS_CODES


def fetch_overpass(
    query: str,
    urls: list[str],
    *,
    attempts_per_url: int = ATTEMPTS_PER_URL,
    initial_backoff_seconds: float = INITIAL_BACKOFF_SECONDS,
    max_backoff_seconds: float = MAX_BACKOFF_SECONDS,
) -> tuple[dict, str]:
    headers = {
        "User-Agent": "motkarta/0.1 (Stockholm independent food map; local research)",
        "Accept": "application/json",
    }
    errors: list[str] = []
    for url in urls:
        for attempt in range(attempts_per_url):
            try:
                response = requests.post(url, data={"data": query}, headers=headers, timeout=240)
                response.raise_for_status()
                return response.json(), url
            except requests.RequestException as error:
                body = getattr(error.response, "text", "") if getattr(error, "response", None) is not None else ""
                message = f"{url}: {error} {body[:500]}"
                if attempt < attempts_per_url - 1 and is_retryable_overpass_error(error):
                    backoff = min(max_backoff_seconds, initial_backoff_seconds * (2 ** attempt))
                    print(
                        f"Overpass attempt {attempt + 1}/{attempts_per_url} failed for {url}; "
                        f"retrying in {backoff:.0f}s"
                    )
                    time.sleep(backoff)
                    continue
                errors.append(message)
                break
    raise RuntimeError("Overpass request failed:\n" + "\n".join(errors))


def parse_bbox(bbox: str) -> tuple[float, float, float, float]:
    south, west, north, east = (float(part) for part in bbox.split(","))
    return south, west, north, east


def bbox_tiles(bbox: str, rows: int, cols: int) -> list[str]:
    south, west, north, east = parse_bbox(bbox)
    lat_step = (north - south) / rows
    lon_step = (east - west) / cols
    tiles: list[str] = []
    for row in range(rows):
        for col in range(cols):
            tile_south = south + row * lat_step
            tile_north = south + (row + 1) * lat_step
            tile_west = west + col * lon_step
            tile_east = west + (col + 1) * lon_step
            tiles.append(f"{tile_south:.6f},{tile_west:.6f},{tile_north:.6f},{tile_east:.6f}")
    return tiles


def build_chunk_query(
    tag_key: str,
    tag_value: str,
    tile_bbox: str,
    boundary: str,
    page_size: int,
    min_id: int = 0,
) -> str:
    id_filter = f"(if:id() > {min_id})" if min_id > 0 else ""
    if boundary == "municipality":
        area_setup = 'area["boundary"="administrative"]["name"="Stockholms kommun"]->.searchArea;'
        scope = f"(area.searchArea)({tile_bbox})"
    else:
        area_setup = ""
        scope = f"({tile_bbox})"
    return f"""[out:json][timeout:90];
{area_setup}
(
 nwr["{tag_key}"="{tag_value}"]{scope}{id_filter};
);
out center meta {page_size};"""


def fetch_strategy_hash(boundary: str, page_size: int, rows: int, cols: int) -> str:
    payload = {
        "boundary": boundary,
        "page_size": page_size,
        "grid_rows": rows,
        "grid_cols": cols,
        "filter_slices": FILTER_SLICES,
        "bbox": BBOX,
    }
    return hashlib.sha256(json.dumps(payload, sort_keys=True).encode("utf-8")).hexdigest()


def merge_elements(existing: dict[tuple[str, int], dict], batch: list[dict]) -> None:
    for element in batch:
        existing[(element["type"], element["id"])] = element


def fetch_chunked_overpass(
    urls: list[str],
    boundary: str,
    *,
    page_size: int = PAGE_SIZE,
    rows: int = GRID_ROWS,
    cols: int = GRID_COLS,
    pause_seconds: float = CHUNK_PAUSE_SECONDS,
) -> tuple[dict, list[str], int]:
    elements: dict[tuple[str, int], dict] = {}
    endpoints: list[str] = []
    request_count = 0
    tiles = bbox_tiles(BBOX, rows, cols)

    for tag_key, tag_value in FILTER_SLICES:
        for tile_bbox in tiles:
            min_id = 0
            while True:
                query = build_chunk_query(tag_key, tag_value, tile_bbox, boundary, page_size, min_id)
                payload, endpoint = fetch_overpass(query, urls)
                request_count += 1
                endpoints.append(endpoint)
                batch = payload.get("elements", [])
                merge_elements(elements, batch)
                print(
                    f"Fetched {len(batch)} {tag_key}={tag_value} elements "
                    f"(tile {tile_bbox}, min_id={min_id}, total={len(elements)})"
                )
                if len(batch) < page_size:
                    break
                min_id = max(element["id"] for element in batch)
                time.sleep(pause_seconds)
            time.sleep(pause_seconds)

    return {"elements": list(elements.values())}, endpoints, request_count


def load_cached_payload(cache_path: Path) -> dict:
    return json.loads(cache_path.read_text(encoding="utf-8"))


def write_source_metadata(
    metadata_path: Path,
    *,
    endpoint: str | list[str] | None,
    boundary: str,
    query_hash: str,
    cache_path: Path,
    element_count: int,
    chunk_requests: int | None = None,
    page_size: int | None = None,
    stale_fallback: bool = False,
    stale_fallback_reason: str | None = None,
) -> None:
    metadata = {
        "source": "OpenStreetMap Overpass API",
        "source_url": endpoint,
        "license": "OpenStreetMap data is available under the Open Database License (ODbL).",
        "boundary": boundary,
        "boundary_reference": "OSM administrative area named Stockholms kommun" if boundary == "municipality" else f"Approximate bbox {BBOX}",
        "query_hash": query_hash,
        "fetched_at": datetime.now(UTC).isoformat(),
        "cache_path": str(cache_path),
        "element_count": element_count,
        "fetch_mode": "chunked",
    }
    if page_size is not None:
        metadata["page_size"] = page_size
    if chunk_requests is not None:
        metadata["chunk_requests"] = chunk_requests
    if stale_fallback:
        metadata["stale_fallback"] = True
        metadata["stale_fallback_at"] = metadata["fetched_at"]
        metadata["stale_fallback_reason"] = stale_fallback_reason
    metadata_path.parent.mkdir(parents=True, exist_ok=True)
    metadata_path.write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def load_or_fetch_payload(
    urls: list[str],
    cache_path: Path,
    metadata_path: Path,
    refresh: bool,
    boundary: str,
    page_size: int = PAGE_SIZE,
    grid_rows: int = GRID_ROWS,
    grid_cols: int = GRID_COLS,
) -> dict:
    query_hash = fetch_strategy_hash(boundary, page_size, grid_rows, grid_cols)
    if cache_path.exists() and not refresh:
        print(f"Using cached Overpass response from {cache_path}")
        return load_cached_payload(cache_path)

    try:
        payload, endpoints, chunk_requests = fetch_chunked_overpass(
            urls,
            boundary,
            page_size=page_size,
            rows=grid_rows,
            cols=grid_cols,
        )
    except RuntimeError as error:
        if cache_path.exists():
            payload = load_cached_payload(cache_path)
            reason_lines = [line for line in str(error).splitlines() if line.strip()]
            reason = reason_lines[1] if len(reason_lines) > 1 else reason_lines[0]
            print(
                f"WARNING: Overpass fetch failed; using stale cache from {cache_path}. "
                f"Reason: {reason}"
            )
            write_source_metadata(
                metadata_path,
                endpoint=None,
                boundary=boundary,
                query_hash=query_hash,
                cache_path=cache_path,
                element_count=len(payload.get("elements", [])),
                page_size=page_size,
                stale_fallback=True,
                stale_fallback_reason=reason,
            )
            print(f"Wrote stale-fallback metadata to {metadata_path}")
            return payload
        raise

    cache_path.parent.mkdir(parents=True, exist_ok=True)
    cache_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    write_source_metadata(
        metadata_path,
        endpoint=endpoints,
        boundary=boundary,
        query_hash=query_hash,
        cache_path=cache_path,
        element_count=len(payload.get("elements", [])),
        chunk_requests=chunk_requests,
        page_size=page_size,
    )
    print(f"Cached Overpass response to {cache_path}")
    print(f"Wrote source metadata to {metadata_path}")
    return payload


def rows_from_payload(payload: dict) -> list[dict]:
    rows = []
    for element in payload["elements"]:
        tags = element.get("tags", {})
        center = element.get("center", element)
        if not tags.get("name") or center.get("lat") is None:
            continue
        category = tags.get("amenity") or tags.get("shop") or tags.get("craft")
        establishment_type = normalize_osm_establishment_type(category or "", tags.get("cuisine", ""), name=tags["name"])
        if not establishment_type:
            continue
        rows.append({
            "osm_type": element["type"], "osm_id": element["id"],
            "name": tags["name"],
            "category": category,
            "establishment_type": establishment_type,
            "cuisine": tags.get("cuisine", ""), "opening_hours": tags.get("opening_hours", ""),
            "street": tags.get("addr:street", ""), "house_number": tags.get("addr:housenumber", ""),
            "internet_access": tags.get("internet_access", ""),
            "internet_access_fee": tags.get("internet_access:fee", ""),
            "website": tags.get("contact:website") or tags.get("website", ""), "latitude": center["lat"], "longitude": center["lon"],
            "osm_timestamp": element.get("timestamp", ""),
            "source": "OpenStreetMap",
        })
    return rows


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", default=str(Path(__file__).parents[1] / "data" / "stockholm_food_places.csv"))
    parser.add_argument("--cache", default=str(Path(__file__).parents[1] / "data" / "raw" / "osm_stockholm_food_places.json"))
    parser.add_argument("--metadata", default=str(Path(__file__).parents[1] / "data" / "raw" / "osm_stockholm_food_places.metadata.json"))
    parser.add_argument("--refresh", action="store_true", help="Fetch from Overpass even when a cache file exists.")
    parser.add_argument("--boundary", choices=["municipality", "bbox"], default="municipality")
    parser.add_argument("--page-size", type=int, default=PAGE_SIZE, help="Max elements per Overpass request.")
    parser.add_argument("--grid-rows", type=int, default=GRID_ROWS, help="Latitude splits for chunked bbox queries.")
    parser.add_argument("--grid-cols", type=int, default=GRID_COLS, help="Longitude splits for chunked bbox queries.")
    parser.add_argument("--url", action="append", dest="urls", help="Override Overpass endpoint. Repeat for fallbacks.")
    args = parser.parse_args()

    payload = load_or_fetch_payload(
        urls=args.urls or URLS,
        cache_path=Path(args.cache),
        metadata_path=Path(args.metadata),
        refresh=args.refresh,
        boundary=args.boundary,
        page_size=args.page_size,
        grid_rows=args.grid_rows,
        grid_cols=args.grid_cols,
    )
    rows = rows_from_payload(payload)
    target = Path(args.output)
    target.parent.mkdir(exist_ok=True)
    with target.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=FIELDS)
        writer.writeheader()
        writer.writerows(rows)
    print(f"Saved {len(rows)} places to {target}")

if __name__ == "__main__":
    main()
