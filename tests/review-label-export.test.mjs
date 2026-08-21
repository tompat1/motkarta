import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";

import { onRequestGet as getReviewLabels } from "../functions/api/admin/review-labels.ts";
import { buildReviewLabelExport } from "../lib/review-labels.ts";

const execFileAsync = promisify(execFile);
const adminToken = "review-secret";

test("review label export converts latest admin events into labels and duplicate resolutions", async () => {
  const source = join(tmpdir(), `motkarta-review-events-${process.pid}.json`);
  const target = join(tmpdir(), `motkarta-review-labels-${process.pid}.json`);

  await writeFile(
    source,
    JSON.stringify({
      results: [
        {
          event_id: 3,
          establishment_id: 10,
          name: "Quiet Counter",
          candidate_source_type: "municipal_unmatched",
          candidate_source_id: "source-10",
          duplicate_resolution: null,
          merged_into_establishment_id: null,
          lifecycle_state: "verified",
          validation_label: "known_hidden_gem",
          validation_notes: "Two independent signals and field check.",
          action: "promote",
          target_establishment_id: null,
          reviewed_at: "2026-08-21T10:00:00Z",
        },
        {
          event_id: 4,
          establishment_id: 11,
          name: "Duplicate Counter",
          candidate_source_type: "google_metadata",
          candidate_source_id: "google-11",
          duplicate_resolution: "merged",
          merged_into_establishment_id: 10,
          lifecycle_state: "candidate",
          validation_label: null,
          validation_notes: "Merged into canonical row.",
          action: "merge_duplicate",
          target_establishment_id: 10,
          reviewed_at: "2026-08-21T10:03:00Z",
        },
      ],
    }),
    "utf8",
  );

  await execFileAsync("node", ["scripts/export_review_labels.mjs", source, target]);
  const payload = JSON.parse(await readFile(target, "utf8"));

  assert.equal(payload.labels.length, 1);
  assert.equal(payload.labels[0].label, "known_hidden_gem");
  assert.equal(payload.labels[0].sourceType, "municipal_unmatched");
  assert.equal(payload.duplicateResolutions.length, 1);
  assert.equal(payload.duplicateResolutions[0].duplicateResolution, "merged");
  assert.equal(payload.duplicateResolutions[0].targetEstablishmentId, 10);
});

test("review label builder keeps the latest event per establishment", () => {
  const payload = buildReviewLabelExport(
    [
      {
        event_id: 1,
        establishment_id: 10,
        name: "Quiet Counter",
        validation_label: "not_enough_evidence",
        reviewed_at: "2026-08-21T09:00:00Z",
      },
      {
        event_id: 2,
        establishment_id: 10,
        name: "Quiet Counter",
        validation_label: "known_hidden_gem",
        reviewed_at: "2026-08-21T10:00:00Z",
      },
    ],
    { updatedAt: "2026-08-21T11:00:00Z" },
  );

  assert.equal(payload.updatedAt, "2026-08-21T11:00:00Z");
  assert.equal(payload.labels.length, 1);
  assert.equal(payload.labels[0].label, "known_hidden_gem");
});

test("review labels endpoint is closed when no admin token is configured", async () => {
  const response = await getReviewLabels({
    request: new Request("https://motkarta.test/api/admin/review-labels"),
    env: {},
  });
  const payload = await response.json();

  assert.equal(response.status, 503);
  assert.match(payload.error, /not configured/i);
});

test("review labels endpoint does not export demo labels when D1 is missing", async () => {
  const response = await getReviewLabels({
    request: new Request("https://motkarta.test/api/admin/review-labels", {
      headers: { "x-motkarta-admin-token": adminToken },
    }),
    env: { MOTKARTA_ADMIN_TOKEN: adminToken },
  });
  const payload = await response.json();

  assert.equal(response.status, 503);
  assert.equal(payload.source, "unavailable");
  assert.deepEqual(payload.labels, []);
  assert.deepEqual(payload.duplicateResolutions, []);
});

test("review labels endpoint exports D1 admin review events", async () => {
  const db = fakeReviewLabelsD1([
    {
      event_id: 3,
      establishment_id: 10,
      name: "Quiet Counter",
      candidate_source_type: "municipal_unmatched",
      candidate_source_id: "source-10",
      duplicate_resolution: null,
      merged_into_establishment_id: null,
      lifecycle_state: "verified",
      validation_label: "known_hidden_gem",
      validation_notes: "Two independent signals and field check.",
      action: "promote",
      target_establishment_id: null,
      reviewed_at: "2026-08-21T10:00:00Z",
    },
    {
      event_id: 4,
      establishment_id: 11,
      name: "Duplicate Counter",
      candidate_source_type: "municipal_unmatched",
      candidate_source_id: "source-11",
      duplicate_resolution: "keep_separate",
      merged_into_establishment_id: null,
      lifecycle_state: "candidate",
      validation_label: null,
      validation_notes: "Different operator.",
      action: "keep_separate",
      target_establishment_id: null,
      reviewed_at: "2026-08-21T10:03:00Z",
    },
  ]);

  const response = await getReviewLabels({
    request: new Request("https://motkarta.test/api/admin/review-labels", {
      headers: { authorization: `Bearer ${adminToken}` },
    }),
    env: { DB: db, MOTKARTA_ADMIN_TOKEN: adminToken },
  });
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.source, "d1");
  assert.equal(payload.labels.length, 1);
  assert.equal(payload.labels[0].label, "known_hidden_gem");
  assert.equal(payload.duplicateResolutions.length, 1);
  assert.equal(payload.duplicateResolutions[0].duplicateResolution, "keep_separate");
  assert.match(db.queries[0], /FROM admin_review_events/);
});

function fakeReviewLabelsD1(rows) {
  return {
    queries: [],
    prepare(query) {
      this.queries.push(query);
      return {
        async all() {
          return { results: rows };
        },
      };
    },
  };
}
