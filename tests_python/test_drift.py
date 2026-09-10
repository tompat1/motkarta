"""Unit tests for Motkarta automated dataset drift and fairness monitoring."""

import json
from pathlib import Path
import pytest
from motkarta.drift import (
    calculate_psi,
    classify_psi,
    calculate_categorical_jsd,
    calculate_shannon_entropy,
    evaluate_dataset_drift,
)

ROOT = Path(__file__).resolve().parents[1]
PLACES_FILE = ROOT / "public" / "data" / "places.json"


def test_calculate_psi_identical_distribution():
    data = [10.0, 20.0, 30.0, 40.0, 50.0, 60.0, 70.0, 80.0, 90.0, 100.0]
    psi = calculate_psi(data, data)
    assert psi == 0.0
    assert classify_psi(psi) == "STABLE"


def test_calculate_psi_detects_shift():
    baseline = [10.0, 15.0, 20.0, 25.0, 30.0, 35.0, 40.0, 45.0, 50.0]
    # Heavy upward shift
    shifted = [70.0, 75.0, 80.0, 85.0, 90.0, 95.0, 98.0, 99.0, 100.0]
    psi = calculate_psi(baseline, shifted)
    assert psi > 0.25
    assert classify_psi(psi) == "CRITICAL_DRIFT"


def test_categorical_jsd_matching_and_divergent():
    base = ["Swedish", "Italian", "Japanese", "French"]
    same = ["Swedish", "Italian", "Japanese", "French"]
    jsd_same = calculate_categorical_jsd(base, same)
    assert jsd_same == 0.0

    different = ["Pizza", "Burger", "Fast Food", "Tacos"]
    jsd_diff = calculate_categorical_jsd(base, different)
    assert jsd_diff > 0.5


def test_shannon_entropy():
    diverse = ["Italian", "French", "Japanese", "Thai", "Swedish", "Ethiopian", "Korean", "Mexican"]
    entropy_diverse = calculate_shannon_entropy(diverse)
    assert entropy_diverse > 2.5

    monoculture = ["Burger", "Burger", "Burger", "Burger"]
    entropy_mono = calculate_shannon_entropy(monoculture)
    assert entropy_mono == 0.0


def test_evaluate_dataset_drift_representation_gates():
    baseline = [
        {"id": 1, "district": "Södermalm", "chain_status": "independent", "cuisine": "Swedish", "scores": {"quality": 85, "discovery": 80}},
        {"id": 2, "district": "Vasastan", "chain_status": "independent", "cuisine": "Italian", "scores": {"quality": 82, "discovery": 75}},
        {"id": 3, "district": "Hägersten", "chain_status": "independent", "cuisine": "Japanese", "scores": {"quality": 88, "discovery": 85}},
        {"id": 4, "district": "Sundbyberg", "chain_status": "independent", "cuisine": "French", "scores": {"quality": 90, "discovery": 90}},
    ]
    current = list(baseline)

    report = evaluate_dataset_drift(baseline, current)
    assert report.overall_status == "PASS"

    gate_dict = {g.metric_name: g for g in report.representation_gates}
    assert gate_dict["outer_city_ratio"].passed  # 2 of 4 (50%) >= 30%
    assert gate_dict["independent_ratio"].passed  # 4 of 4 (100%) >= 90%


def test_evaluate_dataset_drift_live_places_smoke():
    if not PLACES_FILE.exists():
        pytest.skip("places.json not present locally")

    with open(PLACES_FILE, encoding="utf-8") as f:
        data = json.load(f)
        places = data if isinstance(data, list) else data.get("places", [])

    report = evaluate_dataset_drift(places, places)
    # Self-comparison should have zero PSI drift and stable metrics
    for d in report.numeric_drifts:
        assert d.status == "STABLE"
    assert report.baseline_count == len(places)
