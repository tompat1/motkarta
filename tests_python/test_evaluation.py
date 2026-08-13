import pandas as pd
from motkarta.evaluation import compute_recommendation_confidence, evaluate_ranking_experiment


def test_compute_recommendation_confidence():
    high_conf = compute_recommendation_confidence(
        sources_count=3,
        recent_observations=12,
        independently_verified=True,
        last_verified_date="2026-08-13",
    )
    assert high_conf.confidence == "High"
    assert "High—verified by 3 independent sources." in high_conf.explanation

    low_conf = compute_recommendation_confidence(
        sources_count=0,
        recent_observations=1,
        independently_verified=False,
    )
    assert low_conf.confidence == "Low"


def test_evaluate_ranking_experiment_confirms_hypothesis():
    df = pd.DataFrame([
        {
            "name": "Central Chain",
            "cuisine": "burger",
            "neighbourhood": "Central Stockholm",
            "review_count": 8000,
            "discovery_score": 25,
            "independent_business": False,
        },
        {
            "name": "Central Famous Cafe",
            "cuisine": "coffee",
            "neighbourhood": "Central Stockholm",
            "review_count": 5000,
            "discovery_score": 35,
            "independent_business": True,
        },
        {
            "name": "Farsta Bakery",
            "cuisine": "bakery",
            "neighbourhood": "South Stockholm",
            "review_count": 45,
            "discovery_score": 85,
            "independent_business": True,
        },
        {
            "name": "Sundbyberg Georgian",
            "cuisine": "georgian",
            "neighbourhood": "North Stockholm",
            "review_count": 30,
            "discovery_score": 90,
            "independent_business": True,
        },
    ])

    res = evaluate_ranking_experiment(df, top_n=2)
    assert res.hypothesis_confirmed
    assert res.ranking_b_metrics["unfamiliar_discovery_ratio"] > res.ranking_a_metrics["unfamiliar_discovery_ratio"]
    assert res.ranking_b_metrics["outer_city_ratio"] > res.ranking_a_metrics["outer_city_ratio"]
