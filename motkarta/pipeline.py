from __future__ import annotations

import json
import re
from dataclasses import asdict, dataclass
from difflib import SequenceMatcher
from pathlib import Path

import pandas as pd

from motkarta.normalize import normalize_osm_establishment_type


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
    "source",
]


@dataclass(frozen=True)
class CoverageReport:
    total_places: int
    by_type: dict[str, int]
    missing_address: int
    missing_opening_hours: int
    missing_website: int
    duplicate_candidates_removed: int

    def markdown(self) -> str:
        lines = [
            "# Motkarta Coverage Report",
            "",
            f"Total establishments: {self.total_places}",
            "",
            "## By Type",
            "",
            *[f"- {name}: {count}" for name, count in sorted(self.by_type.items())],
            "",
            "## Data Gaps",
            "",
            f"- Missing address: {self.missing_address}",
            f"- Missing opening hours: {self.missing_opening_hours}",
            f"- Missing website: {self.missing_website}",
            f"- Duplicate candidates removed: {self.duplicate_candidates_removed}",
        ]
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
    data["establishment_type"] = data.apply(
        lambda row: row["establishment_type"]
        or normalize_osm_establishment_type(row["category"], row["cuisine"])
        or "Restaurant",
        axis=1,
    )
    data["neighbourhood"] = data.apply(assign_neighbourhood, axis=1)
    data["missing_address"] = data["address"].eq("")
    data["missing_opening_hours"] = data["opening_hours"].eq("")
    data["missing_website"] = data["website"].eq("")
    return data


def dedupe_places(frame: pd.DataFrame, threshold: float = 0.92) -> tuple[pd.DataFrame, pd.DataFrame]:
    data = frame.copy().reset_index(drop=True)
    kept: list[int] = []
    duplicate_rows: list[dict] = []

    for index, row in data.iterrows():
        duplicate_of = None
        for kept_index in kept:
            candidate = data.loc[kept_index]
            if is_duplicate(row, candidate, threshold):
                duplicate_of = kept_index
                break
        if duplicate_of is None:
            kept.append(index)
        else:
            duplicate_rows.append(
                {
                    "duplicate_index": index,
                    "duplicate_name": row["name"],
                    "kept_index": duplicate_of,
                    "kept_name": data.loc[duplicate_of, "name"],
                }
            )

    return data.loc[kept].reset_index(drop=True), pd.DataFrame(duplicate_rows)


def score_places(frame: pd.DataFrame) -> pd.DataFrame:
    data = frame.copy()
    completeness = (
        (~data["missing_address"]).astype(int)
        + (~data["missing_opening_hours"]).astype(int)
        + (~data["missing_website"]).astype(int)
    ) / 3
    coordinate_score = data[["latitude", "longitude"]].notna().all(axis=1).astype(int)
    type_specific_bonus = data["establishment_type"].map(
        {
            "Specialty coffee": 8,
            "Bakery": 5,
            "Bistro": 4,
            "Café": 3,
            "Restaurant": 2,
        }
    ).fillna(0)
    cuisine_detail = data["cuisine"].map(lambda value: min(10, len([part for part in value.split(";") if part]) * 2))
    data["discovery_score"] = (
        45
        + completeness * 20
        + coordinate_score * 10
        + type_specific_bonus
        + cuisine_detail
        - data["missing_website"].astype(int) * 4
    ).round(2)
    data["discovery_score"] = data["discovery_score"].clip(0, 100)
    return data


def build_coverage_report(frame: pd.DataFrame, duplicate_count: int = 0) -> CoverageReport:
    return CoverageReport(
        total_places=len(frame),
        by_type={key: int(value) for key, value in frame["establishment_type"].value_counts().to_dict().items()},
        missing_address=int(frame["missing_address"].sum()),
        missing_opening_hours=int(frame["missing_opening_hours"].sum()),
        missing_website=int(frame["missing_website"].sum()),
        duplicate_candidates_removed=duplicate_count,
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
                    ]
                ),
                "metadata": {
                    "osm_type": row["osm_type"],
                    "osm_id": row["osm_id"],
                    "establishment_type": row["establishment_type"],
                    "neighbourhood": row["neighbourhood"],
                    "discovery_score": float(row["discovery_score"]),
                },
            }
            handle.write(json.dumps(document, ensure_ascii=False) + "\n")


def clean_text(value: object) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def normalize_cuisine(value: object) -> str:
    parts = [
        clean_text(part).lower().replace("_", " ")
        for part in str(value or "").replace(",", ";").split(";")
        if clean_text(part)
    ]
    return ";".join(dict.fromkeys(parts))


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


def dataframe_records(frame: pd.DataFrame) -> list[dict]:
    return [asdict(row) if hasattr(row, "__dataclass_fields__") else dict(row) for row in frame.to_dict(orient="records")]
