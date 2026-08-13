"""Run Ranking A (Raw Popularity) vs Ranking B (Transparent Multi-Signal) A/B Evaluation.

Usage:
    python scripts/evaluate_ranking_experiment.py
"""

import json
from pathlib import Path
import pandas as pd
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from motkarta.evaluation import evaluate_ranking_experiment


def main():
    root = Path(__file__).resolve().parents[1]
    input_csv = root / "data" / "stockholm_food_places_scored.csv"
    output_json = root / "outputs" / "ranking_ab_experiment.json"

    if not input_csv.exists():
        input_csv = root / "data" / "stockholm_food_places.csv"

    if not input_csv.exists():
        print(f"Error: Neither scored nor raw places CSV found at {input_csv}")
        return

    df = pd.read_csv(input_csv)
    if "discovery_score" not in df:
        df["discovery_score"] = 50
    if "review_count" not in df:
        df["review_count"] = 0
    if "neighbourhood" not in df:
        df["neighbourhood"] = "Stockholm"

    res = evaluate_ranking_experiment(df, top_n=20)
    output_data = {
        "hypothesis": "Users receiving transparent multi-signal ranking discover a significantly wider range of relevant establishments without reporting lower recommendation satisfaction.",
        "hypothesis_confirmed": res.hypothesis_confirmed,
        "ranking_a_raw_popularity": res.ranking_a_metrics,
        "ranking_b_transparent_multisignal": res.ranking_b_metrics,
        "summary": res.summary,
    }

    output_json.parent.mkdir(parents=True, exist_ok=True)
    output_json.write_text(json.dumps(output_data, indent=2) + "\n", encoding="utf-8")
    print(f"Saved ranking experiment results to {output_json}")
    print(res.summary)


if __name__ == "__main__":
    main()
