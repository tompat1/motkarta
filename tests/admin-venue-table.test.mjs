import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const tableSource = await readFile(new URL("../src/admin/AdminVenueTable.tsx", import.meta.url), "utf8");
const reviewSource = await readFile(new URL("../src/admin/AdminReviewPanel.tsx", import.meta.url), "utf8");
const stylesSource = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");

test("admin review defaults to the venue registry table and keeps detail and map views", () => {
  assert.match(reviewSource, /useState<"table" \| "list" \| "map">\("table"\)/);
  assert.match(reviewSource, /<AdminVenueTable/);
  assert.match(reviewSource, /setViewMode\("list"\)/);
  assert.match(reviewSource, /setViewMode\("map"\)/);
});

test("venue registry exposes sorting, advanced data-quality filters, and row actions", () => {
  for (const expected of [
    "sourceFilter",
    "confidenceFilter",
    "freshnessFilter",
    "issueFilter",
    "aria-sort",
    "aria-pressed={selected}",
    "role=\"region\"",
    "candidateSourceType",
    "possibleDuplicateCount",
    "onOpenReview",
    "onEditCandidate",
    "onToggleRemoved",
  ]) {
    assert.ok(tableSource.includes(expected), `AdminVenueTable should include ${expected}`);
  }
});

test("every literal AdminVenueTable class has a matching CSS selector", () => {
  const classNames = new Set();
  for (const match of tableSource.matchAll(/className=(?:"([^"]+)"|`([^`]+)`)/g)) {
    const value = match[1] ?? match[2] ?? "";
    for (const className of value.split(/\s+/)) {
      if (className.startsWith("admin-") && !className.includes("$")) classNames.add(className);
    }
  }

  const missing = [...classNames].filter((className) => {
    const escaped = className.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return !new RegExp(`\\.${escaped}(?=[\\s.:,{>+~#\\[])`).test(stylesSource);
  });
  assert.deepEqual(missing, [], `Missing CSS selectors: ${missing.join(", ")}`);
  assert.doesNotMatch(tableSource, /admin-candidate-row/, "table rows must not inherit the grid-based detail-card class");

  for (const dynamicSelector of [
    ".admin-venue-row-mark.tone-verified",
    ".admin-venue-row-mark.tone-risk",
    ".admin-table-status.state-candidate",
    ".admin-confidence-label.confidence-high",
    ".admin-confidence-label.confidence-medium",
    ".admin-confidence-label.confidence-low",
    ".admin-freshness-label.freshness-fresh",
    ".admin-freshness-label.freshness-stale",
    ".admin-freshness-label.freshness-unknown",
    ".admin-table-remove-btn.is-restore",
  ]) {
    assert.ok(stylesSource.includes(dynamicSelector), `styles.css should define ${dynamicSelector}`);
  }
});

test("venue table CSS preserves usable controls and local responsive overflow", () => {
  assert.match(stylesSource, /\.admin-advanced-filters select \{[\s\S]*?min-height: 44px;/);
  assert.match(stylesSource, /\.admin-table-review-btn,[\s\S]*?min-height: 44px;/);
  assert.match(stylesSource, /\.admin-venue-table-scroll \{[\s\S]*?overflow: auto;/);
  assert.match(stylesSource, /@media \(max-width: 760px\) \{[\s\S]*?\.admin-advanced-filters/);
  assert.match(stylesSource, /@media \(max-width: 760px\) \{[\s\S]*?\.admin-venue-table thead th:last-child,[\s\S]*?position: static;/);
});
