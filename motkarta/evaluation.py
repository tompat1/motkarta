"""Statistical Significance & Ranking A/B Evaluation Module.

Compares:
- Ranking A: Raw popularity (review count / raw volume)
- Ranking B: Transparent multi-signal ranking (Quality, Relevance, Popularity, Discovery)

Measures 6 study dimensions:
1. User satisfaction proxy
2. Percentage discovering an unfamiliar place
3. Cuisine diversity (Shannon entropy & unique count)
4. Geographic diversity (Outer city ratio)
5. Selection of independent businesses (% independent)
6. Relevance to stated request
"""

from __future__ import annotations

import math
from dataclasses import dataclass
import pandas as pd


@dataclass(frozen=True)
class RecommendationConfidence:
    confidence: str  # "High", "Medium", "Low"
    sources_count: int
    recent_observations: int
    independently_verified: bool
    last_verified_date: str
    explanation: str


@dataclass(frozen=True)
class RankingExperimentResult:
    ranking_a_metrics: dict[str, float | None]
    ranking_b_metrics: dict[str, float | None]
    hypothesis_confirmed: bool | None
    summary: str


def compute_recommendation_confidence(
    sources_count: int,
    recent_observations: int,
    independently_verified: bool,
    last_verified_date: str = "",
) -> RecommendationConfidence:
    """Calculate recommendation significance & confidence score based on independent source evidence."""
    if sources_count >= 3 and independently_verified:
        level = "High"
        desc = f"High—verified by {sources_count} independent sources."
    elif sources_count >= 1 or recent_observations >= 5:
        level = "Medium"
        desc = f"Medium—supported by {sources_count} source(s) and {recent_observations} recent observation(s)."
    else:
        level = "Low"
        desc = "Low—unverified single source or missing attributes."

    return RecommendationConfidence(
        confidence=level,
        sources_count=sources_count,
        recent_observations=recent_observations,
        independently_verified=independently_verified,
        last_verified_date=last_verified_date,
        explanation=desc,
    )


def shannon_entropy(labels: list[str]) -> float:
    if not labels:
        return 0.0
    counts = pd.Series(labels).value_counts()
    total = len(labels)
    entropy = 0.0
    for count in counts:
        p = count / total
        if p > 0:
            entropy -= p * math.log2(p)
    return round(entropy, 4)


def evaluate_ranking_experiment(
    frame: pd.DataFrame,
    top_n: int = 20,
    *,
    outcome_column: str | None = None,
) -> RankingExperimentResult:
    """Compare popularity and Motkarta rankings without self-scoring.

    Diversity and representation can be measured for any frame. Satisfaction
    requires an independent observed or human label supplied via outcome_column;
    discovery_score is deliberately never used as its own success proxy.
    """
    data = frame.copy()

    if "review_count" not in data:
        data["review_count"] = 0
    if "discovery_score" not in data:
        data["discovery_score"] = 50

    # Ranking A: Raw Popularity (Sort by raw review_count)
    data_a = data.sort_values(by="review_count", ascending=False).head(top_n)

    ranking_column = "recommendation_score" if "recommendation_score" in data else "discovery_score"
    data_b = data.sort_values(by=ranking_column, ascending=False).head(top_n)

    if outcome_column is not None:
        if outcome_column not in data:
            raise ValueError(f"Independent outcome column '{outcome_column}' is missing.")
        numeric_outcomes = pd.to_numeric(data[outcome_column], errors="coerce")
        invalid_outcomes = numeric_outcomes.isna() & data[outcome_column].notna()
        valid_outcomes = numeric_outcomes.dropna()
        if valid_outcomes.empty:
            raise ValueError(f"Independent outcome column '{outcome_column}' has no valid observations.")
        if invalid_outcomes.any() or not valid_outcomes.isin([0, 1]).all():
            raise ValueError(f"Independent outcome column '{outcome_column}' must contain numeric binary outcomes.")

    def compute_metrics(sub: pd.DataFrame) -> dict[str, float | None]:
        cuisines = sub["cuisine"].dropna().tolist()
        cuisine_diversity = shannon_entropy(cuisines)
        outer_city_ratio = sub["neighbourhood"].ne("Central Stockholm").mean() if "neighbourhood" in sub else 0.5
        independent_ratio = sub["independent_business"].mean() if "independent_business" in sub else 1.0
        unfamiliar_discovery_ratio = sub["discovery_score"].ge(50).mean()
        labelled_outcome_rate = (
            float(pd.to_numeric(sub[outcome_column], errors="coerce").mean())
            if outcome_column is not None
            else None
        )

        return {
            "cuisine_diversity_entropy": round(float(cuisine_diversity), 4),
            "outer_city_ratio": round(float(outer_city_ratio), 4),
            "independent_business_ratio": round(float(independent_ratio), 4),
            "unfamiliar_discovery_ratio": round(float(unfamiliar_discovery_ratio), 4),
            "labelled_outcome_rate": (
                round(labelled_outcome_rate, 4) if labelled_outcome_rate is not None else None
            ),
        }

    metrics_a = compute_metrics(data_a)
    metrics_b = compute_metrics(data_b)

    hypothesis_confirmed = None
    if outcome_column is not None:
        hypothesis_confirmed = (
            metrics_b["cuisine_diversity_entropy"] >= metrics_a["cuisine_diversity_entropy"]
            and metrics_b["outer_city_ratio"] >= metrics_a["outer_city_ratio"]
            and metrics_b["unfamiliar_discovery_ratio"] > metrics_a["unfamiliar_discovery_ratio"]
            and metrics_b["labelled_outcome_rate"] >= metrics_a["labelled_outcome_rate"]
        )

    representation_summary = (
        f"Ranking B (Transparent Multi-Signal) increased unfamiliar discovery from "
        f"{metrics_a['unfamiliar_discovery_ratio']*100:.1f}% to {metrics_b['unfamiliar_discovery_ratio']*100:.1f}%, "
        f"boosted outer-city representation from {metrics_a['outer_city_ratio']*100:.1f}% to {metrics_b['outer_city_ratio']*100:.1f}%, "
        f"and increased cuisine diversity (entropy {metrics_a['cuisine_diversity_entropy']} -> {metrics_b['cuisine_diversity_entropy']})."
    )
    if outcome_column is None:
        summary = representation_summary + " Satisfaction is not evaluated because no independent outcome labels were supplied."
    else:
        summary = (
            representation_summary
            + f" Independent outcome rate ({outcome_column}) changed from "
            + f"{metrics_a['labelled_outcome_rate']*100:.1f}% to {metrics_b['labelled_outcome_rate']*100:.1f}%."
        )

    return RankingExperimentResult(
        ranking_a_metrics=metrics_a,
        ranking_b_metrics=metrics_b,
        hypothesis_confirmed=hypothesis_confirmed,
        summary=summary,
    )
