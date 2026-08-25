import pandas as pd

from motkarta.outliers import process_motkarta_gems


def test_structural_anomaly_never_becomes_hidden_gem_without_evidence_gates():
    frame = pd.DataFrame(
        {
            "latitude": [59.30 + index * 0.001 for index in range(20)],
            "longitude": [18.00 + index * 0.001 for index in range(20)],
            "raw_tags": ["website;opening_hours"] * 19 + [";".join(f"tag{i}" for i in range(30))],
            "osm_version": [1] * 19 + [25],
            "specialty_verified": [False] * 20,
            "opening_hours": ["Mo-Fr 08:00-17:00"] * 20,
        }
    )

    result = process_motkarta_gems(frame, contamination=0.1)

    assert "structural_anomaly_score" in result
    assert "is_structural_anomaly" in result
    assert "structural_interest_index" in result
    assert not result["is_hidden_gem"].any()
