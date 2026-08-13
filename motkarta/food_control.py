from __future__ import annotations

import hashlib
import json
from collections import defaultdict
from datetime import UTC, datetime
from pathlib import Path

import pandas as pd
import requests

from motkarta.pipeline import clean_text, normalize_json_value
from motkarta.source_matching import SourceRecord


FOOD_CONTROL_LAYER_URL = (
    "https://services-eu1.arcgis.com/81H0sgjoIWj6WxIM/ArcGIS/rest/services/"
    "Livsmedelstillsyn/FeatureServer/41"
)
FOOD_CONTROL_METADATA_URL = (
    "https://dataportalen.stockholm.se/dataportalen/GetMetaDataById"
    "?id=003c9649-91fd-4ae0-9958-a335c6b77b13"
)
FOOD_CONTROL_SOURCE_NAME = "Stockholms stad livsmedelskontroll"


def load_or_fetch_food_control(
    cache_path: str | Path,
    metadata_path: str | Path,
    refresh: bool = False,
    layer_url: str = FOOD_CONTROL_LAYER_URL,
    where: str = "1=1",
    max_pages: int | None = None,
    page_size: int = 2000,
) -> dict:
    cache = Path(cache_path)
    metadata = Path(metadata_path)
    if cache.exists() and not refresh:
        print(f"Using cached food-control response from {cache}")
        return json.loads(cache.read_text(encoding="utf-8"))

    payload = fetch_arcgis_features(layer_url, where=where, page_size=page_size, max_pages=max_pages)
    cache.parent.mkdir(parents=True, exist_ok=True)
    cache.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    metadata.parent.mkdir(parents=True, exist_ok=True)
    metadata.write_text(
        json.dumps(
            {
                "source": FOOD_CONTROL_SOURCE_NAME,
                "source_url": layer_url,
                "metadata_url": FOOD_CONTROL_METADATA_URL,
                "license": "Creative Commons CC0 1.0 according to Stockholm data portal metadata.",
                "where": where,
                "query_hash": hashlib.sha256(f"{layer_url}:{where}".encode("utf-8")).hexdigest(),
                "fetched_at": datetime.now(UTC).isoformat(),
                "cache_path": str(cache),
                "feature_count": len(payload.get("features", [])),
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    print(f"Cached food-control response to {cache}")
    print(f"Wrote source metadata to {metadata}")
    return payload


def fetch_arcgis_features(
    layer_url: str,
    where: str = "1=1",
    page_size: int = 2000,
    max_pages: int | None = None,
) -> dict:
    features = []
    fields = None
    offset = 0
    while True:
        response = requests.get(
            f"{layer_url}/query",
            params={
                "f": "json",
                "where": where,
                "outFields": "*",
                "returnGeometry": "true",
                "outSR": 4326,
                "resultOffset": offset,
                "resultRecordCount": page_size,
            },
            timeout=120,
        )
        response.raise_for_status()
        payload = response.json()
        if "error" in payload:
            raise RuntimeError(payload["error"])
        fields = fields or payload.get("fields")
        page = payload.get("features", [])
        features.extend(page)
        if max_pages is not None and (offset // page_size) + 1 >= max_pages:
            break
        if len(page) < page_size:
            break
        offset += page_size
    return {"fields": fields or [], "features": features}


def normalize_food_control_features(payload: dict) -> pd.DataFrame:
    grouped: dict[str, list[dict]] = defaultdict(list)
    for feature in payload.get("features", []):
        attributes = feature.get("attributes", {})
        source_id = clean_text(attributes.get("ObjektId"))
        if not source_id:
            continue
        grouped[source_id].append(feature)

    rows = []
    for source_id, features in grouped.items():
        latest = max(features, key=lambda feature: clean_text(feature.get("attributes", {}).get("TillsynsDatum")))
        attributes = latest.get("attributes", {})
        geometry = latest.get("geometry") or {}
        rows.append(
            {
                "source_id": source_id,
                "name": clean_text(attributes.get("AnlaggningsNamn")),
                "address": clean_text(attributes.get("Adress")),
                "facility_type": clean_text(attributes.get("AnlaggningsTyp")),
                "business_type": clean_text(attributes.get("VerksamhetsTyp")),
                "risk_class": normalize_json_value(attributes.get("Riskklass")),
                "latest_inspection_date": clean_text(attributes.get("TillsynsDatum")),
                "latest_remark": clean_text(attributes.get("Anmarkning")),
                "inspection_count": len(features),
                "latitude": geometry.get("y"),
                "longitude": geometry.get("x"),
                "source": FOOD_CONTROL_SOURCE_NAME,
            }
        )
    return pd.DataFrame(rows).sort_values(["name", "address"]).reset_index(drop=True)


def food_control_records(frame: pd.DataFrame) -> list[SourceRecord]:
    records = []
    for _, row in frame.iterrows():
        records.append(
            SourceRecord(
                source_id=str(row["source_id"]),
                name=clean_text(row["name"]),
                address=clean_text(row["address"]),
                latitude=optional_float(row["latitude"]),
                longitude=optional_float(row["longitude"]),
                source_name=FOOD_CONTROL_SOURCE_NAME,
                source_url=FOOD_CONTROL_METADATA_URL,
                captured_at=clean_text(row.get("latest_inspection_date", "")),
                summary=food_control_summary(row),
            )
        )
    return records


def food_control_summary(row: pd.Series) -> str:
    parts = ["Registered food-control establishment"]
    if clean_text(row.get("latest_inspection_date", "")):
        parts.append(f"latest inspection {row['latest_inspection_date']}")
    if clean_text(row.get("latest_remark", "")):
        parts.append(f"latest remark: {row['latest_remark']}")
    return "; ".join(parts) + "."


def optional_float(value: object) -> float | None:
    text = clean_text(value)
    if not text:
        return None
    return float(text)
