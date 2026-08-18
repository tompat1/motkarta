"""
geojson_extractor.py
Motkarta Data Pipeline - Spatial Feature Engineering & RAG Synthesizer
Optimized for Antigravity IDE & Gemini Flash
"""

import json
import math
from pathlib import Path
import numpy as np
import pandas as pd
import geopandas as gpd
from sklearn.ensemble import IsolationForest

# Base32 alphabet for Geohashing
BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz"


def encode_geohash(latitude: float, longitude: float, precision: int = 7) -> str:
    """Encodes coordinates to a standard string geohash for spatial RAG indexing."""
    lat_interval = (-90.0, 90.0)
    lon_interval = (-180.0, 180.0)
    geohash = []
    bits = [16, 8, 4, 2, 1]
    bit = 0
    ch = 0
    is_even = True

    while len(geohash) < precision:
        if is_even:
            mid = (lon_interval[0] + lon_interval[1]) / 2.0
            if longitude > mid:
                ch |= bits[bit]
                lon_interval = (mid, lon_interval[1])
            else:
                lon_interval = (lon_interval[0], mid)
        else:
            mid = (lat_interval[0] + lat_interval[1]) / 2.0
            if latitude > mid:
                ch |= bits[bit]
                lat_interval = (mid, lat_interval[1])
            else:
                lat_interval = (lat_interval[0], mid)

        is_even = not is_even
        if bit < 4:
            bit += 1
        else:
            geohash.append(BASE32[ch])
            bit = 0
            ch = 0

    return "".join(geohash)


def detect_hidden_gems(gdf: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    """
    Uses an Isolation Forest to score venues based on structural outliers.
    Gems are high-quality, long-standing spots located in low-density commercial regions.
    """
    # Extract structural numerical attributes
    coords = np.array(list(zip(gdf.geometry.x, gdf.geometry.y)))

    # Calculate local spatial density (number of neighbors within ~300 meters)
    # 0.003 degrees is roughly 330m in Stockholm
    density_scores = []
    for point in coords:
        distances = np.linalg.norm(coords - point, axis=1)
        density_scores.append(np.sum(distances < 0.003))

    gdf["spatial_density"] = density_scores

    # Fill missing values for ML preparation
    if "custom_score" not in gdf.columns:
        if "score" in gdf.columns:
            gdf["custom_score"] = gdf["score"].fillna(5.0)
        elif "discovery_score" in gdf.columns:
            gdf["custom_score"] = (gdf["discovery_score"] / 10.0).fillna(5.0)
        else:
            gdf["custom_score"] = 5.0
    else:
        gdf["custom_score"] = gdf["custom_score"].fillna(5.0)

    # Feature matrix: We look for HIGH custom score but LOW spatial density (isolated enclaves)
    X = gdf[["spatial_density", "custom_score"]].to_numpy()

    if len(X) >= 5:
        # Train Unsupervised Isolation Forest
        clf = IsolationForest(contamination=0.15, random_state=42)
        preds = clf.fit_predict(X)
        scores = clf.decision_function(X)

        # Invert decision function: lower scores mean more anomalous (potential gems)
        # Scale between 0 and 10 for easier filtering
        min_s, max_s = scores.min(), scores.max()
        if max_s > min_s:
            gdf["gem_index"] = 10.0 * (1.0 - (scores - min_s) / (max_s - min_s))
        else:
            gdf["gem_index"] = 5.0
    else:
        gdf["gem_index"] = 5.0

    return gdf


def synthesize_rag_docs(geojson_path: str | Path, output_json_path: str | Path) -> list[dict]:
    """Reads map data, extracts features, and builds natural-language context text."""
    input_path = Path(geojson_path)
    output_path = Path(output_json_path)

    print(f"Loading GeoJSON data from {input_path}...")
    gdf = gpd.read_file(input_path)

    # Run the ML pipeline
    gdf = detect_hidden_gems(gdf)

    rag_documents = []

    for idx, row in gdf.iterrows():
        props = row["properties"] if "properties" in row and isinstance(row["properties"], dict) else row.to_dict()

        name = props.get("name", "Unnamed Independent Venue")
        amenity = props.get("establishment_type", props.get("amenity", props.get("shop", props.get("category", "food_establishment"))))
        lon, lat = float(row.geometry.x), float(row.geometry.y)
        geohash = encode_geohash(lat, lon, precision=7)

        # Build out clean structural feature strings
        vegan = "Offers vegan options" if props.get("diet:vegan") == "yes" or props.get("vegan") == "yes" else ""
        outdoor = "Features outdoor seating" if props.get("outdoor_seating") == "yes" or props.get("outdoor") == "yes" else ""
        wheelchair = "Wheelchair accessible" if props.get("wheelchair") == "yes" else ""
        features = ", ".join(filter(None, [vegan, outdoor, wheelchair]))

        gem_idx = float(row["gem_index"])
        custom_score = float(row["custom_score"])

        # Determine Gem Classification status
        is_gem = "Yes (Verified Local Structural Gem)" if gem_idx > 7.5 else "Standard Independent Spot"

        # Extract raw tags if dictionary or string
        tags_raw = props.get("tags", {})
        if isinstance(tags_raw, str):
            try:
                tags_raw = json.loads(tags_raw)
            except Exception:
                tags_raw = {}

        # Synthesize context-dense text paragraph for the vector tokenizer
        narrative = (
            f"Venue Name: {name}. Category: {amenity}. "
            f"Location: Stockholm, Geohash {geohash} (Coordinates: {lat:.5f}, {lon:.5f}). "
            f"Motkarta Baseline Score: {custom_score:.1f}/10. "
            f"Machine Learning Outlier Gem Index: {gem_idx:.1f}/10. "
            f"Hidden Gem Status: {is_gem}. "
            f"Physical Attributes: {features if features else 'Standard facilities'}. "
            f"OpenStreetMap Tags: {json.dumps(tags_raw)}."
        )

        doc = {
            "id": str(props.get("osm_id", props.get("id", str(idx)))),
            "name": name,
            "coordinates": [lat, lon],
            "geohash": geohash,
            "gem_index": round(gem_idx, 2),
            "custom_score": round(custom_score, 2),
            "text_content": narrative,
        }
        rag_documents.append(doc)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8") as f:
        json.dump(rag_documents, f, indent=2, ensure_ascii=False)

    print(f"Successfully synthesized {len(rag_documents)} RAG documents to {output_path}")
    return rag_documents


if __name__ == "__main__":
    import sys

    input_file = "outputs/stockholm_food_places.geojson"
    if not Path(input_file).exists() and Path("stockholm_map_data.geojson").exists():
        input_file = "stockholm_map_data.geojson"

    target_input = sys.argv[1] if len(sys.argv) > 1 else input_file
    target_output = sys.argv[2] if len(sys.argv) > 2 else "outputs/motkarta_rag_payload.json"

    synthesize_rag_docs(target_input, target_output)
