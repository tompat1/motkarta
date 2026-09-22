"""Municipal permit and food-control helpers for new-venue discovery."""

from __future__ import annotations

import re
from datetime import UTC, date, datetime
from typing import Any

FOOD_VENUE_BUSINESS_PATTERNS: tuple[re.Pattern[str], ...] = (
    re.compile(r"restaurang", re.I),
    re.compile(r"catering", re.I),
    re.compile(r"\bbar\b", re.I),
    re.compile(r"caf[eé]", re.I),
    re.compile(r"bageri", re.I),
    re.compile(r"bakery", re.I),
    re.compile(r"konditori", re.I),
    re.compile(r"pub\b", re.I),
    re.compile(r"pizzeria", re.I),
)

EXCLUDED_BUSINESS_PATTERNS: tuple[re.Pattern[str], ...] = (
    re.compile(r"detaljhandel", re.I),
    re.compile(r"partihandel", re.I),
    re.compile(r"skola", re.I),
    re.compile(r"förskola", re.I),
    re.compile(r"vard|vård", re.I),
    re.compile(r"institution", re.I),
    re.compile(r"transport", re.I),
    re.compile(r"vattenverk", re.I),
    re.compile(r"tillverkning", re.I),
)


def clean_text(value: object) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def parse_inspection_date(value: object) -> date | None:
    text = clean_text(value)
    if not text:
        return None
    try:
        return datetime.fromisoformat(text.replace("Z", "+00:00")[:19]).date()
    except ValueError:
        pass
    try:
        return datetime.strptime(text[:10], "%Y-%m-%d").date()
    except ValueError:
        return None


def is_food_venue_business_type(business_type: object, facility_type: object = "") -> bool:
    combined = f"{clean_text(business_type)} {clean_text(facility_type)}".strip()
    if not combined:
        return False
    if any(pattern.search(combined) for pattern in EXCLUDED_BUSINESS_PATTERNS):
        return False
    return any(pattern.search(combined) for pattern in FOOD_VENUE_BUSINESS_PATTERNS)


def is_recent_municipal_signal(
    inspection_date: object,
    *,
    reference: date | None = None,
    months: int = 18,
) -> bool:
    parsed = parse_inspection_date(inspection_date)
    if parsed is None:
        return False
    today = reference or datetime.now(UTC).date()
    month_index = today.year * 12 + today.month - months
    threshold_year, threshold_month = divmod(month_index - 1, 12)
    threshold = date(threshold_year, threshold_month + 1, 1)
    return parsed >= threshold


def is_likely_new_venue_signal(
    row: dict[str, Any],
    *,
    reference: date | None = None,
    recent_months: int = 18,
) -> bool:
    inspection_count = row.get("inspection_count")
    try:
        count = int(inspection_count)
    except (TypeError, ValueError):
        count = None

    recent = is_recent_municipal_signal(
        row.get("latest_inspection_date"),
        reference=reference,
        months=recent_months,
    )
    if count is not None and count <= 2 and recent:
        return True
    if recent and clean_text(row.get("latest_remark", "")).lower() in {"", "utan avvikelse"}:
        return count is None or count <= 4
    return False


def municipal_signal_reason(row: dict[str, Any]) -> str:
    if is_likely_new_venue_signal(row):
        return "Recent municipal food-control registration or early inspection history"
    return "Registered food venue in municipal food-control data but absent from catalog"


def summarize_municipal_new_venue_signals(
    food_control_rows: list[dict[str, Any]],
    matched_source_ids: set[str],
    *,
    serving_permit_rows: list[dict[str, Any]] | None = None,
    matched_permit_ids: set[str] | None = None,
    sample_limit: int = 25,
) -> dict[str, Any]:
    permit_rows = serving_permit_rows or []
    matched_permits = matched_permit_ids or set()

    food_candidates: list[dict[str, Any]] = []
    for row in food_control_rows:
        source_id = clean_text(row.get("source_id"))
        if not source_id or source_id in matched_source_ids:
            continue
        if not is_food_venue_business_type(row.get("business_type"), row.get("facility_type")):
            continue
        food_candidates.append(
            {
                "source": "Stockholms stad livsmedelskontroll",
                "sourceType": "municipal_unmatched",
                "sourceId": source_id,
                "name": clean_text(row.get("name")),
                "address": clean_text(row.get("address")),
                "businessType": clean_text(row.get("business_type")),
                "latestInspectionDate": clean_text(row.get("latest_inspection_date")),
                "inspectionCount": row.get("inspection_count"),
                "latitude": row.get("latitude"),
                "longitude": row.get("longitude"),
                "signalReason": municipal_signal_reason(row),
                "isLikelyNewVenue": is_likely_new_venue_signal(row),
            }
        )

    permit_candidates: list[dict[str, Any]] = []
    for row in permit_rows:
        permit_id = clean_text(row.get("permit_id")) or clean_text(row.get("source_id"))
        if not permit_id or permit_id in matched_permits:
            continue
        permit_candidates.append(
            {
                "source": clean_text(row.get("source_name")) or "Serving permit register",
                "sourceType": "serving_permit",
                "sourceId": permit_id,
                "name": clean_text(row.get("name")),
                "address": clean_text(row.get("address")),
                "permitType": clean_text(row.get("permit_type")),
                "validFrom": clean_text(row.get("valid_from")),
                "validTo": clean_text(row.get("valid_to")),
                "latitude": row.get("latitude"),
                "longitude": row.get("longitude"),
                "signalReason": "Serving permit on file but no catalog match yet",
                "isLikelyNewVenue": is_recent_municipal_signal(row.get("valid_from"), months=24),
            }
        )

    likely_new = [row for row in food_candidates + permit_candidates if row.get("isLikelyNewVenue")]
    prioritized = sorted(
        food_candidates + permit_candidates,
        key=lambda row: (not row.get("isLikelyNewVenue"), clean_text(row.get("name")).lower()),
    )

    return {
        "unmatchedFoodControlVenues": len(food_candidates),
        "unmatchedServingPermits": len(permit_candidates),
        "likelyNewVenueSignals": len(likely_new),
        "sample": prioritized[:sample_limit],
        "likelyNewVenueSample": likely_new[:sample_limit],
    }
