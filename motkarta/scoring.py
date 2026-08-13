from __future__ import annotations

from dataclasses import dataclass, field
from math import exp, log, log1p


def logarithmic_count_score(count: float, high_watermark: float = 10000) -> float:
    """Use logarithmic transformation log1p(count) to reduce unfair advantage of places with thousands of reviews."""
    if high_watermark <= 0:
        return 0
    return clamp((log1p(max(0, count)) / log1p(high_watermark)) * 100)


Confidence = str


@dataclass(frozen=True)
class EvidenceSignals:
    specialist_guide: float = 0
    independent_editorial: float = 0
    verified_user_rating: float = 0
    repeat_visits: float = 0
    recent_reviews: float = 0
    credible_reviewers: float = 0
    inspection_status: float = 60
    verified_attributes: float = 0
    data_freshness: float = 0
    confidence: Confidence = "Low"


@dataclass(frozen=True)
class EngagementSignals:
    search_impressions: int = 0
    profile_views: int = 0
    map_marker_clicks: int = 0
    saves: int = 0
    direction_requests: int = 0
    confirmed_visits: int = 0
    repeat_visits: int = 0
    recommendations: int = 0
    recent_saves: int = 0


@dataclass(frozen=True)
class SpecialtyAttributes:
    specialty_verified: bool = False
    own_roastery: bool = False
    traceable_coffee: bool = False
    filter_coffee: bool = False
    espresso_based: bool = False
    rotating_roasters: bool = False
    single_origin: bool = False
    manual_brew_methods: list[str] = field(default_factory=list)
    decaf_available: bool = False
    beans_for_sale: bool = False
    verification_sources: int = 0


@dataclass(frozen=True)
class PlaceInput:
    id: int
    name: str
    kind: str
    area: str
    tags: list[str]
    rating_average: float = 4.1
    reliable_rating_count: int = 0
    review_count: int = 0
    category_mean_rating: float = 4.1
    price_level: int = 2
    mainstream_exposure: float = 0
    days_since_fresh_evidence: int = 365
    evidence: EvidenceSignals = field(default_factory=EvidenceSignals)
    engagement: EngagementSignals = field(default_factory=EngagementSignals)
    specialty: SpecialtyAttributes | None = None


def clamp(value: float, minimum: float = 0, maximum: float = 100) -> float:
    return min(maximum, max(minimum, value))


def bayesian_rating(rating: float, rating_count: int, global_mean: float = 4.1, minimum: int = 30) -> float:
    if rating_count <= 0:
        return global_mean
    return rating_count / (rating_count + minimum) * rating + minimum / (rating_count + minimum) * global_mean


def recency_weight(days_old: int, half_life: int = 180) -> float:
    return exp(-log(2) * max(0, days_old) / half_life)


def bayesian_rate(positive_signals: int, total_signals: int, prior_rate: float = 0.08, prior_weight: int = 50) -> float:
    if total_signals <= 0:
        return prior_rate
    return (positive_signals + prior_rate * prior_weight) / (total_signals + prior_weight)


def verify_specialty_coffee_eligibility(place: PlaceInput) -> bool:
    """A place cannot receive the 'Specialty coffee' label merely from marketing text (e.g. 'premium coffee').

    Requires at least one of four verification gates:
    1. Verification by a recognised specialty guide (specialist_guide > 0)
    2. Verification by editorial team (specialty_verified is True)
    3. Consistent community submissions (verification_sources >= 2)
    4. Sufficient structured evidence from menu/website (structured_signals >= 3)
    """
    guide_verified = place.evidence.specialist_guide > 0
    if not place.specialty:
        return guide_verified

    attributes = place.specialty
    structured_signals = sum(
        [
            attributes.specialty_verified,
            attributes.own_roastery,
            attributes.traceable_coffee,
            attributes.single_origin,
            attributes.rotating_roasters,
            bool(attributes.manual_brew_methods),
            attributes.beans_for_sale,
        ]
    )

    editorial_verified = attributes.specialty_verified
    community_verified = attributes.verification_sources >= 2
    menu_verified = structured_signals >= 3

    return guide_verified or editorial_verified or community_verified or menu_verified


def specialty_confidence(place: PlaceInput) -> float:
    if place.kind != "Specialty coffee" or not verify_specialty_coffee_eligibility(place):
        return 0
    if not place.specialty:
        return 50 if place.evidence.specialist_guide > 0 else 0
    attributes = place.specialty
    structured_signals = sum(
        [
            attributes.specialty_verified,
            attributes.own_roastery,
            attributes.traceable_coffee,
            attributes.filter_coffee,
            attributes.espresso_based,
            attributes.rotating_roasters,
            attributes.single_origin,
            attributes.decaf_available,
            attributes.beans_for_sale,
            bool(attributes.manual_brew_methods),
        ]
    )
    verification_score = min(3, attributes.verification_sources) / 3
    return clamp(structured_signals * 7 + verification_score * 30)


def quality_score(place: PlaceInput) -> float:
    evidence = place.evidence
    base = (
        0.16 * evidence.specialist_guide
        + 0.14 * evidence.independent_editorial
        + 0.14 * evidence.verified_user_rating
        + 0.1 * evidence.repeat_visits
        + 0.1 * evidence.recent_reviews
        + 0.1 * evidence.credible_reviewers
        + 0.06 * evidence.inspection_status
        + 0.1 * evidence.verified_attributes
        + 0.1 * evidence.data_freshness
    )
    return clamp(base + (specialty_confidence(place) * 0.12 if place.kind == "Specialty coffee" else 0))


def freshness_score(place: PlaceInput) -> float:
    return clamp(recency_weight(place.days_since_fresh_evidence) * 100)


def popularity_score(place: PlaceInput) -> dict[str, float]:
    bayesian_user_rating = (
        (bayesian_rating(place.rating_average, place.reliable_rating_count, place.category_mean_rating) - 1) / 4
    ) * 100
    engagement = place.engagement
    exposure_adjusted_engagement = (
        bayesian_rate(
            engagement.saves + engagement.confirmed_visits + engagement.direction_requests,
            max(1, engagement.search_impressions),
            0.08,
            120,
        )
        * 100
    )
    repeat_visit_rate = bayesian_rate(engagement.repeat_visits, max(1, engagement.confirmed_visits), 0.18, 30) * 100
    recent_save_rate = bayesian_rate(engagement.recent_saves, max(1, engagement.saves), 0.38, 25) * 100
    confidence_weight = {"Low": 0.45, "Medium": 0.72, "High": 1}.get(place.evidence.confidence, 0.45)
    source_consensus = clamp(
        (
            place.evidence.specialist_guide
            + place.evidence.independent_editorial
            + place.evidence.verified_user_rating
            + place.evidence.credible_reviewers
        )
        / 4
        * 100
        * confidence_weight
    )
    score = clamp(
        0.3 * bayesian_user_rating
        + 0.25 * exposure_adjusted_engagement
        + 0.2 * repeat_visit_rate
        + 0.15 * recent_save_rate
        + 0.1 * source_consensus
    )
    return {
        "score": score,
        "bayesian_user_rating": bayesian_user_rating,
        "exposure_adjusted_engagement": exposure_adjusted_engagement,
        "repeat_visit_rate": repeat_visit_rate,
        "recent_save_rate": recent_save_rate,
        "source_consensus": source_consensus,
    }


def relevance_score(place: PlaceInput) -> float:
    return 50


def discovery_score(place: PlaceInput, quality: float) -> dict[str, float]:
    specialist_confidence = place.evidence.specialist_guide * 70 + specialty_confidence(place) * 0.3
    local_engagement = (
        bayesian_rate(
            place.engagement.map_marker_clicks + place.engagement.saves,
            max(1, place.engagement.search_impressions),
            0.1,
            80,
        )
        * 100
    )
    score = clamp(
        0.4 * quality
        + 0.25 * specialist_confidence
        + 0.2 * local_engagement
        + 0.15 * freshness_score(place)
        - 0.25 * place.mainstream_exposure
    )
    return {"score": score, "specialist_confidence": clamp(specialist_confidence), "local_engagement": local_engagement}


def score_place(place: PlaceInput) -> dict[str, float]:
    quality = quality_score(place)
    popularity = popularity_score(place)
    relevance = relevance_score(place)
    discovery = discovery_score(place, quality)
    freshness = freshness_score(place)
    recommendation = clamp(
        0.35 * relevance + 0.25 * quality + 0.15 * popularity["score"] + 0.15 * discovery["score"] + 0.1 * freshness
    )
    return {
        "quality": quality,
        "popularity": popularity["score"],
        "relevance": relevance,
        "discovery": discovery["score"],
        "freshness": freshness,
        "recommendation": recommendation,
    }
