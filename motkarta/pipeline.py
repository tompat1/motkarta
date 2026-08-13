from __future__ import annotations

import json
import re
import zlib
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from difflib import SequenceMatcher
from pathlib import Path

import pandas as pd

from motkarta.normalize import ESTABLISHMENT_TYPES, normalize_osm_establishment_type


RAW_COLUMNS = [
    "osm_type",
    "osm_id",
    "name",
    "category",
    "establishment_type",
    "cuisine",
    "opening_hours",
    "street",
    "house_number",
    "address",
    "website",
    "latitude",
    "longitude",
    "osm_timestamp",
    "source",
]

DISCOVERY_WEIGHTS = {
    "independent_business": 25,
    "underrepresented_cuisine": 20,
    "low_local_visibility": 20,
    "verified_open": 15,
    "complete_profile": 10,
    "recently_updated": 10,
}
EXCLUDED_CHAIN_BRANDS = {"McDonald's", "Burger King", "Sibylla", "MAX"}


@dataclass(frozen=True)
class CoverageReport:
    total_places: int
    by_type: dict[str, int]
    missing_address: int
    missing_opening_hours: int
    missing_website: int
    duplicate_candidates_removed: int
    excluded_chains_removed: int = 0
    coverage_by_cuisine: dict[str, int] | None = None
    missing_cuisine: int = 0
    missing_hours_ratio: float = 0.0
    missing_website_ratio: float = 0.0
    missing_cuisine_ratio: float = 0.0
    district_density: dict[str, dict[str, float | int]] | None = None
    district_cuisine_diversity: dict[str, int] | None = None
    stale_osm_count: int = 0
    stale_osm_ratio: float = 0.0
    inner_vs_outer: dict[str, dict[str, float | int]] | None = None
    municipal_records_count: int | None = None
    matched_records_count: int | None = None
    municipal_only_count: int | None = None
    source_overlap_ratio: float | None = None

    def markdown(self) -> str:
        lines = [
            "# Motkarta Coverage Report",
            "",
            f"Total establishments: {self.total_places}",
            "",
            "## By Type",
            "",
            *[f"- {name}: {count}" for name, count in sorted(self.by_type.items())],
        ]

        if self.district_density:
            lines.extend([
                "",
                "## Restaurant Density by District",
                "",
                *[
                    f"- **{dist}**: {stats['count']} establishments ({stats['percentage']:.1%})"
                    for dist, stats in sorted(self.district_density.items(), key=lambda x: x[1]['count'], reverse=True)
                ],
            ])

        if self.district_cuisine_diversity:
            lines.extend([
                "",
                "## Cuisine Diversity by District",
                "",
                *[
                    f"- **{dist}**: {count} unique cuisines"
                    for dist, count in sorted(self.district_cuisine_diversity.items(), key=lambda x: x[1], reverse=True)
                ],
            ])

        if self.inner_vs_outer:
            inner = self.inner_vs_outer.get("inner_city", {})
            outer = self.inner_vs_outer.get("outer_city", {})
            lines.extend([
                "",
                "## Inner-City vs. Outer-City Coverage",
                "",
                f"- **Inner City (Central Stockholm)**: {inner.get('count', 0)} establishments | Missing website: {inner.get('missing_website_ratio', 0.0):.1%} | Missing hours: {inner.get('missing_hours_ratio', 0.0):.1%} | Missing cuisine: {inner.get('missing_cuisine_ratio', 0.0):.1%} | Unique cuisines: {inner.get('cuisine_diversity', 0)}",
                f"- **Outer City (North/East/South)**: {outer.get('count', 0)} establishments | Missing website: {outer.get('missing_website_ratio', 0.0):.1%} | Missing hours: {outer.get('missing_hours_ratio', 0.0):.1%} | Missing cuisine: {outer.get('missing_cuisine_ratio', 0.0):.1%} | Unique cuisines: {outer.get('cuisine_diversity', 0)}",
            ])

        if self.municipal_records_count is not None and self.matched_records_count is not None:
            municipal_only_pct = (self.municipal_only_count or 0) / (self.municipal_records_count or 1)
            lines.extend([
                "",
                "## Data-Source Overlap & Municipal Register",
                "",
                f"- Municipal food-control records: {self.municipal_records_count}",
                f"- Matched records in OSM: {self.matched_records_count}",
                f"- Municipal records missing from OSM: {self.municipal_only_count or 0} ({municipal_only_pct:.1%})",
                f"- Municipal register overlap rate: {self.source_overlap_ratio or 0.0:.1%}",
            ])

        lines.extend([
            "",
            "## Data Freshness",
            "",
            f"- Not updated recently (>180 days or missing timestamp): {self.stale_osm_count} ({self.stale_osm_ratio:.1%})",
        ])

        if self.coverage_by_cuisine:
            lines.extend([
                "",
                "## Coverage by Cuisine",
                "",
                *[f"- {cuisine}: {count}" for cuisine, count in self.coverage_by_cuisine.items()],
            ])

        lines.extend([
            "",
            "## Data Gaps & Representation",
            "",
            f"- Missing address: {self.missing_address}",
            f"- Missing opening hours: {self.missing_opening_hours} ({self.missing_hours_ratio:.1%})",
            f"- Missing cuisine: {self.missing_cuisine} ({self.missing_cuisine_ratio:.1%})",
            f"- Missing website: {self.missing_website} ({self.missing_website_ratio:.1%})",
            f"- Duplicate candidates removed: {self.duplicate_candidates_removed}",
            f"- Excluded chains removed: {self.excluded_chains_removed}",
        ])
        return "\n".join(lines) + "\n"


def load_raw_csv(path: str | Path) -> pd.DataFrame:
    return pd.read_csv(path, dtype=str).fillna("")


def clean_places(frame: pd.DataFrame) -> pd.DataFrame:
    data = frame.copy()
    for column in RAW_COLUMNS:
        if column not in data:
            data[column] = ""
    data["name"] = data["name"].map(clean_text)
    data["category"] = data["category"].map(clean_text)
    data["cuisine"] = data["cuisine"].map(normalize_cuisine)
    data["opening_hours"] = data["opening_hours"].map(clean_text)
    data["street"] = data["street"].map(clean_text)
    data["house_number"] = data["house_number"].map(clean_text)
    data["address"] = data.apply(normalize_address, axis=1)
    data["website"] = data["website"].map(normalize_website)
    data["latitude"] = pd.to_numeric(data["latitude"], errors="coerce")
    data["longitude"] = pd.to_numeric(data["longitude"], errors="coerce")
    data["establishment_type"] = data.apply(normalize_establishment_type_row, axis=1)
    data["neighbourhood"] = data.apply(assign_neighbourhood, axis=1)
    data["missing_address"] = data["address"].eq("")
    data["missing_opening_hours"] = data["opening_hours"].eq("")
    data["missing_website"] = data["website"].eq("")
    data["chain_brand"] = data["name"].map(known_chain_brand)
    data["excluded_chain"] = data["chain_brand"].isin(EXCLUDED_CHAIN_BRANDS)
    return data


def dedupe_places(frame: pd.DataFrame, threshold: float = 0.92) -> tuple[pd.DataFrame, pd.DataFrame]:
    data = frame.copy().reset_index(drop=True)
    kept: list[int] = []
    duplicate_rows: list[dict] = []
    kept_by_osm_id: dict[tuple[str, str], int] = {}
    kept_by_candidate_key: dict[tuple, list[int]] = {}

    for index, row in data.iterrows():
        osm_key = (str(row["osm_type"]), str(row["osm_id"]))
        duplicate_of = kept_by_osm_id.get(osm_key) if all(osm_key) else None

        candidate_indexes: set[int] = set()
        if duplicate_of is None:
            for key in dedupe_candidate_keys(row):
                candidate_indexes.update(kept_by_candidate_key.get(key, []))

        if duplicate_of is None:
            for kept_index in candidate_indexes:
                candidate = data.loc[kept_index]
                if is_duplicate(row, candidate, threshold):
                    duplicate_of = kept_index
                    break

        if duplicate_of is None:
            kept.append(index)
            if all(osm_key):
                kept_by_osm_id[osm_key] = index
            for key in dedupe_candidate_keys(row):
                kept_by_candidate_key.setdefault(key, []).append(index)
        else:
            candidate = data.loc[duplicate_of]
            duplicate_rows.append(
                {
                    "duplicate_index": index,
                    "duplicate_name": row["name"],
                    "kept_index": duplicate_of,
                    "kept_name": candidate["name"],
                }
            )

    return data.loc[kept].reset_index(drop=True), pd.DataFrame(duplicate_rows)


def filter_excluded_chains(frame: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    data = frame.copy()
    if "excluded_chain" not in data:
        data["chain_brand"] = data["name"].map(known_chain_brand)
        data["excluded_chain"] = data["chain_brand"].isin(EXCLUDED_CHAIN_BRANDS)

    excluded = data[data["excluded_chain"]].copy().reset_index(drop=True)
    included = data[~data["excluded_chain"]].copy().reset_index(drop=True)
    return included, excluded


def compute_local_popularity_percentiles(frame: pd.DataFrame) -> pd.Series:
    """Compare establishments within peer groups (neighbourhood x establishment_type).

    Prevents a local bakery in Farsta / South Stockholm from competing directly
    with a large restaurant at Stureplan / Central Stockholm.
    """
    data = frame.copy()
    if "popularity_raw" in data:
        series = data["popularity_raw"]
    elif "review_count" in data:
        series = data["review_count"]
    else:
        series = pd.Series(0, index=data.index)

    raw_pop = pd.to_numeric(series, errors="coerce").fillna(0)
    data["__popularity_temp"] = raw_pop
    grouped = data.groupby(["neighbourhood", "establishment_type"])["__popularity_temp"]
    return grouped.rank(pct=True, method="dense").round(4)


def score_places(frame: pd.DataFrame) -> pd.DataFrame:
    data = frame.copy()
    data["primary_cuisine"] = data["cuisine"].map(primary_cuisine)
    cuisine_district_counts = data.groupby(["neighbourhood", "primary_cuisine"]).size().to_dict()
    district_counts = data["neighbourhood"].value_counts().to_dict()

    data["independent_business"] = data["chain_brand"].eq("") if "chain_brand" in data else True
    data["underrepresented_cuisine"] = data.apply(
        lambda row: is_underrepresented_cuisine(row, cuisine_district_counts, district_counts),
        axis=1,
    )
    data["local_popularity"] = compute_local_popularity_percentiles(data)
    data["low_local_visibility"] = data["missing_website"]
    data["verified_open"] = ~data["missing_opening_hours"]
    data["complete_profile"] = (
        ~data["missing_address"]
        & ~data["missing_opening_hours"]
        & ~data["missing_website"]
        & data[["latitude", "longitude"]].notna().all(axis=1)
    )
    data["recently_updated"] = data["osm_timestamp"].map(recently_updated)
    data["discovery_score"] = data.apply(discovery_score, axis=1)
    data["discovery_reasons"] = data.apply(discovery_reasons, axis=1)
    return data


def build_coverage_report(
    frame: pd.DataFrame,
    duplicate_count: int = 0,
    excluded_chain_count: int = 0,
    municipal_records_count: int | None = None,
    matched_records_count: int | None = None,
) -> CoverageReport:
    total = len(frame)

    if "cuisine" in frame:
        cuisine_series = frame["cuisine"].replace("", pd.NA)
        coverage_by_cuisine = (
            frame[frame["cuisine"].replace("", pd.NA).notna()]
            .groupby("cuisine")
            .size()
            .sort_values(ascending=False)
            .to_dict()
        )
        missing_cuisine_count = int(cuisine_series.isna().sum())
        missing_cuisine_ratio = float(cuisine_series.isna().mean()) if total > 0 else 0.0
    else:
        coverage_by_cuisine = {}
        missing_cuisine_count = total
        missing_cuisine_ratio = 1.0 if total > 0 else 0.0

    if "opening_hours" in frame:
        hours_series = frame["opening_hours"].replace("", pd.NA)
        missing_hours_count = int(hours_series.isna().sum())
        missing_hours_ratio = float(hours_series.isna().mean()) if total > 0 else 0.0
    elif "missing_opening_hours" in frame:
        missing_hours_count = int(frame["missing_opening_hours"].sum())
        missing_hours_ratio = float(missing_hours_count / total) if total > 0 else 0.0
    else:
        missing_hours_count = 0
        missing_hours_ratio = 0.0

    missing_address_count = int(frame["missing_address"].sum()) if "missing_address" in frame else 0
    missing_website_count = int(frame["missing_website"].sum()) if "missing_website" in frame else (int(frame["website"].replace("", pd.NA).isna().sum()) if "website" in frame else 0)
    missing_website_ratio = float(missing_website_count / total) if total > 0 else 0.0

    district_density = None
    district_cuisine_diversity = None
    if "neighbourhood" in frame:
        district_counts = frame["neighbourhood"].value_counts().to_dict()
        district_density = {
            str(dist): {
                "count": int(count),
                "percentage": float(count / total) if total > 0 else 0.0,
            }
            for dist, count in district_counts.items()
        }
        if "cuisine" in frame:
            valid_cuisine_frame = frame[frame["cuisine"].replace("", pd.NA).notna()]
            district_cuisine_diversity = {
                str(dist): int(count)
                for dist, count in valid_cuisine_frame.groupby("neighbourhood")["cuisine"].nunique().to_dict().items()
            }

    inner_vs_outer = None
    if "neighbourhood" in frame:
        is_inner = frame["neighbourhood"].eq("Central Stockholm")
        inner_frame = frame[is_inner]
        outer_frame = frame[~is_inner]

        def get_sub_stats(sub: pd.DataFrame) -> dict[str, float | int]:
            sub_total = len(sub)
            if sub_total == 0:
                return {"count": 0, "missing_website_ratio": 0.0, "missing_hours_ratio": 0.0, "missing_cuisine_ratio": 0.0, "cuisine_diversity": 0}
            sub_web = sub["missing_website"].sum() if "missing_website" in sub else (sub["website"].replace("", pd.NA).isna().sum() if "website" in sub else 0)
            sub_hrs = sub["missing_opening_hours"].sum() if "missing_opening_hours" in sub else (sub["opening_hours"].replace("", pd.NA).isna().sum() if "opening_hours" in sub else 0)
            sub_cui = sub["cuisine"].replace("", pd.NA).isna().sum() if "cuisine" in sub else 0
            sub_div = sub[sub["cuisine"].replace("", pd.NA).notna()]["cuisine"].nunique() if "cuisine" in sub else 0
            return {
                "count": int(sub_total),
                "missing_website_ratio": float(sub_web / sub_total),
                "missing_hours_ratio": float(sub_hrs / sub_total),
                "missing_cuisine_ratio": float(sub_cui / sub_total),
                "cuisine_diversity": int(sub_div),
            }

        inner_vs_outer = {
            "inner_city": get_sub_stats(inner_frame),
            "outer_city": get_sub_stats(outer_frame),
        }

    if "recently_updated" in frame:
        stale_count = int((~frame["recently_updated"]).sum())
        stale_ratio = float(stale_count / total) if total > 0 else 0.0
    elif "osm_timestamp" in frame:
        recently_flags = frame["osm_timestamp"].map(recently_updated)
        stale_count = int((~recently_flags).sum())
        stale_ratio = float(stale_count / total) if total > 0 else 0.0
    else:
        stale_count = 0
        stale_ratio = 0.0

    municipal_only_count = None
    source_overlap_ratio = None
    if municipal_records_count is not None and matched_records_count is not None:
        municipal_only_count = max(0, municipal_records_count - matched_records_count)
        source_overlap_ratio = float(matched_records_count / municipal_records_count) if municipal_records_count > 0 else 0.0

    return CoverageReport(
        total_places=total,
        by_type={str(key): int(value) for key, value in frame["establishment_type"].value_counts().to_dict().items()} if "establishment_type" in frame else {},
        coverage_by_cuisine={str(k): int(v) for k, v in coverage_by_cuisine.items()},
        missing_address=missing_address_count,
        missing_opening_hours=missing_hours_count,
        missing_website=missing_website_count,
        missing_cuisine=missing_cuisine_count,
        missing_hours_ratio=missing_hours_ratio,
        missing_website_ratio=missing_website_ratio,
        missing_cuisine_ratio=missing_cuisine_ratio,
        district_density=district_density,
        district_cuisine_diversity=district_cuisine_diversity,
        stale_osm_count=stale_count,
        stale_osm_ratio=stale_ratio,
        inner_vs_outer=inner_vs_outer,
        municipal_records_count=municipal_records_count,
        matched_records_count=matched_records_count,
        municipal_only_count=municipal_only_count,
        source_overlap_ratio=source_overlap_ratio,
        duplicate_candidates_removed=duplicate_count,
        excluded_chains_removed=excluded_chain_count,
    )


def write_rag_corpus(frame: pd.DataFrame, path: str | Path) -> None:
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    with target.open("w", encoding="utf-8") as handle:
        for _, row in frame.iterrows():
            document = {
                "id": f"osm:{row['osm_type']}:{row['osm_id']}",
                "title": row["name"],
                "text": "\n".join(
                    [
                        f"Name: {row['name']}",
                        f"Type: {row['establishment_type']}",
                        f"Neighbourhood: {row['neighbourhood']}",
                        f"Cuisine: {row['cuisine']}",
                        f"Address: {row['address'] or 'Missing'}",
                        f"Opening hours: {row['opening_hours'] or 'Missing'}",
                        f"Website: {row['website'] or 'Missing'}",
                        f"Discovery score: {row['discovery_score']}",
                        f"Discovery reasons: {row['discovery_reasons'] or 'No discovery signals yet'}",
                    ]
                ),
                "metadata": {
                    "osm_type": row["osm_type"],
                    "osm_id": row["osm_id"],
                    "establishment_type": row["establishment_type"],
                    "neighbourhood": row["neighbourhood"],
                    "discovery_score": float(row["discovery_score"]),
                    "discovery_reasons": row["discovery_reasons"],
                },
            }
            handle.write(json.dumps(document, ensure_ascii=False) + "\n")


def write_geojson(frame: pd.DataFrame, path: str | Path) -> None:
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    features = []
    for _, row in frame.dropna(subset=["latitude", "longitude"]).iterrows():
        properties = {
            key: normalize_json_value(value)
            for key, value in row.to_dict().items()
            if key not in {"latitude", "longitude"}
        }
        features.append(
            {
                "type": "Feature",
                "geometry": {
                    "type": "Point",
                    "coordinates": [float(row["longitude"]), float(row["latitude"])],
                },
                "properties": properties,
            }
        )
    target.write_text(
        json.dumps({"type": "FeatureCollection", "features": features}, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def write_place_inputs_json(frame: pd.DataFrame, path: str | Path) -> None:
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    places = [place_input_from_row(row) for _, row in frame.iterrows()]
    target.write_text(json.dumps({"source": "osm", "places": places}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def clean_text(value: object) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def normalize_cuisine(value: object) -> str:
    parts = [
        clean_text(part).lower().replace("_", " ")
        for part in str(value or "").replace(",", ";").split(";")
        if clean_text(part)
    ]
    return ";".join(dict.fromkeys(parts))


def primary_cuisine(value: object) -> str:
    parts = [part.strip() for part in clean_text(value).split(";") if part.strip()]
    return parts[0] if parts else ""


def recently_updated(value: object, max_age_days: int = 180) -> bool:
    text = clean_text(value)
    if not text:
        return False
    try:
        timestamp = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        return False
    if timestamp.tzinfo is None:
        timestamp = timestamp.replace(tzinfo=UTC)
    age = datetime.now(UTC) - timestamp.astimezone(UTC)
    return 0 <= age.days <= max_age_days


def discovery_score(row: pd.Series) -> int:
    return sum(weight for signal, weight in DISCOVERY_WEIGHTS.items() if bool(row.get(signal)))


def discovery_reasons(row: pd.Series) -> str:
    labels = {
        "independent_business": "it appears independent",
        "underrepresented_cuisine": (
            f"it represents an underrepresented cuisine in {clean_text(row.get('neighbourhood'))}: "
            f"{clean_text(row.get('primary_cuisine'))}"
        ),
        "low_local_visibility": "it has lower local visibility",
        "verified_open": "opening hours are listed",
        "complete_profile": "address, opening hours, website and coordinates are present",
        "recently_updated": "it was verified recently",
    }
    return "; ".join(label for signal, label in labels.items() if bool(row.get(signal)))


def is_underrepresented_cuisine(
    row: pd.Series,
    cuisine_district_counts: dict[tuple[str, str], int],
    district_counts: dict[str, int],
) -> bool:
    cuisine = clean_text(row.get("primary_cuisine"))
    district = clean_text(row.get("neighbourhood"))
    if not cuisine or not district:
        return False
    district_total = district_counts.get(district, 0)
    threshold = max(3, round(district_total * 0.03))
    return cuisine_district_counts.get((district, cuisine), 0) <= threshold


def normalize_establishment_type_row(row: pd.Series) -> str:
    existing = clean_text(row["establishment_type"])
    if existing == "Bistro":
        return "Restaurant"
    if existing in ESTABLISHMENT_TYPES:
        return existing
    return normalize_osm_establishment_type(row["category"], row["cuisine"]) or "Restaurant"


def normalize_address(row: pd.Series) -> str:
    existing = clean_text(row.get("address", ""))
    if existing:
        return existing
    return " ".join(part for part in [clean_text(row.get("street", "")), clean_text(row.get("house_number", ""))] if part)


def normalize_website(value: object) -> str:
    website = clean_text(value)
    if not website:
        return ""
    if website.startswith(("http://", "https://")):
        return website
    return f"https://{website}"


def assign_neighbourhood(row: pd.Series) -> str:
    lat = row.get("latitude")
    lon = row.get("longitude")
    if pd.isna(lat) or pd.isna(lon):
        return "Unknown"
    if lat >= 59.35:
        return "North Stockholm"
    if lon >= 18.1:
        return "East Stockholm"
    if lat <= 59.29:
        return "South Stockholm"
    return "Central Stockholm"


def is_duplicate(row: pd.Series, candidate: pd.Series, threshold: float) -> bool:
    if row["osm_type"] == candidate["osm_type"] and row["osm_id"] == candidate["osm_id"]:
        return True
    if pd.notna(row["latitude"]) and pd.notna(candidate["latitude"]) and pd.notna(row["longitude"]) and pd.notna(candidate["longitude"]):
        near = abs(row["latitude"] - candidate["latitude"]) < 0.0008 and abs(row["longitude"] - candidate["longitude"]) < 0.0008
    else:
        near = False
    similar_name = SequenceMatcher(None, row["name"].lower(), candidate["name"].lower()).ratio() >= threshold
    same_address = bool(row["address"] and row["address"] == candidate["address"])
    return similar_name and (near or same_address)


def dedupe_candidate_keys(row: pd.Series) -> list[tuple]:
    keys: list[tuple] = []
    name = name_key(row["name"])
    address = clean_text(row.get("address", "")).lower()
    if address:
        keys.append(("address", address))

    lat = row.get("latitude")
    lon = row.get("longitude")
    if pd.notna(lat) and pd.notna(lon) and name:
        lat_cell, lon_cell = coordinate_cell(float(lat), float(lon))
        prefix = name[:10]
        for lat_delta in (-1, 0, 1):
            for lon_delta in (-1, 0, 1):
                keys.append(("geo", prefix, lat_cell + lat_delta, lon_cell + lon_delta))

    if not keys and name:
        keys.append(("name", name[:12]))
    return keys


def name_key(value: object) -> str:
    return re.sub(r"[^a-z0-9]+", "", clean_text(value).lower())


def name_tokens(value: object) -> list[str]:
    return [token for token in re.sub(r"[^a-z0-9]+", " ", clean_text(value).lower()).split() if token]


def known_chain_brand(name: object) -> str:
    tokens = name_tokens(name)
    if not tokens:
        return ""
    if tokens[0] in {"mcdonalds", "mcdonald"}:
        return "McDonald's"
    if tokens[:2] == ["burger", "king"]:
        return "Burger King"
    if tokens[0] == "sibylla":
        return "Sibylla"
    if tokens[0] == "max":
        return "MAX"
    if tokens[:2] == ["espresso", "house"]:
        return "Espresso House"
    if tokens[0] == "subway":
        return "Subway"
    if tokens[:2] == ["pizza", "hut"]:
        return "Pizza Hut"
    if tokens[0] == "starbucks":
        return "Starbucks"
    if tokens[:2] == ["holy", "greens"]:
        return "Holy Greens"
    if tokens[:2] == ["texas", "longhorn"]:
        return "Texas Longhorn"
    if tokens[:2] == ["bastard", "burgers"]:
        return "Bastard Burgers"
    if tokens[:2] == ["joe", "juice"] or tokens[:4] == ["joe", "and", "the", "juice"]:
        return "Joe & The Juice"
    if tokens[:2] == ["waynes", "coffee"]:
        return "Wayne's Coffee"
    return ""


def coordinate_cell(lat: float, lon: float) -> tuple[int, int]:
    return int(lat * 1000), int(lon * 1000)


def place_input_from_row(row: pd.Series) -> dict:
    completeness = (
        int(not row["missing_address"])
        + int(not row["missing_opening_hours"])
        + int(not row["missing_website"])
    ) / 3
    establishment_type = clean_text(row["establishment_type"])
    cuisine = clean_text(row["cuisine"])
    discovery_score = float(row["discovery_score"])

    place = {
        "id": stable_numeric_id(row),
        "name": clean_text(row["name"]),
        "kind": establishment_type,
        "cuisine": cuisine,
        "area": clean_text(row["neighbourhood"]) or "Stockholm",
        "note": place_note(row),
        "tags": place_tags(row),
        "discoveryReasons": discovery_reason_list(row),
        "discoverySignals": {
            signal: bool(row.get(signal))
            for signal in DISCOVERY_WEIGHTS
        },
        "sourceName": clean_text(row.get("source")) or "OpenStreetMap",
        "lastUpdated": clean_text(row.get("osm_timestamp")),
        "evidenceLabel": "OpenStreetMap baseline · needs enrichment",
        "ratingAverage": 4.1,
        "reliableRatingCount": 0,
        "reviewCount": 0,
        "categoryMeanRating": 4.1,
        "categoryPopularityRaw": 0,
        "localPopularityPercentile": 0.5,
        "priceLevel": 2,
        "mainstreamExposure": round(max(0, 28 - discovery_score * 0.18), 2),
        "ageDays": 0,
        "daysSinceFreshEvidence": 0,
        "evidence": {
            "specialistGuide": 0,
            "independentEditorial": 0,
            "verifiedUserRating": 0,
            "repeatVisits": 0,
            "recentReviews": 0,
            "credibleReviewers": 0,
            "inspectionStatus": 45,
            "verifiedAttributes": round(completeness * 70, 2),
            "dataFreshness": 75,
            "confidence": "Low",
        },
        "engagement": {
            "searchImpressions": 0,
            "profileViews": 0,
            "mapMarkerClicks": 0,
            "saves": 0,
            "directionRequests": 0,
            "confirmedVisits": 0,
            "repeatVisits": 0,
            "recommendations": 0,
            "recentSaves": 0,
        },
        "latitude": normalize_json_value(row["latitude"]),
        "longitude": normalize_json_value(row["longitude"]),
        "x": round(coordinate_to_map_position(row["longitude"], 17.75, 18.25), 2),
        "y": round(100 - coordinate_to_map_position(row["latitude"], 59.2, 59.47), 2),
    }
    if establishment_type == "Specialty coffee":
        place["specialty"] = specialty_attributes(row)
    return place


def stable_numeric_id(row: pd.Series) -> int:
    key = f"{row['osm_type']}:{row['osm_id']}"
    return zlib.crc32(key.encode("utf-8"))


def place_note(row: pd.Series) -> str:
    parts = [f"{clean_text(row['establishment_type'])} from OpenStreetMap"]
    cuisine = clean_text(row["cuisine"])
    address = clean_text(row["address"])
    if cuisine:
        parts.append(f"Cuisine tag: {cuisine}")
    if address:
        parts.append(f"Address: {address}")
    return ". ".join(parts) + "."


def place_tags(row: pd.Series) -> list[str]:
    tags = {clean_text(row["establishment_type"]), clean_text(row["neighbourhood"]), "OpenStreetMap"}
    for cuisine in clean_text(row["cuisine"]).split(";"):
        if cuisine:
            tags.add(cuisine.replace("_", " ").title())
    if not row["missing_opening_hours"]:
        tags.add("Opening hours")
    if not row["missing_website"]:
        tags.add("Website")
    if row["missing_address"]:
        tags.add("Missing address")
    return sorted(tag for tag in tags if tag)


def discovery_reason_list(row: pd.Series) -> list[str]:
    return [reason.strip() for reason in clean_text(row.get("discovery_reasons")).split(";") if reason.strip()]


def specialty_attributes(row: pd.Series) -> dict:
    category = clean_text(row["category"]).lower()
    cuisine = clean_text(row["cuisine"]).lower()
    roaster = category == "coffee_roaster" or "roaster" in cuisine
    coffee_tagged = category in {"coffee", "coffee_roaster"} or "coffee" in cuisine
    return {
        "specialtyVerified": False,
        "ownRoastery": roaster,
        "traceableCoffee": False,
        "filterCoffee": coffee_tagged,
        "espressoBased": coffee_tagged,
        "rotatingRoasters": False,
        "singleOrigin": False,
        "manualBrewMethods": [],
        "decafAvailable": False,
        "beansForSale": category in {"coffee", "coffee_roaster"},
        "verificationSources": 1,
    }


def coordinate_to_map_position(value: object, minimum: float, maximum: float) -> float:
    if pd.isna(value) or maximum <= minimum:
        return 50
    return min(100, max(0, ((float(value) - minimum) / (maximum - minimum)) * 100))


def dataframe_records(frame: pd.DataFrame) -> list[dict]:
    return [asdict(row) if hasattr(row, "__dataclass_fields__") else dict(row) for row in frame.to_dict(orient="records")]


def normalize_json_value(value: object) -> object:
    if pd.isna(value):
        return None
    if hasattr(value, "item"):
        return value.item()
    return value
