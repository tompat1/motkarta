"""Automated Dataset Drift & Fairness Monitoring for Motkarta.

Monitors:
1. Numeric feature drift via Population Stability Index (PSI) on scoring dimensions.
2. Categorical distribution drift via Jensen-Shannon Divergence on cuisines and districts.
3. Motkarta representation gates:
   - Outer-city venue ratio >= 0.30
   - Independent venue ratio >= 0.90
   - Cuisine Shannon entropy >= 2.5
"""

from __future__ import annotations

import argparse
import json
import math
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Sequence

import numpy as np
import pandas as pd
from scipy.spatial.distance import jensenshannon


INNER_DISTRICTS = {"södermalm", "norrmalm", "östermalm", "vasastan", "gamla stan", "kungsholmen", "gärdet"}


@dataclass(frozen=True)
class FeatureDriftResult:
    feature_name: str
    metric: str  # "PSI" or "JSD"
    value: float
    status: str  # "STABLE", "MODERATE_DRIFT", "CRITICAL_DRIFT"
    details: str


@dataclass(frozen=True)
class RepresentationGateResult:
    metric_name: str
    current_value: float
    threshold: float
    passed: bool
    details: str


@dataclass(frozen=True)
class DatasetDriftReport:
    overall_status: str  # "PASS", "WARNING", "FAIL"
    baseline_count: int
    current_count: int
    numeric_drifts: list[FeatureDriftResult]
    categorical_drifts: list[FeatureDriftResult]
    representation_gates: list[RepresentationGateResult]

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def calculate_psi(
    expected: Sequence[float],
    actual: Sequence[float],
    num_bins: int = 10,
    epsilon: float = 1e-4,
) -> float:
    """Calculate Population Stability Index (PSI) between expected and actual distributions."""
    exp_arr = np.array(expected, dtype=np.float64)
    act_arr = np.array(actual, dtype=np.float64)

    # Remove NaNs
    exp_arr = exp_arr[~np.isnan(exp_arr)]
    act_arr = act_arr[~np.isnan(act_arr)]

    if len(exp_arr) == 0 or len(act_arr) == 0:
        return 0.0

    # Determine bin edges from expected distribution percentiles
    quantiles = np.linspace(0, 100, num_bins + 1)
    bin_edges = np.percentile(exp_arr, quantiles)
    bin_edges[0] = -np.inf
    bin_edges[-1] = np.inf

    # Ensure strictly increasing edges to avoid empty duplicate bins
    for i in range(1, len(bin_edges) - 1):
        if bin_edges[i] <= bin_edges[i - 1]:
            bin_edges[i] = bin_edges[i - 1] + 1e-6

    exp_counts, _ = np.histogram(exp_arr, bins=bin_edges)
    act_counts, _ = np.histogram(act_arr, bins=bin_edges)

    exp_pct = exp_counts / max(1, len(exp_arr))
    act_pct = act_counts / max(1, len(act_arr))

    # Apply smoothing epsilon
    exp_pct = np.clip(exp_pct, epsilon, 1.0)
    act_pct = np.clip(act_pct, epsilon, 1.0)

    # Normalize after clip
    exp_pct /= np.sum(exp_pct)
    act_pct /= np.sum(act_pct)

    psi_value = float(np.sum((act_pct - exp_pct) * np.log(act_pct / exp_pct)))
    return max(0.0, round(psi_value, 4))


def classify_psi(psi: float) -> str:
    """Classify PSI magnitude."""
    if psi < 0.10:
        return "STABLE"
    elif psi < 0.25:
        return "MODERATE_DRIFT"
    return "CRITICAL_DRIFT"


def calculate_categorical_jsd(
    expected_categories: Sequence[str],
    actual_categories: Sequence[str],
) -> float:
    """Calculate Jensen-Shannon Divergence for categorical frequencies."""
    s_exp = pd.Series(expected_categories).str.strip().str.lower().value_counts()
    s_act = pd.Series(actual_categories).str.strip().str.lower().value_counts()

    all_cats = list(set(s_exp.index).union(set(s_act.index)))
    if not all_cats:
        return 0.0

    p_exp = np.array([s_exp.get(cat, 0.0) for cat in all_cats], dtype=np.float64)
    p_act = np.array([s_act.get(cat, 0.0) for cat in all_cats], dtype=np.float64)

    sum_exp = np.sum(p_exp)
    sum_act = np.sum(p_act)

    if sum_exp == 0 or sum_act == 0:
        return 0.0

    p_exp /= sum_exp
    p_act /= sum_act

    jsd = float(jensenshannon(p_exp, p_act))
    return max(0.0, min(1.0, round(jsd, 4)))


def calculate_shannon_entropy(labels: Sequence[str]) -> float:
    """Calculate Shannon entropy for a list of categorical labels."""
    cleaned = [str(x).strip().lower() for x in labels if str(x).strip()]
    if not cleaned:
        return 0.0
    series = pd.Series(cleaned).value_counts(normalize=True)
    entropy = -float(np.sum(series * np.log2(series)))
    return round(entropy, 4)


def evaluate_dataset_drift(
    baseline_places: list[dict[str, Any]],
    current_places: list[dict[str, Any]],
) -> DatasetDriftReport:
    """Evaluate drift and representation invariants between two dataset snapshots."""
    numeric_drifts: list[FeatureDriftResult] = []
    categorical_drifts: list[FeatureDriftResult] = []
    representation_gates: list[RepresentationGateResult] = []

    # 1. Numeric Score PSI
    score_fields = ["quality", "discovery", "freshness", "recommendation"]
    for field in score_fields:
        exp_scores = [
            float(p.get("scores", {}).get(field, 50.0))
            for p in baseline_places
            if isinstance(p.get("scores"), dict)
        ]
        act_scores = [
            float(p.get("scores", {}).get(field, 50.0))
            for p in current_places
            if isinstance(p.get("scores"), dict)
        ]
        if exp_scores and act_scores:
            psi = calculate_psi(exp_scores, act_scores)
            status = classify_psi(psi)
            numeric_drifts.append(
                FeatureDriftResult(
                    feature_name=f"scores.{field}",
                    metric="PSI",
                    value=psi,
                    status=status,
                    details=f"PSI={psi:.4f} ({status})",
                )
            )

    # 2. Categorical JSD
    exp_districts = [str(p.get("district") or p.get("area") or "") for p in baseline_places]
    act_districts = [str(p.get("district") or p.get("area") or "") for p in current_places]
    dist_jsd = calculate_categorical_jsd(exp_districts, act_districts)
    categorical_drifts.append(
        FeatureDriftResult(
            feature_name="district",
            metric="JSD",
            value=dist_jsd,
            status="CRITICAL_DRIFT" if dist_jsd > 0.25 else "MODERATE_DRIFT" if dist_jsd > 0.15 else "STABLE",
            details=f"District Jensen-Shannon Divergence = {dist_jsd:.4f}",
        )
    )

    exp_cuisines = [str(p.get("cuisine") or "") for p in baseline_places if p.get("cuisine")]
    act_cuisines = [str(p.get("cuisine") or "") for p in current_places if p.get("cuisine")]
    cuisine_jsd = calculate_categorical_jsd(exp_cuisines, act_cuisines)
    categorical_drifts.append(
        FeatureDriftResult(
            feature_name="cuisine",
            metric="JSD",
            value=cuisine_jsd,
            status="CRITICAL_DRIFT" if cuisine_jsd > 0.25 else "MODERATE_DRIFT" if cuisine_jsd > 0.15 else "STABLE",
            details=f"Cuisine Jensen-Shannon Divergence = {cuisine_jsd:.4f}",
        )
    )

    # 3. Representation Invariant Gates
    n_current = max(1, len(current_places))

    # Outer city ratio
    outer_count = sum(
        1
        for p in current_places
        if str(p.get("district") or p.get("area") or "").lower() not in INNER_DISTRICTS
    )
    outer_ratio = round(outer_count / n_current, 4)
    representation_gates.append(
        RepresentationGateResult(
            metric_name="outer_city_ratio",
            current_value=outer_ratio,
            threshold=0.30,
            passed=outer_ratio >= 0.30,
            details=f"Outer city ratio {outer_ratio:.2%} (minimum required: 30%)",
        )
    )

    # Independent ratio
    independent_count = sum(
        1 for p in current_places if str(p.get("chain_status", "")).lower() != "chain"
    )
    independent_ratio = round(independent_count / n_current, 4)
    representation_gates.append(
        RepresentationGateResult(
            metric_name="independent_ratio",
            current_value=independent_ratio,
            threshold=0.90,
            passed=independent_ratio >= 0.90,
            details=f"Independent business ratio {independent_ratio:.2%} (minimum required: 90%)",
        )
    )

    # Cuisine Shannon entropy
    all_cuisines = [str(p.get("cuisine")) for p in current_places if p.get("cuisine")]
    entropy = calculate_shannon_entropy(all_cuisines)
    entropy_threshold = min(2.5, round(math.log2(max(1, len(all_cuisines))), 2)) if len(all_cuisines) < 10 else 2.5
    representation_gates.append(
        RepresentationGateResult(
            metric_name="cuisine_shannon_entropy",
            current_value=entropy,
            threshold=entropy_threshold,
            passed=entropy >= entropy_threshold,
            details=f"Cuisine Shannon entropy {entropy:.2f} (minimum diversity: {entropy_threshold:.2f})",
        )
    )

    # Determine overall status
    has_critical_drift = any(d.status == "CRITICAL_DRIFT" for d in numeric_drifts + categorical_drifts)
    has_failed_gates = any(not g.passed for g in representation_gates)
    has_moderate_drift = any(d.status == "MODERATE_DRIFT" for d in numeric_drifts + categorical_drifts)

    if has_critical_drift or has_failed_gates:
        overall = "FAIL"
    elif has_moderate_drift:
        overall = "WARNING"
    else:
        overall = "PASS"

    return DatasetDriftReport(
        overall_status=overall,
        baseline_count=len(baseline_places),
        current_count=len(current_places),
        numeric_drifts=numeric_drifts,
        categorical_drifts=categorical_drifts,
        representation_gates=representation_gates,
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Evaluate dataset drift and fairness invariants.")
    parser.add_argument("--baseline", required=True, type=Path, help="Path to baseline places JSON.")
    parser.add_argument("--current", required=True, type=Path, help="Path to current places JSON.")
    parser.add_argument("--output", type=Path, default=None, help="Optional output path for drift report JSON.")
    args = parser.parse_args()

    with open(args.baseline, encoding="utf-8") as f:
        data_base = json.load(f)
        base_places = data_base if isinstance(data_base, list) else data_base.get("places", [])

    with open(args.current, encoding="utf-8") as f:
        data_curr = json.load(f)
        curr_places = data_curr if isinstance(data_curr, list) else data_curr.get("places", [])

    report = evaluate_dataset_drift(base_places, curr_places)
    report_dict = report.to_dict()

    print(json.dumps(report_dict, indent=2))

    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        with open(args.output, "w", encoding="utf-8") as f:
            json.dump(report_dict, f, indent=2)

    if report.overall_status == "FAIL":
        raise SystemExit(1)


if __name__ == "__main__":
    main()
