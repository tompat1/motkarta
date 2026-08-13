from __future__ import annotations

import math
import re
from dataclasses import dataclass
from difflib import SequenceMatcher

import pandas as pd


@dataclass(frozen=True)
class SourceRecord:
    source_id: str
    name: str
    address: str = ""
    latitude: float | None = None
    longitude: float | None = None
    source_name: str = ""
    source_url: str = ""
    captured_at: str = ""
    summary: str = ""


@dataclass(frozen=True)
class SourceMatch:
    source_id: str
    source_name: str
    source_record_name: str
    place_name: str
    osm_type: str
    osm_id: str
    match_score: float
    match_reason: str
    distance_meters: float | None


def match_source_records(
    places: pd.DataFrame,
    records: list[SourceRecord],
    min_name_score: float = 0.88,
    max_distance_meters: float = 90,
) -> list[SourceMatch]:
    matches: list[SourceMatch] = []
    prepared = places.copy()
    prepared["__name_key"] = prepared["name"].map(normalized_name)
    prepared["__address_key"] = prepared["address"].map(normalized_address)
    place_records = prepared.to_dict(orient="records")
    address_index: dict[str, list[dict]] = {}
    geo_index: dict[tuple[int, int], list[dict]] = {}
    name_index: dict[str, list[dict]] = {}

    for place in place_records:
        if place["__address_key"]:
            address_index.setdefault(place["__address_key"], []).append(place)
        if not pd.isna(place.get("latitude")) and not pd.isna(place.get("longitude")):
            geo_index.setdefault(coordinate_cell(place["latitude"], place["longitude"]), []).append(place)
        if place["__name_key"]:
            name_index.setdefault(place["__name_key"][:8], []).append(place)

    for record in records:
        candidates = candidate_places(record, place_records, address_index, geo_index, name_index)
        match = best_match(candidates, record, min_name_score, max_distance_meters)
        if match is not None:
            matches.append(match)
    return matches


def candidate_places(
    record: SourceRecord,
    place_records: list[dict],
    address_index: dict[str, list[dict]],
    geo_index: dict[tuple[int, int], list[dict]],
    name_index: dict[str, list[dict]],
) -> list[dict]:
    candidates_by_key: dict[tuple[str, str], dict] = {}
    record_address = normalized_address(record.address)
    record_name = normalized_name(record.name)

    if record_address:
        for place in address_index.get(record_address, []):
            candidates_by_key[(str(place["osm_type"]), str(place["osm_id"]))] = place

    if record.latitude is not None and record.longitude is not None:
        lat_cell, lon_cell = coordinate_cell(record.latitude, record.longitude)
        for lat_delta in (-1, 0, 1):
            for lon_delta in (-1, 0, 1):
                for place in geo_index.get((lat_cell + lat_delta, lon_cell + lon_delta), []):
                    candidates_by_key[(str(place["osm_type"]), str(place["osm_id"]))] = place

    if record_name:
        for place in name_index.get(record_name[:8], []):
            candidates_by_key[(str(place["osm_type"]), str(place["osm_id"]))] = place

    return list(candidates_by_key.values()) if candidates_by_key else place_records[:0]


def best_match(
    places: list[dict],
    record: SourceRecord,
    min_name_score: float,
    max_distance_meters: float,
) -> SourceMatch | None:
    record_name = normalized_name(record.name)
    record_address = normalized_address(record.address)
    if not record_name:
        return None

    best: tuple[float, str, float | None, dict] | None = None
    for place in places:
        name_score = SequenceMatcher(None, record_name, place["__name_key"]).ratio()
        distance = distance_meters(record.latitude, record.longitude, place.get("latitude"), place.get("longitude"))
        address_match = bool(record_address and record_address == place["__address_key"])
        near = distance is not None and distance <= max_distance_meters

        if address_match and name_score >= 0.72:
            score = 0.72 + name_score * 0.28
            reason = "same address and similar name"
        elif near and name_score >= min_name_score:
            score = 0.62 + name_score * 0.28 + max(0, (max_distance_meters - distance) / max_distance_meters) * 0.1
            reason = "nearby coordinates and similar name"
        elif address_match:
            score = 0.75
            reason = "same address"
        else:
            continue

        if best is None or score > best[0]:
            best = (score, reason, distance, place)

    if best is None:
        return None

    score, reason, distance, place = best
    return SourceMatch(
        source_id=record.source_id,
        source_name=record.source_name,
        source_record_name=record.name,
        place_name=place["name"],
        osm_type=str(place["osm_type"]),
        osm_id=str(place["osm_id"]),
        match_score=round(min(score, 1), 4),
        match_reason=reason,
        distance_meters=round(distance, 1) if distance is not None else None,
    )


def normalized_name(value: object) -> str:
    text = str(value or "").lower()
    text = re.sub(r"\b(ab|hb|kb|restaurang|restaurant|cafe|café|bageri|bakery)\b", " ", text)
    return re.sub(r"[^a-z0-9åäöé]+", "", text)


def normalized_address(value: object) -> str:
    text = str(value or "").lower().replace("gatan", "g")
    return re.sub(r"[^a-z0-9åäöé]+", "", text)


def distance_meters(lat_a: object, lon_a: object, lat_b: object, lon_b: object) -> float | None:
    if any(pd.isna(value) for value in [lat_a, lon_a, lat_b, lon_b]):
        return None
    lat1 = math.radians(float(lat_a))
    lon1 = math.radians(float(lon_a))
    lat2 = math.radians(float(lat_b))
    lon2 = math.radians(float(lon_b))
    delta_lat = lat2 - lat1
    delta_lon = lon2 - lon1
    haversine = (
        math.sin(delta_lat / 2) ** 2
        + math.cos(lat1) * math.cos(lat2) * math.sin(delta_lon / 2) ** 2
    )
    return 6_371_000 * 2 * math.atan2(math.sqrt(haversine), math.sqrt(1 - haversine))


def coordinate_cell(lat: object, lon: object) -> tuple[int, int]:
    return int(float(lat) * 1000), int(float(lon) * 1000)
