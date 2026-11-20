"""Unit tests for the monthly curated open sources refresher."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from scripts.refresh_curated_sources import CURATED_SOURCE_SPECS, refresh_curated_sources


def test_refresh_curated_sources_offline_covers_all_16_sources(tmp_path: Path) -> None:
    output = tmp_path / "curated_sources_status.json"
    report = refresh_curated_sources(output_file=output, offline=True, quiet=True)

    assert output.exists()
    assert report["totalSources"] == 16
    assert len(report["sources"]) == 16
    assert report["schedule"] == "0 4 1 * *"
    assert report["cadence"] == "monthly"
    assert report["offline"] is True

    ids = {item["id"] for item in report["sources"]}
    expected_ids = {spec.id for spec in CURATED_SOURCE_SPECS}
    assert ids == expected_ids

    # Every source should carry a fresh ISO timestamp and audit status
    for item in report["sources"]:
        assert item["lastScrapedAt"].endswith("Z")
        assert item["status"] in {"PASS", "FAIL"}
        assert isinstance(item["coveragePercent"], (int, float))


def test_refresh_curated_sources_detects_changes_and_handles_http_errors(tmp_path: Path) -> None:
    output = tmp_path / "curated_sources_status.json"

    def fake_probe_initial(url: str, timeout: int = 12) -> dict[str, Any]:
        if "dn.se" in url:
            return {
                "reachable": False,
                "httpStatus": 403,
                "etag": None,
                "lastModified": None,
                "contentHash": None,
                "error": "HTTP 403",
            }
        return {
            "reachable": True,
            "httpStatus": 200,
            "etag": '"v1"',
            "lastModified": None,
            "contentHash": "aaaa1111bbbb2222",
            "error": None,
        }

    first = refresh_curated_sources(
        output_file=output,
        offline=False,
        probe_fn=fake_probe_initial,
        quiet=True,
    )
    assert first["reachableSources"] == 15
    assert first["changedSources"] == 0

    def fake_probe_updated(url: str, timeout: int = 12) -> dict[str, Any]:
        if "visitstockholm" in url:
            return {
                "reachable": True,
                "httpStatus": 200,
                "etag": '"v2"',
                "lastModified": None,
                "contentHash": "cccc3333dddd4444",
                "error": None,
            }
        return fake_probe_initial(url, timeout=timeout)

    second = refresh_curated_sources(
        output_file=output,
        offline=False,
        probe_fn=fake_probe_updated,
        quiet=True,
    )
    assert second["changedSources"] == 1
    persisted = json.loads(output.read_text(encoding="utf-8"))
    visit = next(s for s in persisted["sources"] if s["id"] == "visit-stockholm")
    assert visit["changedSincePrevious"] is True
    dn = next(s for s in persisted["sources"] if s["id"] == "dn-krog")
    assert dn["reachable"] is False
    assert dn["httpStatus"] == 403
