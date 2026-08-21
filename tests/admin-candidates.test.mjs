import assert from "node:assert/strict";
import test from "node:test";

import {
  onRequestGet as getAdminCandidates,
  onRequestPost as postAdminCandidate,
} from "../functions/api/admin/candidates.ts";

const adminToken = "review-secret";

test("admin candidates endpoint is closed when no admin token is configured", async () => {
  const response = await getAdminCandidates({
    request: new Request("https://motkarta.test/api/admin/candidates"),
    env: {},
  });
  const payload = await response.json();

  assert.equal(response.status, 503);
  assert.match(payload.error, /not configured/i);
});

test("admin candidates endpoint does not serve demo rows when D1 is missing", async () => {
  const response = await getAdminCandidates({
    request: new Request("https://motkarta.test/api/admin/candidates", {
      headers: { "x-motkarta-admin-token": adminToken },
    }),
    env: { MOTKARTA_ADMIN_TOKEN: adminToken },
  });
  const payload = await response.json();

  assert.equal(response.status, 503);
  assert.equal(payload.source, "unavailable");
  assert.deepEqual(payload.candidates, []);
});

test("admin candidates endpoint lists candidate records only by default", async () => {
  const db = fakeAdminD1([
    candidateRow({ id: 10, name: "Quiet Counter", lifecycleState: "candidate" }),
    candidateRow({ id: 11, name: "Already Live", lifecycleState: "verified" }),
  ]);

  const response = await getAdminCandidates({
    request: new Request("https://motkarta.test/api/admin/candidates", {
      headers: { authorization: `Bearer ${adminToken}` },
    }),
    env: { DB: db, MOTKARTA_ADMIN_TOKEN: adminToken },
  });
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.source, "d1");
  assert.equal(payload.state, "candidate");
  assert.deepEqual(payload.candidates.map((row) => row.name), ["Quiet Counter"]);
  assert.deepEqual(payload.candidates[0].evidenceSourceTypes, ["osm", "inspection"]);
  assert.equal(payload.candidates[0].evidenceGate.canPromoteHiddenGem, true);
  assert.equal(payload.candidates[0].evidenceGate.independentEvidenceCount, 2);
});

test("admin candidate promotion updates lifecycle state and writes audit event", async () => {
  const db = fakeAdminD1([
    candidateRow({ id: 10, name: "Quiet Counter", lifecycleState: "candidate" }),
  ]);

  const response = await postAdminCandidate({
    request: new Request("https://motkarta.test/api/admin/candidates", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-motkarta-admin-token": adminToken,
      },
      body: JSON.stringify({
        id: 10,
        state: "verified",
        validationLabel: "known_hidden_gem",
        validationNotes: "OSM plus municipal inspection and manual check.",
      }),
    }),
    env: { DB: db, MOTKARTA_ADMIN_TOKEN: adminToken },
  });
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.success, true);
  assert.equal(db.rows[0].lifecycleState, "verified");
  assert.equal(db.rows[0].validationLabel, "known_hidden_gem");
  assert.equal(db.events.length, 1);
  assert.equal(db.events[0].establishmentId, 10);
  assert.equal(db.events[0].lifecycleState, "verified");
});

test("admin candidate promotion rejects invalid validation transitions", async () => {
  const db = fakeAdminD1([
    candidateRow({ id: 10, name: "Wrong Category", lifecycleState: "candidate" }),
  ]);

  const response = await postAdminCandidate({
    request: new Request("https://motkarta.test/api/admin/candidates", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-motkarta-admin-token": adminToken,
      },
      body: JSON.stringify({
        id: 10,
        state: "verified",
        validationLabel: "closed_wrong_category",
      }),
    }),
    env: { DB: db, MOTKARTA_ADMIN_TOKEN: adminToken },
  });
  const payload = await response.json();

  assert.equal(response.status, 400);
  assert.match(payload.error, /cannot be promoted/i);
  assert.equal(db.rows[0].lifecycleState, "candidate");
  assert.equal(db.events.length, 0);
});

test("admin candidate promotion blocks hidden-gem label without independent evidence", async () => {
  const db = fakeAdminD1([
    candidateRow({
      id: 10,
      name: "Google Only Candidate",
      lifecycleState: "candidate",
      candidateSourceType: "google_metadata",
      evidenceSourceTypes: "google_metadata",
    }),
  ]);

  const response = await postAdminCandidate({
    request: new Request("https://motkarta.test/api/admin/candidates", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-motkarta-admin-token": adminToken,
      },
      body: JSON.stringify({
        id: 10,
        state: "verified",
        validationLabel: "known_hidden_gem",
      }),
    }),
    env: { DB: db, MOTKARTA_ADMIN_TOKEN: adminToken },
  });
  const payload = await response.json();

  assert.equal(response.status, 409);
  assert.match(payload.error, /2 independent/i);
  assert.equal(db.rows[0].lifecycleState, "candidate");
  assert.equal(db.events.length, 0);
});

function candidateRow(overrides) {
  const now = new Date("2026-08-21T10:00:00.000Z").toISOString();
  return {
    id: 1,
    name: "Candidate",
    kind: "Café",
    area: "Södermalm",
    address: "Kandgatan 1, Stockholm",
    website: "https://candidate.example",
    note: "Independent candidate.",
    lifecycleState: "candidate",
    validationLabel: null,
    validationNotes: null,
    candidateSourceType: "osm_baseline",
    candidateSourceId: "candidate-1",
    candidateReviewStatus: "needs_review",
    candidateAllowedUse: "Candidate evidence only.",
    updatedAt: now,
    createdAt: now,
    evidenceCount: 2,
    evidenceSourceTypes: "osm,inspection",
    latestEvidenceAt: now,
    ...overrides,
  };
}

function fakeAdminD1(rows) {
  const db = {
    rows,
    events: [],
    prepare(query) {
      const statement = {
        values: [],
        bind(...values) {
          this.values = values;
          return this;
        },
        async all() {
          if (!query.includes("FROM establishments")) {
            return { results: [] };
          }

          if (query.includes("WHERE e.id = ?")) {
            const [id] = this.values;
            const row = db.rows.find((item) => item.id === id);
            return { results: row ? [row] : [] };
          }

          const state = query.includes("WHERE e.lifecycle_state = ?") ? this.values[0] : "all";
          const limit = Number(this.values.at(-1) ?? 100);
          const filtered = state === "all" ? db.rows : db.rows.filter((row) => row.lifecycleState === state);
          return { results: filtered.slice(0, limit) };
        },
        async run() {
          if (query.includes("UPDATE establishments")) {
            const [lifecycleState, validationLabel, validationNotes, updatedAt, id] = this.values;
            const row = db.rows.find((item) => item.id === id);
            if (!row) {
              return { success: true, meta: { changes: 0 } };
            }
            row.lifecycleState = lifecycleState;
            row.validationLabel = validationLabel;
            row.validationNotes = validationNotes;
            row.updatedAt = updatedAt;
            return { success: true, meta: { changes: 1 } };
          }

          if (query.includes("INSERT INTO admin_review_events")) {
            const [establishmentId, lifecycleState, validationLabel, validationNotes, reviewedAt] = this.values;
            db.events.push({ establishmentId, lifecycleState, validationLabel, validationNotes, reviewedAt });
            return { success: true, meta: { changes: 1 } };
          }

          return { success: true, meta: { changes: 0 } };
        },
      };
      return statement;
    },
  };

  return db;
}
