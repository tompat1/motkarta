"""Offline Position-Debiased Learning-to-Rank (LTR) Module for Motkarta.

Implements:
1. Inverse Propensity Scoring (IPS) for result position examination debiasing.
2. Safe feature extraction strictly adhering to directives/ml_recommendation_system.md:
   - Zero commercial platform rating/review signals.
   - Only open-data, municipal verification, independent evidence, and structural attributes.
3. Debiased Gradient Boosted Ranker predicting counterfactual relevance.
4. Counterfactual NDCG and fairness evaluation (Shannon entropy, outer-city ratio).
5. Offline telemetry simulator conforming to the D1 recommendation_events contract.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any, Sequence

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingRegressor


# Outcome reward mapping according to Motkarta telemetry contract
OUTCOME_REWARDS: dict[str, float] = {
    "would_return": 3.0,
    "visit": 2.0,
    "save": 1.5,
    "click": 1.0,
    "impression": 0.0,
    "dismiss": -1.0,
}

# Forbidden commercial signal substrings to prevent data leakage
FORBIDDEN_FEATURE_SUBSTRINGS = (
    "google",
    "tripadvisor",
    "yelp",
    "rating_average",
    "review_count",
    "prominence",
    "price_level_commercial",
)


@dataclass(frozen=True)
class PropensityModel:
    """Position examination propensity model: P(Examine | Position k)."""

    gamma: float = 0.75  # Position decay exponent
    min_propensity: float = 0.05  # Lower bound to cap inverse propensity weight at 20x

    def propensity(self, position: int) -> float:
        """Calculate P(Examine | k) for 0-indexed position k >= 0."""
        pos = max(0, int(position))
        p = 1.0 / math.pow(1.0 + pos, self.gamma)
        return max(self.min_propensity, min(1.0, p))

    def weight(self, position: int) -> float:
        """Calculate inverse propensity weight w = 1 / P(Examine | k)."""
        return 1.0 / self.propensity(position)


@dataclass(frozen=True)
class LtrMetrics:
    """Evaluation metrics for debiased ranking model."""

    counterfactual_ndcg: float
    outer_city_ratio: float
    cuisine_shannon_entropy: float
    independent_ratio: float
    sample_count: int


def validate_feature_safety(feature_names: Sequence[str]) -> None:
    """Enforce non-negotiable boundary: no commercial platform signals allowed in features."""
    for name in feature_names:
        lower = name.lower()
        for forbidden in FORBIDDEN_FEATURE_SUBSTRINGS:
            if forbidden in lower:
                raise ValueError(
                    f"Forbidden commercial platform feature detected: '{name}'. "
                    f"Motkarta recommendation ranking must never ingest commercial ratings or engagement."
                )


def extract_ranking_features(place: dict[str, Any]) -> dict[str, float]:
    """Extract strictly allowed structural, evidence, and open-data features."""
    scores = place.get("scores") or {}
    evidence = place.get("evidence") or {}

    tags = [str(t).lower() for t in place.get("tags") or []]
    district = str(place.get("district") or place.get("area") or "").lower()

    # Inner city districts vs outer city
    inner_districts = {"södermalm", "norrmalm", "östermalm", "vasastan", "gamla stan", "kungsholmen"}
    is_outer_city = 1.0 if (district and district not in inner_districts) else 0.0

    features = {
        "quality_score": float(scores.get("quality", 50.0)),
        "discovery_score": float(scores.get("discovery", 50.0)),
        "freshness_score": float(scores.get("freshness", 50.0)),
        "evidence_sources_count": float(evidence.get("sources_count", 0)),
        "is_independently_verified": 1.0 if place.get("independently_verified") or evidence.get("independently_verified") else 0.0,
        "has_food_control": 1.0 if place.get("food_control_passed") or "food_control" in tags else 0.0,
        "has_serving_permit": 1.0 if place.get("serving_permit") or "serving_permit" in tags else 0.0,
        "has_verified_hours": 1.0 if bool(place.get("opening_hours") or place.get("openingHours")) else 0.0,
        "is_hidden_gem_eligible": 1.0 if place.get("is_hidden_gem") or place.get("hidden_gem") else 0.0,
        "is_outer_city": is_outer_city,
        "is_chain": 1.0 if str(place.get("chain_status")).lower() == "chain" else 0.0,
    }

    validate_feature_safety(list(features.keys()))
    return features


class MotkartaDebiasedRanker:
    """Offline Learning-to-Rank estimator using sample-weighted Gradient Boosting."""

    def __init__(self, propensity_model: PropensityModel | None = None, random_state: int = 42) -> None:
        self.propensity_model = propensity_model or PropensityModel()
        self.model = HistGradientBoostingRegressor(
            loss="squared_error",
            max_iter=100,
            learning_rate=0.05,
            min_samples_leaf=5,
            random_state=random_state,
        )
        self.feature_names_: list[str] = []
        self.is_fitted_ = False

    def fit(self, telemetry_events: list[dict[str, Any]]) -> "MotkartaDebiasedRanker":
        """Fit debiased ranker on recommendation events weighted by Inverse Propensity Scoring."""
        if not telemetry_events:
            raise ValueError("telemetry_events must not be empty.")

        rows: list[dict[str, float]] = []
        rewards: list[float] = []
        weights: list[float] = []

        for event in telemetry_events:
            place = event.get("place") or {}
            event_type = str(event.get("event_type", "impression")).lower()
            position = int(event.get("position", 0))

            reward = OUTCOME_REWARDS.get(event_type, 0.0)
            weight = self.propensity_model.weight(position)

            feats = extract_ranking_features(place)
            rows.append(feats)
            rewards.append(reward)
            weights.append(weight)

        df_features = pd.DataFrame(rows)
        self.feature_names_ = list(df_features.columns)
        validate_feature_safety(self.feature_names_)

        X = df_features.to_numpy(dtype=np.float64)
        y = np.array(rewards, dtype=np.float64)
        w = np.array(weights, dtype=np.float64)

        self.model.fit(X, y, sample_weight=w)
        self.is_fitted_ = True
        return self

    def predict_score(self, place: dict[str, Any]) -> float:
        """Predict debiased recommendation score scaled to 0-100."""
        if not self.is_fitted_:
            raise RuntimeError("Ranker must be fitted before calling predict_score.")

        feats = extract_ranking_features(place)
        row = [feats.get(name, 0.0) for name in self.feature_names_]
        raw_pred = float(self.model.predict([row])[0])

        # Normalize predicted reward (-1.0 to 3.0) into a 0-100 score
        normalized = (raw_pred + 1.0) / 4.0 * 100.0
        return max(0.0, min(100.0, round(normalized, 2)))

    def rank_places(self, places: list[dict[str, Any]], top_n: int = 20) -> list[dict[str, Any]]:
        """Rank a candidate list using the debiased model."""
        scored = []
        for p in places:
            score = self.predict_score(p)
            item = dict(p)
            item["ltr_debiased_score"] = score
            scored.append(item)

        scored.sort(key=lambda x: (x["ltr_debiased_score"], -x.get("id", 0)), reverse=True)
        return scored[:top_n]


def compute_counterfactual_ndcg(
    actual_rewards: Sequence[float],
    predicted_scores: Sequence[float],
    positions: Sequence[int],
    propensity_model: PropensityModel | None = None,
    k: int = 10,
) -> float:
    """Calculate Inverse Propensity Scored (IPS) Normalized Discounted Cumulative Gain."""
    model = propensity_model or PropensityModel()
    n = min(len(actual_rewards), len(predicted_scores), len(positions))
    if n == 0:
        return 0.0

    # Sort indices by predicted score descending
    sorted_idx = sorted(range(n), key=lambda i: predicted_scores[i], reverse=True)[:k]

    # Weighted DCG
    dcg = 0.0
    for rank_idx, item_idx in enumerate(sorted_idx):
        reward = actual_rewards[item_idx]
        pos = positions[item_idx]
        w = model.weight(pos)
        discount = math.log2(rank_idx + 2)
        dcg += (w * reward) / discount

    # Ideal DCG under perfect ranking
    ideal_idx = sorted(range(n), key=lambda i: actual_rewards[i], reverse=True)[:k]
    idcg = 0.0
    for rank_idx, item_idx in enumerate(ideal_idx):
        reward = actual_rewards[item_idx]
        pos = positions[item_idx]
        w = model.weight(pos)
        discount = math.log2(rank_idx + 2)
        idcg += (w * max(0.0, reward)) / discount

    if idcg <= 0.0:
        return 1.0 if dcg >= 0.0 else 0.0
    return max(0.0, min(1.0, dcg / idcg))


def simulate_recommendation_telemetry(
    n_sessions: int = 200,
    seed: int = 42,
) -> list[dict[str, Any]]:
    """Simulate realistic recommendation sessions with position examination bias for testing."""
    rng = np.random.default_rng(seed)
    propensity = PropensityModel()

    sample_venues = [
        {"id": 1, "name": "Pascal Norrtullsgatan", "district": "Vasastan", "scores": {"quality": 92, "discovery": 85, "freshness": 90}, "independently_verified": True, "chain_status": "independent", "tags": ["specialty coffee", "bakery"]},
        {"id": 2, "name": "Mellqvist Kaffebar", "district": "Vasastan", "scores": {"quality": 88, "discovery": 80, "freshness": 85}, "independently_verified": True, "chain_status": "independent", "tags": ["specialty coffee"]},
        {"id": 3, "name": "Drop Coffee", "district": "Södermalm", "scores": {"quality": 95, "discovery": 90, "freshness": 95}, "independently_verified": True, "chain_status": "independent", "tags": ["specialty coffee", "roastery"]},
        {"id": 4, "name": "Bageri Petrus", "district": "Södermalm", "scores": {"quality": 91, "discovery": 88, "freshness": 90}, "independently_verified": True, "chain_status": "independent", "tags": ["bakery", "sourdough"]},
        {"id": 5, "name": "Café Gånget", "district": "Hägersten", "scores": {"quality": 84, "discovery": 82, "freshness": 80}, "independently_verified": True, "chain_status": "independent", "tags": ["café"]},
        {"id": 6, "name": "Commercial MegaChain", "district": "Norrmalm", "scores": {"quality": 40, "discovery": 20, "freshness": 60}, "independently_verified": False, "chain_status": "chain", "tags": ["fast food"]},
    ]

    events: list[dict[str, Any]] = []

    for session_idx in range(n_sessions):
        # Shuffle venues into result list
        session_venues = list(sample_venues)
        rng.shuffle(session_venues)

        for pos, venue in enumerate(session_venues):
            # 1. Base impression
            events.append({
                "session_id": f"sess_{session_idx}",
                "venue_id": venue["id"],
                "position": pos,
                "event_type": "impression",
                "place": venue,
            })

            # 2. Probability user examines position pos
            p_exam = propensity.propensity(pos)
            if rng.uniform(0, 1) > p_exam:
                continue  # User did not scroll to/examine this position

            # 3. Quality-driven interaction if examined
            scores = venue.get("scores")
            quality = float(scores["quality"]) if isinstance(scores, dict) and "quality" in scores else 50.0
            is_chain = venue.get("chain_status") == "chain"

            if is_chain:
                # Users dislike chains
                if rng.uniform(0, 1) < 0.3:
                    events.append({
                        "session_id": f"sess_{session_idx}",
                        "venue_id": venue["id"],
                        "position": pos,
                        "event_type": "dismiss",
                        "place": venue,
                    })
            elif quality >= 90:
                roll = rng.uniform(0, 1)
                if roll < 0.4:
                    events.append({
                        "session_id": f"sess_{session_idx}",
                        "venue_id": venue["id"],
                        "position": pos,
                        "event_type": "would_return" if roll < 0.15 else "save",
                        "place": venue,
                    })
            elif quality >= 80:
                if rng.uniform(0, 1) < 0.25:
                    events.append({
                        "session_id": f"sess_{session_idx}",
                        "venue_id": venue["id"],
                        "position": pos,
                        "event_type": "click",
                        "place": venue,
                    })

    return events
