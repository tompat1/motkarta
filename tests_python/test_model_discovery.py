import numpy as np
import pandas as pd
import pytest

from scripts.model_discovery import MODEL_VERSION, fit_discovery_model


def test_fit_discovery_model_adds_residual_columns():
    frame = pd.DataFrame(
        {
            "name": ["A", "B", "C", "D", "E"],
            "platform_rating": [4.1, 4.6, 3.9, 4.4, 4.8],
            "review_count": [10, 50, 100, 250, 25],
            "price_level": [2, 2, 3, 4, 2],
            "latitude": [59.3, 59.31, 59.32, 59.33, 59.34],
            "longitude": [18.0, 18.01, 18.02, 18.03, 18.04],
            "category": ["cafe", "bakery", "restaurant", "restaurant", "coffee_roaster"],
            "cuisine": ["coffee", "bakery", "thai", "nordic", "coffee"],
            "district": ["A", "A", "B", "B", "C"],
            "chain_status": ["independent", "independent", "unknown", "unknown", "independent"],
        }
    )

    result = fit_discovery_model(frame)

    assert "expected_platform_rating" in result
    assert "expected_platform_rating_oof" in result
    assert "rating_residual" in result
    assert "residual_lower_bound" in result
    assert "residual_upper_bound" in result
    assert "underexposure_confidence" in result
    assert "residual_interval_radius" in result
    assert "discovery_percentile" in result
    assert "ml_fold_id" in result
    assert "ml_validation_strategy" in result
    assert "ml_model_version" in result
    assert "ml_lifecycle_state" in result
    assert "source_gap_flags" in result
    assert set(result["ml_lifecycle_state"]) == {"candidate"}
    assert set(result["ml_model_version"]) == {MODEL_VERSION}
    assert result["ml_fold_id"].ge(0).all()
    assert result["expected_platform_rating"].equals(result["expected_platform_rating_oof"])
    assert result["underexposure_confidence"].between(0, 1).all()
    assert (result["residual_lower_bound"] <= result["rating_residual"]).all()
    assert (result["rating_residual"] <= result["residual_upper_bound"]).all()
    assert "Out-of-fold residual" in result.iloc[0]["ml_candidate_reason"]
    assert result.attrs["diagnostics"].validation_strategy.startswith("spatial_group_")


def test_fit_discovery_model_is_deterministic_and_validates_inputs():
    rows = 30
    frame = pd.DataFrame(
        {
            "platform_rating": np.linspace(3.2, 4.9, rows),
            "review_count": np.arange(1, rows + 1) * 7,
            "price_level": np.tile([1, 2, 3], 10),
            "latitude": 59.25 + np.arange(rows) * 0.004,
            "longitude": 17.9 + np.arange(rows) * 0.004,
            "category": np.tile(["cafe", "bakery", "restaurant"], 10),
            "cuisine": np.tile(["coffee", "bakery", "thai"], 10),
            "district": np.tile(["north", "central", "south"], 10),
            "chain_status": "independent",
        }
    )

    first = fit_discovery_model(frame).sort_index()
    second = fit_discovery_model(frame).sort_index()
    np.testing.assert_allclose(first["expected_platform_rating_oof"], second["expected_platform_rating_oof"])

    with pytest.raises(ValueError, match="Missing required"):
        fit_discovery_model(frame.drop(columns=["platform_rating"]))

    with pytest.raises(ValueError, match="at least four"):
        fit_discovery_model(frame.head(3))
