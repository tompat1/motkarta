#!/usr/bin/env python3
"""URL error blocklist and run report manager for Motkarta enrichment pipelines.

Maintains a persistent list of unreachable or broken venue URLs so subsequent
enrichment and photo-scraping passes skip them immediately, preventing timeouts
and quota exhaustion.

Also generates public/data/enrichment_run_report.json after each run for
administrative review and visibility in the Motkarta Admin Dashboard.
"""

from __future__ import annotations

import json
import socket
import ssl
import time
import urllib.error
import urllib.parse
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_BLOCKLIST_PATH = ROOT / "public" / "data" / "enrichment_url_blocklist.json"
DEFAULT_REPORT_PATH = ROOT / "public" / "data" / "enrichment_run_report.json"


def normalize_url(url: str) -> str:
    """Normalize URL for consistent lookup across different protocols and trailing slashes."""
    if not url:
        return ""
    url = url.strip()
    if not url.startswith(("http://", "https://")):
        url = "https://" + url

    try:
        parsed = urllib.parse.urlsplit(url)
        scheme = parsed.scheme.lower()
        netloc = parsed.netloc.lower()
        # Remove standard default ports
        if netloc.endswith(":80") and scheme == "http":
            netloc = netloc[:-3]
        elif netloc.endswith(":443") and scheme == "https":
            netloc = netloc[:-4]

        # Strip trailing slash on empty/root path
        path = parsed.path
        if path in ("", "/"):
            path = ""
        else:
            path = path.rstrip("/")

        query = parsed.query
        return urllib.parse.urlunsplit((scheme, netloc, path, query, ""))
    except Exception:
        return url.rstrip("/").lower()


def classify_error(
    error: Exception | str | None,
    status_code: int | None = None,
) -> tuple[str, str, int | None]:
    """Classify an HTTP or network exception into a clean category and message."""
    if status_code and 300 <= status_code <= 399:
        return f"HTTP {status_code}", str(error or f"Redirect error ({status_code})"), status_code

    if status_code and 400 <= status_code <= 599:
        msg = f"HTTP {status_code}"
        if status_code == 404:
            return "HTTP 404", "Page Not Found (404)", 404
        if status_code == 403:
            return "HTTP 403", "Access Forbidden (403)", 403
        if status_code == 410:
            return "HTTP 410", "Gone / Permanently Removed (410)", 410
        if status_code == 500:
            return "HTTP 500", "Internal Server Error (500)", 500
        if status_code in (502, 503, 504):
            return f"HTTP {status_code}", f"Gateway / Service Unavailable ({status_code})", status_code
        return msg, str(error or msg), status_code

    if isinstance(error, urllib.error.HTTPError):
        return classify_error(str(error), status_code=error.code)

    if isinstance(error, urllib.error.URLError):
        reason = error.reason
        if isinstance(reason, socket.timeout):
            return "Timeout", "Connection timed out", None
        if isinstance(reason, ssl.SSLError):
            return "SSL Error", f"SSL certificate verification failed: {reason}", None
        if isinstance(reason, socket.gaierror):
            return "DNS Error", "Domain name resolution failed (DNS)", None
        if isinstance(reason, ConnectionRefusedError):
            return "Connection Refused", "Server actively refused connection", None
        reason_str = str(reason)
        if "timed out" in reason_str.lower():
            return "Timeout", "Connection timed out", None
        if "name or service not known" in reason_str.lower() or "nodename nor servname provided" in reason_str.lower():
            return "DNS Error", "Host not found", None
        if "certificate" in reason_str.lower() or "ssl" in reason_str.lower():
            return "SSL Error", reason_str, None
        return "Network Error", reason_str, None

    if isinstance(error, (TimeoutError, socket.timeout)):
        return "Timeout", "Connection timed out", None

    if isinstance(error, ssl.SSLError):
        return "SSL Error", f"SSL certificate verification failed: {error}", None

    err_str = str(error or "Unknown scrape error")
    err_lower = err_str.lower()
    if "404" in err_lower:
        return "HTTP 404", err_str, 404
    if "403" in err_lower:
        return "HTTP 403", err_str, 403
    if "timed out" in err_lower or "timeout" in err_lower:
        return "Timeout", err_str, None
    if "ssl" in err_lower or "cert" in err_lower:
        return "SSL Error", err_str, None
    if "refused" in err_lower:
        return "Connection Refused", err_str, None
    if "not found" in err_lower:
        return "Not Found", err_str, None

    return "Network Error", err_str, status_code


class UrlBlocklist:
    """Manages persistent URL blocklisting and run reporting."""

    def __init__(
        self,
        blocklist_path: Path | str | None = None,
        report_path: Path | str | None = None,
    ):
        self.blocklist_path = Path(blocklist_path or DEFAULT_BLOCKLIST_PATH)
        self.report_path = Path(report_path or DEFAULT_REPORT_PATH)
        self.entries: dict[str, dict[str, Any]] = {}
        self.load()

    def load(self) -> None:
        """Load blocklist entries from disk if file exists."""
        self.entries = {}
        if not self.blocklist_path.exists():
            return
        try:
            raw = json.loads(self.blocklist_path.read_text(encoding="utf-8"))
            items = raw.get("blockedUrls", []) if isinstance(raw, dict) else raw
            for item in items:
                if isinstance(item, dict) and item.get("url"):
                    norm = normalize_url(item["url"])
                    item["normalizedUrl"] = norm
                    self.entries[norm] = item
        except Exception as e:
            print(f"⚠️ [UrlBlocklist] Failed to read {self.blocklist_path}: {e}")

    def is_blocked(self, url: str) -> bool:
        """Return True if the URL (or normalized equivalent) is on the blocklist."""
        if not url:
            return False
        norm = normalize_url(url)
        return norm in self.entries

    def get_blocked_entry(self, url: str) -> dict[str, Any] | None:
        """Retrieve the blocklist entry for a URL if present."""
        if not url:
            return None
        return self.entries.get(normalize_url(url))

    def record_error(
        self,
        url: str,
        place_id: int | str | None = None,
        place_name: str = "",
        error: Exception | str | None = None,
        status_code: int | None = None,
    ) -> dict[str, Any]:
        """Record an error for a URL, adding or updating its blocklist entry."""
        if not url:
            return {}

        norm = normalize_url(url)
        now_iso = datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")
        error_type, error_msg, resolved_status = classify_error(error, status_code)

        try:
            parsed = urllib.parse.urlsplit(url)
            domain = parsed.netloc.lower()
        except Exception:
            domain = ""

        if norm in self.entries:
            entry = self.entries[norm]
            entry["lastFailedAt"] = now_iso
            entry["failCount"] = entry.get("failCount", 1) + 1
            entry["errorType"] = error_type
            entry["errorMessage"] = error_msg
            if resolved_status:
                entry["statusCode"] = resolved_status
            if place_id is not None:
                entry["placeId"] = place_id
            if place_name:
                entry["placeName"] = place_name
        else:
            entry = {
                "url": url,
                "normalizedUrl": norm,
                "domain": domain,
                "placeId": place_id,
                "placeName": place_name,
                "errorType": error_type,
                "errorMessage": error_msg,
                "statusCode": resolved_status,
                "firstFailedAt": now_iso,
                "lastFailedAt": now_iso,
                "failCount": 1,
            }
            self.entries[norm] = entry

        return entry

    def unblock(self, url: str) -> bool:
        """Remove a URL from the blocklist."""
        norm = normalize_url(url)
        if norm in self.entries:
            del self.entries[norm]
            return True
        return False

    def save(self) -> None:
        """Save the updated blocklist to JSON file."""
        self.blocklist_path.parent.mkdir(parents=True, exist_ok=True)
        sorted_entries = sorted(
            self.entries.values(),
            key=lambda e: (e.get("lastFailedAt") or "", e.get("placeName") or ""),
            reverse=True,
        )
        now_iso = datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")
        payload = {
            "version": "1.0.0",
            "updatedAt": now_iso,
            "totalBlocked": len(sorted_entries),
            "blockedUrls": sorted_entries,
        }
        self.blocklist_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    def save_run_report(
        self,
        run_id: str,
        start_time: float,
        total_checked: int,
        successful_count: int,
        failed_count: int,
        skipped_blocked_count: int,
        newly_blocked_count: int,
        recent_errors: list[dict[str, Any]] | None = None,
        status: str = "completed",
    ) -> dict[str, Any]:
        """Save a comprehensive enrichment run report for the Admin dashboard."""
        self.report_path.parent.mkdir(parents=True, exist_ok=True)
        now_iso = datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")
        duration = round(time.time() - start_time, 1)

        sorted_entries = sorted(
            self.entries.values(),
            key=lambda e: (e.get("lastFailedAt") or "", e.get("placeName") or ""),
            reverse=True,
        )

        report = {
            "version": "1.0.0",
            "runId": run_id,
            "timestamp": now_iso,
            "durationSeconds": duration,
            "status": status,
            "summary": {
                "totalVenuesChecked": total_checked,
                "successfulScrapes": successful_count,
                "failedScrapes": failed_count,
                "skippedBlockedUrls": skipped_blocked_count,
                "newlyBlockedUrls": newly_blocked_count,
                "totalBlockedUrls": len(sorted_entries),
            },
            "recentErrors": recent_errors or [],
            "blocklist": sorted_entries,
        }

        self.report_path.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        return report
