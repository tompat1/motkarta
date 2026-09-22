from __future__ import annotations

import json
from pathlib import Path

from execution.url_blocklist import (
    UrlBlocklist,
    classify_error,
    normalize_url,
)
from execution.enrich_catalog import WebsiteScraper


def test_normalize_url() -> None:
    assert normalize_url("https://example.com/") == "https://example.com"
    assert normalize_url("http://example.com:80/path/") == "http://example.com/path"
    assert normalize_url("https://example.com:443/menu") == "https://example.com/menu"
    assert normalize_url("   example.com/cafe   ") == "https://example.com/cafe"
    assert normalize_url("") == ""


def test_classify_error() -> None:
    cat, msg, code = classify_error(None, status_code=404)
    assert cat == "HTTP 404"
    assert code == 404

    cat, msg, code = classify_error(None, status_code=403)
    assert cat == "HTTP 403"
    assert code == 403

    cat, msg, code = classify_error("Connection timed out waiting for response")
    assert cat == "Timeout"

    cat, msg, code = classify_error("certificate verify failed")
    assert cat == "SSL Error"

    cat, msg, code = classify_error("Connection refused by remote host")
    assert cat == "Connection Refused"


def test_url_blocklist_lifecycle(tmp_path: Path) -> None:
    blocklist_file = tmp_path / "blocklist.json"
    report_file = tmp_path / "report.json"

    bl = UrlBlocklist(blocklist_path=blocklist_file, report_path=report_file)
    assert len(bl.entries) == 0
    assert not bl.is_blocked("https://broken-cafe.se")

    # Record an error
    entry = bl.record_error(
        "https://broken-cafe.se/",
        place_id=101,
        place_name="Broken Café",
        error="HTTP Error 404: Not Found",
        status_code=404,
    )
    assert entry["errorType"] == "HTTP 404"
    assert entry["statusCode"] == 404
    assert entry["placeId"] == 101
    assert entry["failCount"] == 1

    # Check is_blocked with trailing slash variation
    assert bl.is_blocked("https://broken-cafe.se")
    assert bl.is_blocked("https://broken-cafe.se/")

    # Record error again -> increments failCount
    entry2 = bl.record_error(
        "https://broken-cafe.se",
        error="HTTP Error 404: Not Found",
        status_code=404,
    )
    assert entry2["failCount"] == 2

    # Save to disk
    bl.save()
    assert blocklist_file.exists()

    # Reload from disk
    bl2 = UrlBlocklist(blocklist_path=blocklist_file, report_path=report_file)
    assert bl2.is_blocked("https://broken-cafe.se")
    assert bl2.get_blocked_entry("https://broken-cafe.se")["failCount"] == 2

    # Unblock
    assert bl2.unblock("https://broken-cafe.se")
    assert not bl2.is_blocked("https://broken-cafe.se")
    bl2.save()

    bl3 = UrlBlocklist(blocklist_path=blocklist_file, report_path=report_file)
    assert not bl3.is_blocked("https://broken-cafe.se")


def test_save_run_report(tmp_path: Path) -> None:
    blocklist_file = tmp_path / "blocklist.json"
    report_file = tmp_path / "report.json"

    bl = UrlBlocklist(blocklist_path=blocklist_file, report_path=report_file)
    bl.record_error(
        "https://offline.example.com",
        place_id=999,
        place_name="Offline Place",
        error="Host unreachable",
    )

    report = bl.save_run_report(
        run_id="test-run-1",
        start_time=100.0,
        total_checked=10,
        successful_count=8,
        failed_count=2,
        skipped_blocked_count=1,
        newly_blocked_count=1,
        recent_errors=[{"url": "https://offline.example.com", "errorType": "Network Error"}],
    )

    assert report["runId"] == "test-run-1"
    assert report_file.exists()
    data = json.loads(report_file.read_text(encoding="utf-8"))
    assert data["runId"] == "test-run-1"
    assert data["summary"]["totalVenuesChecked"] == 10
    assert data["summary"]["successfulScrapes"] == 8
    assert data["summary"]["skippedBlockedUrls"] == 1
    assert len(data["blocklist"]) == 1


def test_website_scraper_respects_blocklist(tmp_path: Path) -> None:
    blocklist_file = tmp_path / "blocklist.json"
    bl = UrlBlocklist(blocklist_path=blocklist_file)
    bl.record_error("https://do-not-scrape.com", place_id=5, place_name="Skip Me", status_code=500)

    scraper = WebsiteScraper(cache_dir=tmp_path / "cache", blocklist=bl)

    # Blocked URL should immediately return None without attempting HTTP request
    result = scraper.fetch_url("https://do-not-scrape.com")
    assert result is None
