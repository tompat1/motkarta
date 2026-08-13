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
    return data.sort_values("rating_residual", ascending=False)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("input_csv")
    parser.add_argument("--output", default="data/stockholm_discovery_scores.csv")
    args = parser.parse_args()
    fit_discovery_model(pd.read_csv(args.input_csv)).to_csv(args.output, index=False)
    print(f"Saved discovery analysis to {args.output}")

if __name__ == "__main__":
    main()
