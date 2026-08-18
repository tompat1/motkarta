from __future__ import annotations

import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler


def calculate_spatial_density(latitudes: pd.Series, longitudes: pd.Series, radius_meters: float = 300.0) -> pd.Series:
    """Calculate the count of nearby amenities within radius_meters using Haversine distance."""
    if len(latitudes) == 0:
        return pd.Series([], dtype=float)

    # Convert degrees to radians for Haversine metric in scikit-learn / numpy
    coords_rad = np.radians(np.column_stack((latitudes.values, longitudes.values)))
    earth_radius_m = 6371000.0
    radius_rad = radius_meters / earth_radius_m

    # Use pairwise distance or spatial tree if available
    try:
        from sklearn.neighbors import BallTree
        tree = BallTree(coords_rad, metric="haversine")
        counts = tree.query_radius(coords_rad, r=radius_rad, count_only=True)
        # Subtract 1 so a node does not count itself as a neighbor
        return pd.Series(np.maximum(0, counts - 1), index=latitudes.index, dtype=float)
    except Exception:
        # Fallback to direct numpy distance matrix
        densities = []
        for i in range(len(coords_rad)):
            dlat = coords_rad[:, 0] - coords_rad[i, 0]
            dlon = coords_rad[:, 1] - coords_rad[i, 1]
            a = np.sin(dlat / 2.0) ** 2 + np.cos(coords_rad[i, 0]) * np.cos(coords_rad[:, 0]) * np.sin(dlon / 2.0) ** 2
            dists_m = 2 * earth_radius_m * np.arcsin(np.sqrt(np.clip(a, 0, 1)))
            nearby = np.sum(dists_m <= radius_meters) - 1
            densities.append(max(0, nearby))
        return pd.Series(densities, index=latitudes.index, dtype=float)


def compute_tag_complexity(raw_tags_series: pd.Series) -> pd.Series:
    """Calculate tag complexity based on count of non-trivial metadata tags."""
    complexities = []
    for val in raw_tags_series:
        if isinstance(val, dict):
            # Ignore standard primary amenity tags
            filtered = {k: v for k, v in val.items() if k not in ("amenity", "name", "shop", "cuisine")}
            complexities.append(len(filtered))
        elif isinstance(val, list):
            complexities.append(len(val))
        elif isinstance(val, str) and val.strip():
            # If comma or JSON string
            complexities.append(len([t for t in val.split(";") if t.strip()]))
        else:
            complexities.append(0)
    return pd.Series(complexities, index=raw_tags_series.index, dtype=float)


def compute_historic_longevity(df: pd.DataFrame) -> pd.Series:
    """Calculate estimated longevity from version or timestamp metadata."""
    longevities = []
    for _, row in df.iterrows():
        version = float(row.get("osm_version", 1) or 1)
        # Higher version or confirmed presence increases longevity score
        longevities.append(version * 2.5 + (10 if row.get("specialty_verified") else 0))
    return pd.Series(longevities, index=df.index, dtype=float)


def compute_opening_hours_score(df: pd.DataFrame) -> pd.Series:
    """Score operational stability based on opening hours availability."""
    scores = []
    for _, row in df.iterrows():
        hours = str(row.get("opening_hours") or "").strip()
        if not hours or hours == "nan" or "Missing" in hours:
            scores.append(10.0)
        elif "24/7" in hours:
            scores.append(100.0)
        else:
            # Estimate score based on length and detail of hours specification
            scores.append(min(90.0, 30.0 + len(hours) * 1.5))
    return pd.Series(scores, index=df.index, dtype=float)


def process_motkarta_gems(df: pd.DataFrame, contamination: float = 0.07, random_state: int = 42) -> pd.DataFrame:
    """Process DataFrame through feature engineering & Isolation Forest to flag hidden gems."""
    res = df.copy()

    # 1. Feature Engineering
    if "latitude" in res.columns and "longitude" in res.columns:
        res["spatial_density_300m"] = calculate_spatial_density(res["latitude"], res["longitude"])
    else:
        res["spatial_density_300m"] = 0.0

    if "raw_tags" in res.columns:
        res["tag_complexity"] = compute_tag_complexity(res["raw_tags"])
    elif "tags" in res.columns:
        res["tag_complexity"] = compute_tag_complexity(res["tags"])
    else:
        res["tag_complexity"] = 0.0

    res["historic_longevity"] = compute_historic_longevity(res)
    res["opening_hours_score"] = compute_opening_hours_score(res)

    # 2. Organic Hidden Gem Index
    res["gem_index"] = (res["tag_complexity"] * res["historic_longevity"]) / (res["spatial_density_300m"] + 1.0)

    # 3. Isolation Forest Outlier Pass
    feature_cols = ["spatial_density_300m", "tag_complexity", "opening_hours_score", "historic_longevity"]
    X = res[feature_cols].fillna(0.0)

    if len(X) >= 10:
        scaler = StandardScaler()
        X_scaled = scaler.fit_transform(X)

        iso_forest = IsolationForest(contamination=contamination, random_state=random_state)
        res["anomaly_score"] = iso_forest.fit_predict(X_scaled)

        median_gem_index = res["gem_index"].median()
        # Anomaly score -1 indicates structural outlier
        res["is_hidden_gem"] = (res["anomaly_score"] == -1) & (res["gem_index"] >= median_gem_index)
    else:
        res["anomaly_score"] = 1
        res["is_hidden_gem"] = False

    return res
