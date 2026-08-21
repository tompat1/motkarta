"""Prototype Lauren Leek-inspired residual discovery model.

The model predicts a platform-typical rating from structural/exposure features.
Positive residuals indicate algorithmic surprise, not objective food quality.
Expected input columns are documented in README.md.
"""
import argparse
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.impute import SimpleImputer
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

NUMERIC = ["review_count", "price_level", "latitude", "longitude"]
CATEGORICAL = ["category", "cuisine", "district", "chain_status"]

def fit_discovery_model(frame: pd.DataFrame) -> pd.DataFrame:
    data = frame.copy()
    data["log_review_count"] = np.log1p(data["review_count"])
    numeric = ["log_review_count", "price_level", "latitude", "longitude"]
    prep = ColumnTransformer([
        ("numeric", Pipeline([("impute", SimpleImputer(strategy="median")), ("scale", StandardScaler())]), numeric),
        ("category", Pipeline([("impute", SimpleImputer(strategy="most_frequent")), ("encode", OneHotEncoder(handle_unknown="ignore", sparse_output=False))]), CATEGORICAL),
    ])
    pipeline = Pipeline([("prepare", prep), ("model", HistGradientBoostingRegressor(max_iter=200, learning_rate=.06, random_state=42))])
    features = numeric + CATEGORICAL
    pipeline.fit(data[features], data["platform_rating"])
    data["expected_platform_rating"] = pipeline.predict(data[features])
    data["rating_residual"] = data["platform_rating"] - data["expected_platform_rating"]
    data["discovery_percentile"] = data["rating_residual"].rank(pct=True).round(4)
    data["ml_lifecycle_state"] = "candidate"
    data["ml_allowed_use"] = "Assistant proposal only; evidence gates decide user-facing hidden-gem confidence."
    data["source_gap_flags"] = data.apply(source_gap_flags, axis=1)
    data["ml_candidate_reason"] = data.apply(ml_candidate_reason, axis=1)
    return data.sort_values("rating_residual", ascending=False)


def source_gap_flags(row: pd.Series) -> str:
    gaps = []
    evidence_count = optional_float(row.get("independent_evidence_count"), default=0)
    if evidence_count < 2:
        gaps.append("needs_two_independent_evidence_signals")
    if not truthy(row.get("current_existence_verified")) and not row.get("latest_verified_date"):
        gaps.append("needs_current_existence_check")
    if not truthy(row.get("distinctiveness_verified")):
        cuisine = str(row.get("cuisine") or "").lower()
        category = str(row.get("category") or "").lower()
        if cuisine in {"", "general", "restaurant", "cafe", "coffee"} or category in {"", "restaurant", "cafe"}:
            gaps.append("needs_distinctiveness_reason")
    return ";".join(gaps) or "no_obvious_source_gap"


def ml_candidate_reason(row: pd.Series) -> str:
    return (
        f"Residual surprise {row['rating_residual']:.3f} at percentile {row['discovery_percentile']:.4f}; "
        f"review gaps before promotion: {row['source_gap_flags']}."
    )


def optional_float(value: object, default: float = 0.0) -> float:
    try:
        if pd.isna(value):
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def truthy(value: object) -> bool:
    return str(value).strip().lower() in {"1", "true", "yes", "y"}

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("input_csv")
    parser.add_argument("--output", default="data/stockholm_discovery_scores.csv")
    args = parser.parse_args()
    fit_discovery_model(pd.read_csv(args.input_csv)).to_csv(args.output, index=False)
    print(f"Saved discovery analysis to {args.output}")

if __name__ == "__main__":
    main()
