import assert from "node:assert/strict";
import test from "node:test";

import { onRequestGet as getReviewDashboard } from "../functions/api/admin/review-dashboard.ts";

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
    ...overrides,
  };
}

function fakeDashboardD1({ candidates, reviewSummary, lastExport, unexportedReviewCount }) {
  return {
    prepare(query) {
      return {
        values: [],
        bind(...values) {
          this.values = values;
          return this;
        },
        async all() {
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
