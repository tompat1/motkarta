import pandas as pd

from scripts.model_discovery import fit_discovery_model


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
    assert "rating_residual" in result
    assert "discovery_percentile" in result
    assert "ml_lifecycle_state" in result
    assert "source_gap_flags" in result
    assert set(result["ml_lifecycle_state"]) == {"candidate"}
