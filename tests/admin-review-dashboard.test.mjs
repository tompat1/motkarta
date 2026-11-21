import assert from "node:assert/strict";
import test from "node:test";

import { onRequestGet as getReviewDashboard } from "../functions/api/admin/review-dashboard.ts";
import { findDuplicatesInMemory } from "../lib/admin-duplicates.ts";
import { isD1OverloadError } from "../lib/admin-d1.ts";

const adminToken = "review-secret";

test("admin review dashboard is closed when no admin token is configured", async () => {
  const response = await getReviewDashboard({
    request: new Request("https://motkarta.test/api/admin/review-dashboard"),
    env: {},
  });
  const payload = await response.json();

  assert.equal(response.status, 503);
  assert.match(payload.error, /not configured/i);
});

test("admin review dashboard does not serve demo status when D1 is missing", async () => {
  const response = await getReviewDashboard({
    request: new Request("https://motkarta.test/api/admin/review-dashboard", {
      headers: { "x-motkarta-admin-token": adminToken },
    }),
    env: { MOTKARTA_ADMIN_TOKEN: adminToken },
  });
  const payload = await response.json();

  assert.equal(response.status, 503);
  assert.equal(payload.source, "unavailable");
});

test("admin review dashboard prioritizes export when reviews are newer than last export", async () => {
  const db = fakeDashboardD1({
    candidates: [
      candidateRow({ id: 10, evidenceSourceTypes: "osm,inspection", possibleDuplicateCount: 1 }),
      candidateRow({
        id: 11,
        website: null,
        latestEvidenceAt: null,
        evidenceSourceTypes: "google_metadata",
        candidateSourceType: "google_metadata",
      }),
    ],
    reviewSummary: {
      reviewEventCount: 3,
      latestReviewAt: "2026-08-21T10:30:00Z",
    },
    lastExport: {
      lastExportedAt: "2026-08-21T10:00:00Z",
      lastEventCount: 2,
      lastLabelCount: 1,
      lastDuplicateResolutionCount: 1,
    },
    unexportedReviewCount: 1,
    missingCuisineCount: 0,
  });

  const response = await getReviewDashboard({
    request: new Request("https://motkarta.test/api/admin/review-dashboard", {
      headers: { authorization: `Bearer ${adminToken}` },
    }),
    env: { DB: db, MOTKARTA_ADMIN_TOKEN: adminToken },
  });
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.source, "d1");
  assert.equal(payload.nextStep, "export");
  assert.equal(payload.actions.exportNeeded, true);
  assert.equal(payload.actions.reviewNeeded, true);
  assert.equal(payload.actions.harvestNeeded, true);
  assert.equal(payload.counts.candidateCount, 2);
  assert.equal(payload.counts.hiddenGemReadyCount, 1);
  assert.equal(payload.counts.needsEvidenceCount, 1);
  assert.equal(payload.counts.possibleDuplicateCount, 1);
  assert.equal(payload.counts.unexportedReviewCount, 1);
  assert.equal(payload.lastExportedAt, "2026-08-21T10:00:00Z");
});

test("admin review dashboard shows caught up after export when no candidate needs action", async () => {
  const db = fakeDashboardD1({
    candidates: [],
    reviewSummary: {
      reviewEventCount: 3,
      latestReviewAt: "2026-08-21T10:30:00Z",
    },
    lastExport: {
      lastExportedAt: "2026-08-21T10:31:00Z",
      lastEventCount: 3,
      lastLabelCount: 2,
      lastDuplicateResolutionCount: 1,
    },
    unexportedReviewCount: 0,
    missingCuisineCount: 0,
  });

  const response = await getReviewDashboard({
    request: new Request("https://motkarta.test/api/admin/review-dashboard", {
      headers: { "x-motkarta-admin-token": adminToken },
    }),
    env: { DB: db, MOTKARTA_ADMIN_TOKEN: adminToken },
  });
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.nextStep, "caught_up");
  assert.deepEqual(payload.actions, {
    harvestNeeded: false,
    reviewNeeded: false,
    exportNeeded: false,
  });
});

test("admin review dashboard returns 503 with Retry-After on transient D1 overload", async () => {
  const overloadedDb = {
    prepare() {
      return {
        bind() {
          return this;
        },
        async all() {
          throw new Error("D1_ERROR: D1 DB is overloaded. Too many resources consumed within a 10 second window.");
        },
      };
    },
  };

  const response = await getReviewDashboard({
    request: new Request("https://motkarta.test/api/admin/review-dashboard?fresh=1", {
      headers: { "x-motkarta-admin-token": adminToken },
    }),
    env: { DB: overloadedDb, MOTKARTA_ADMIN_TOKEN: adminToken },
  });
  const payload = await response.json();

  assert.equal(response.status, 503);
  assert.equal(payload.overloaded, true);
  assert.equal(response.headers.get("retry-after"), "3");
  assert.equal(isD1OverloadError(payload.error), true);
});

test("findDuplicatesInMemory matches name+district, address, and nearby_name in O(N)", () => {
  const candidates = [
    { id: 100, name: "Café Pascal", district: "Vasastan", address: "", latitude: 59.342, longitude: 18.051 },
    { id: 101, name: "Different Name", district: "Södermalm", address: "Götgatan 42", latitude: 59.315, longitude: 18.071 },
    { id: 102, name: "Drop Coffee", district: "Södermalm", address: "", latitude: 59.3171, longitude: 18.0631 },
  ];
  const published = [
    { id: 1, name: "Cafe Pascal", type: "Café", district: "vasastan", address: "Norrtullsgatan 4", latitude: 59.342, longitude: 18.051, lifecycle_state: "verified" },
    { id: 2, name: "Existing Place", type: "Restaurant", district: "Södermalm", address: "Götgatan 42", latitude: 59.315, longitude: 18.071, lifecycle_state: "baseline" },
    { id: 3, name: "Drop Coffee Roasters", type: "Specialty coffee", district: "Södermalm", address: "Wollmar Yxkullsgatan 10", latitude: 59.3172, longitude: 18.0632, lifecycle_state: "featured" },
  ];

  const dupMap = findDuplicatesInMemory(candidates, published);
  assert.equal(dupMap.get(100)?.[0]?.reason, "name_area");
  assert.equal(dupMap.get(101)?.[0]?.reason, "address");
  assert.equal(dupMap.get(102)?.[0]?.reason, "nearby_name");
});

function candidateRow(overrides = {}) {
  return {
    id: 1,
    website: "https://candidate.example",
    candidateSourceType: "osm_baseline",
    validationLabel: null,
    candidateReviewStatus: "needs_review",
    evidenceSourceTypes: "osm,inspection",
    latestEvidenceAt: "2026-08-21T10:00:00Z",
    possibleDuplicateCount: 0,
    cuisineTags: "italian",
    ...overrides,
  };
}

function fakeDashboardD1({ candidates, reviewSummary, lastExport, unexportedReviewCount, missingCuisineCount = 0 }) {
  return {
    prepare(query) {
      return {
        values: [],
        bind(...values) {
          this.values = values;
          return this;
        },
        async all() {
          if (query.includes("COUNT(*) AS value FROM establishments e WHERE")) {
            return { results: [{ value: missingCuisineCount }] };
          }
          if (query.includes("FROM establishments e")) {
            return { results: candidates };
          }
          if (query.includes("FROM admin_label_exports")) {
            return { results: lastExport ? [lastExport] : [] };
          }
          if (query.includes("WHERE reviewed_at > ?")) {
            return { results: [{ value: unexportedReviewCount }] };
          }
          if (query.includes("FROM admin_review_events")) {
            return { results: [reviewSummary] };
          }
          return { results: [] };
        },
      };
    },
  };
}
