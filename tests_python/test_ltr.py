"""Unit tests for Motkarta Learning-to-Rank (LTR) and position-debiasing pipeline."""

import pytest
from motkarta.ltr import (
    PropensityModel,
    MotkartaDebiasedRanker,
    extract_ranking_features,
    validate_feature_safety,
    compute_counterfactual_ndcg,
    simulate_recommendation_telemetry,
)


def test_propensity_model_bounds_and_decay():
    model = PropensityModel(gamma=0.75, min_propensity=0.05)
    p0 = model.propensity(0)
    p1 = model.propensity(1)
    p5 = model.propensity(5)
    p20 = model.propensity(20)

    # Position 0 must have maximum propensity 1.0
    assert p0 == 1.0
    # Propensity must strictly decrease with rank
    assert p0 > p1 > p5 > p20
    # Must respect min_propensity floor
    assert p20 >= 0.05

    # Inverse propensity weight must be bounded
    w0 = model.weight(0)
    w20 = model.weight(20)
    assert w0 == 1.0
    assert w20 <= 20.0


def test_validate_feature_safety_blocks_commercial_signals():
    safe_features = ["quality_score", "discovery_score", "has_food_control", "is_outer_city"]
    validate_feature_safety(safe_features)  # Must not raise

    with pytest.raises(ValueError, match="Forbidden commercial platform feature detected"):
        validate_feature_safety(["quality_score", "google_rating"])

    with pytest.raises(ValueError, match="Forbidden commercial platform feature detected"):
        validate_feature_safety(["yelp_review_count", "discovery_score"])

    with pytest.raises(ValueError, match="Forbidden commercial platform feature detected"):
        validate_feature_safety(["review_count", "freshness_score"])


def test_extract_ranking_features_structure():
    place = {
        "id": 1,
        "name": "Drop Coffee",
        "district": "Södermalm",
        "scores": {"quality": 95, "discovery": 88, "freshness": 90},
        "independently_verified": True,
        "chain_status": "independent",
        "opening_hours": "08:00-18:00",
        "tags": ["specialty coffee", "food_control"],
    }
    feats = extract_ranking_features(place)
    assert feats["quality_score"] == 95.0
    assert feats["discovery_score"] == 88.0
    assert feats["is_independently_verified"] == 1.0
    assert feats["has_verified_hours"] == 1.0
    assert feats["has_food_control"] == 1.0
    assert feats["is_outer_city"] == 0.0
    assert feats["is_chain"] == 0.0


def test_debiased_ranker_training_and_scoring():
    telemetry = simulate_recommendation_telemetry(n_sessions=150, seed=42)
    assert len(telemetry) > 0

    ranker = MotkartaDebiasedRanker(random_state=42)
    ranker.fit(telemetry)
    assert ranker.is_fitted_

    indie_venue = {
        "id": 10,
        "name": "Artisanal Roaster",
        "district": "Södermalm",
        "scores": {"quality": 96, "discovery": 92, "freshness": 95},
        "independently_verified": True,
        "chain_status": "independent",
        "opening_hours": "07:30-17:00",
        "tags": ["specialty coffee"],
    }

    chain_venue = {
        "id": 20,
        "name": "Generic Coffee Chain",
        "district": "Norrmalm",
        "scores": {"quality": 35, "discovery": 15, "freshness": 50},
        "independently_verified": False,
        "chain_status": "chain",
        "tags": ["fast food"],
    }

    score_indie = ranker.predict_score(indie_venue)
    score_chain = ranker.predict_score(chain_venue)

    assert 0.0 <= score_indie <= 100.0
    assert 0.0 <= score_chain <= 100.0
    assert score_indie > score_chain, "High quality independent venue must outrank commercial chain"

    ranked = ranker.rank_places([chain_venue, indie_venue])
    assert ranked[0]["id"] == 10
    assert ranked[1]["id"] == 20


def test_counterfactual_ndcg_calculation():
    actual_rewards = [3.0, 1.5, 0.0]
    # Perfect ranking
    predicted_perfect = [90.0, 80.0, 40.0]
    positions = [0, 1, 2]

    ndcg_perfect = compute_counterfactual_ndcg(actual_rewards, predicted_perfect, positions)
    assert pytest.approx(ndcg_perfect, 0.001) == 1.0

    # Reversed ranking
    predicted_reversed = [40.0, 80.0, 90.0]
    ndcg_reversed = compute_counterfactual_ndcg(actual_rewards, predicted_reversed, positions)
    assert ndcg_reversed < ndcg_perfect
