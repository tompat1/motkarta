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
    candidateRow({
      id: 10,
      name: "Quiet Counter",
      lifecycleState: "candidate",
      possibleDuplicateCount: 1,
      possibleDuplicates: "11|Quiet Counter|Café|Södermalm|baseline|name_area",
    }),
    candidateRow({ id: 11, name: "Already Live", lifecycleState: "verified" }),
  ]);

  const response = await getAdminCandidates({
    request: new Request("https://motkarta.test/api/admin/candidates?includeDuplicates=1", {
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
  assert.equal(payload.candidates[0].possibleDuplicateCount, 1);
  assert.equal(payload.candidates[0].possibleDuplicates[0].id, 11);
  assert.equal(payload.candidates[0].possibleDuplicates[0].reason, "name_area");
  assert.equal(payload.candidates[0].communityNominationCount, 0);
});

test("admin candidates resolve Kista default districts to Västerort", async () => {
  const db = fakeAdminD1([
    candidateRow({
      name: "Kista Garden",
      area: "North Stockholm",
      address: "North Stockholm, Stockholm",
      latitude: 59.401941,
      longitude: 17.9418648,
    }),
  ]);

  const response = await getAdminCandidates({
    request: new Request("https://motkarta.test/api/admin/candidates", {
      headers: { "x-motkarta-admin-token": adminToken },
    }),
    env: { DB: db, MOTKARTA_ADMIN_TOKEN: adminToken },
  });
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.candidates[0].area, "Västerort");
});

test("admin candidates endpoint skips duplicate scans for state=all by default", async () => {
  const db = fakeAdminD1([
    candidateRow({ id: 10, name: "Quiet Counter", lifecycleState: "candidate", possibleDuplicateCount: 3 }),
    candidateRow({ id: 11, name: "Already Live", lifecycleState: "verified" }),
  ]);

  const response = await getAdminCandidates({
    request: new Request("https://motkarta.test/api/admin/candidates?state=all", {
      headers: { authorization: `Bearer ${adminToken}` },
    }),
    env: { DB: db, MOTKARTA_ADMIN_TOKEN: adminToken },
  });
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.candidates.length, 2);
  assert.equal(payload.candidates[0].possibleDuplicateCount, 0);
  assert.deepEqual(payload.candidates[0].possibleDuplicates, []);
});

test("admin candidates endpoint returns community nomination count when present", async () => {
  const db = fakeAdminD1([
    candidateRow({
      id: 25,
      name: "Beloved Secret Spot",
      communityNominationCount: 7,
    }),
  ], { hasRecommendationEvents: true });

  const response = await getAdminCandidates({
    request: new Request("https://motkarta.test/api/admin/candidates", {
      headers: { authorization: `Bearer ${adminToken}` },
    }),
    env: { DB: db, MOTKARTA_ADMIN_TOKEN: adminToken },
  });
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.candidates[0].communityNominationCount, 7);
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
  assert.equal(db.exports.length, 1);
  assert.equal(db.exports[0].exportedBy, "auto_review");
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

test("admin candidate promotion allows hidden-gem override with review note", async () => {
  const db = fakeAdminD1([
    candidateRow({
      id: 10,
      name: "Editorial Gem",
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
        validationNotes: "Editorial override after field visit.",
        adminOverrideHiddenGem: true,
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
});

test("admin candidate promotion rejects hidden-gem override without review note", async () => {
  const db = fakeAdminD1([
    candidateRow({
      id: 10,
      name: "Editorial Gem",
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
        adminOverrideHiddenGem: true,
      }),
    }),
    env: { DB: db, MOTKARTA_ADMIN_TOKEN: adminToken },
  });
  const payload = await response.json();

  assert.equal(response.status, 400);
  assert.match(payload.error, /review note/i);
  assert.equal(db.rows[0].lifecycleState, "candidate");
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

test("admin candidate duplicate merge copies evidence and marks candidate as merged", async () => {
  const db = fakeAdminD1([
    candidateRow({ id: 10, name: "Quiet Counter", lifecycleState: "candidate" }),
    candidateRow({ id: 11, name: "Quiet Counter", lifecycleState: "baseline" }),
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
        action: "merge_duplicate",
        targetId: 11,
        validationNotes: "Same name, same block.",
      }),
    }),
    env: { DB: db, MOTKARTA_ADMIN_TOKEN: adminToken },
  });
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.action, "merge_duplicate");
  assert.equal(payload.targetEstablishmentId, 11);
  assert.equal(db.rows[0].duplicateResolution, "merged");
  assert.equal(db.rows[0].mergedIntoEstablishmentId, 11);
  assert.equal(db.copiedEvidence.length, 1);
  assert.equal(db.copiedTags.length, 1);
  assert.equal(db.events[0].action, "merge_duplicate");
  assert.equal(db.events[0].targetEstablishmentId, 11);
});

test("admin candidate duplicate keep-separate records decision without promotion", async () => {
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
        action: "keep_separate",
        validationNotes: "Different entrance and operator.",
      }),
    }),
    env: { DB: db, MOTKARTA_ADMIN_TOKEN: adminToken },
  });
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.action, "keep_separate");
  assert.equal(db.rows[0].duplicateResolution, "keep_separate");
  assert.equal(db.rows[0].candidateReviewStatus, "duplicate_checked_keep_separate");
  assert.equal(db.rows[0].lifecycleState, "candidate");
  assert.equal(db.events[0].action, "keep_separate");
});

test("admin candidates endpoint supports filtering by unresolved_region", async () => {
  const db = fakeAdminD1([
    candidateRow({ id: 10, name: "Broad Spot", area: "Stockholm" }),
    candidateRow({ id: 11, name: "Resolved Spot", area: "Södermalm" }),
  ]);

  const response = await getAdminCandidates({
    request: new Request("https://motkarta.test/api/admin/candidates?state=unresolved_region", {
      headers: { authorization: `Bearer ${adminToken}` },
    }),
    env: { DB: db, MOTKARTA_ADMIN_TOKEN: adminToken },
  });
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.state, "unresolved_region");
  assert.deepEqual(payload.candidates.map((r) => r.name), ["Broad Spot"]);
});

test("admin candidates endpoint updates district via update_district action", async () => {
  const db = fakeAdminD1([
    candidateRow({ id: 10, name: "Needs Manual Region", area: "Stockholm" }),
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
        action: "update_district",
        district: "Vasastan",
        validationNotes: "Manual selection from dropdown",
      }),
    }),
    env: { DB: db, MOTKARTA_ADMIN_TOKEN: adminToken },
  });
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.action, "update_district");
  assert.equal(payload.district, "Vasastan");
  assert.equal(db.rows[0].area, "Vasastan");
  assert.equal(db.events[0].action, "update_district");
});

test("admin candidates endpoint supports filtering by needs_input", async () => {
  const db = fakeAdminD1([
    candidateRow({ id: 10, name: "Missing Web Place", website: null }),
    candidateRow({ id: 11, name: "Complete Place", website: "https://complete.se", address: "Götgatan 1", area: "Södermalm" }),
  ]);

  const response = await getAdminCandidates({
    request: new Request("https://motkarta.test/api/admin/candidates?state=needs_input", {
      headers: { authorization: `Bearer ${adminToken}` },
    }),
    env: { DB: db, MOTKARTA_ADMIN_TOKEN: adminToken },
  });
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.state, "needs_input");
  assert.deepEqual(payload.candidates.map((r) => r.name), ["Missing Web Place"]);
});

test("admin candidates endpoint updates address and price level via update_place", async () => {
  const db = fakeAdminD1([
    candidateRow({ id: 10, name: "Venue Needing Details", address: null, priceLevel: null }),
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
        action: "update_place",
        name: "Venue Needing Details",
        kind: "Café",
        area: "Södermalm",
        address: "Götgatan 12, Stockholm",
        website: "https://candidate.example",
        note: "Independent candidate.",
        latitude: 59.32,
        longitude: 18.07,
        lifecycleState: "candidate",
        validationLabel: null,
        priceLevel: 3,
        validationNotes: "Updated address and price in admin.",
      }),
    }),
    env: { DB: db, MOTKARTA_ADMIN_TOKEN: adminToken },
  });
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.action, "update_place");
  assert.equal(db.rows[0].address, "Götgatan 12, Stockholm");
  assert.equal(db.rows[0].priceLevel, 3);
  assert.equal(payload.candidate.priceLevel, 3);
  assert.equal(db.events[0].action, "update_place");
});

test("admin candidates endpoint updates website via update_website action", async () => {
  const db = fakeAdminD1([
    candidateRow({ id: 10, name: "Venue Needing Web", website: null }),
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
        action: "update_website",
        website: "https://example-venue.se",
        scrapeImage: false,
      }),
    }),
    env: { DB: db, MOTKARTA_ADMIN_TOKEN: adminToken },
  });
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.action, "update_website");
  assert.equal(payload.website, "https://example-venue.se");
  assert.equal(db.rows[0].website, "https://example-venue.se");
  assert.equal(db.events[0].action, "update_website");
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
    priceLevel: 2,
    priceSEK: null,
    note: "Independent candidate.",
    lifecycleState: "candidate",
    validationLabel: null,
    validationNotes: null,
    candidateSourceType: "osm_baseline",
    candidateSourceId: "candidate-1",
    candidateReviewStatus: "needs_review",
    candidateAllowedUse: "Candidate evidence only.",
    duplicateResolution: null,
    mergedIntoEstablishmentId: null,
    updatedAt: now,
    createdAt: now,
    evidenceCount: 2,
    evidenceSourceTypes: "osm,inspection",
    latestEvidenceAt: now,
    possibleDuplicateCount: 0,
    possibleDuplicates: null,
    communityNominationCount: 0,
    ...overrides,
  };
}

function shapeCandidateRows(rows, query) {
  const includeDuplicates = !query.includes("0 AS possibleDuplicateCount");
  const includeNominations = !query.includes("0 AS communityNominationCount");
  return rows.map((row) => ({
    ...row,
    possibleDuplicateCount: includeDuplicates ? row.possibleDuplicateCount : 0,
    possibleDuplicates: includeDuplicates ? row.possibleDuplicates : "",
    communityNominationCount: includeNominations ? row.communityNominationCount : 0,
  }));
}

function fakeAdminD1(rows, options = {}) {
  const db = {
    rows,
    hasRecommendationEvents: Boolean(options.hasRecommendationEvents),
    events: [],
    exports: [],
    copiedEvidence: [],
    copiedTags: [],
    prepare(query) {
      return {
        values: [],
        bind(...values) {
          this.values = values;
          return this;
        },
        async all() {
          if (query.includes("sqlite_master")) {
            const [table] = this.values;
            if (table === "recommendation_events" && db.hasRecommendationEvents) {
              return { results: [{ name: "recommendation_events" }] };
            }
            return { results: [] };
          }

          if (query.includes("FROM admin_review_events")) {
            return {
              results: db.events.map((event, index) => {
                const row = db.rows.find((item) => item.id === event.establishmentId);
                return {
                  event_id: index + 1,
                  establishment_id: event.establishmentId,
                  name: row?.name ?? "Candidate",
                  candidate_source_type: row?.candidateSourceType ?? "osm_baseline",
                  candidate_source_id: row?.candidateSourceId ?? "candidate-1",
                  duplicate_resolution: row?.duplicateResolution ?? null,
                  merged_into_establishment_id: row?.mergedIntoEstablishmentId ?? null,
                  lifecycle_state: event.lifecycleState,
                  validation_label: event.validationLabel,
                  validation_notes: event.validationNotes,
                  action: event.action,
                  target_establishment_id: event.targetEstablishmentId ?? null,
                  reviewed_at: event.reviewedAt,
                };
              }),
            };
          }

          if (!query.includes("FROM establishments")) {
            return { results: [] };
          }

          if (query.includes("WHERE e.id = ?") || query.includes("WHERE id = ?")) {
            const [id] = this.values;
            const row = db.rows.find((item) => item.id === id);
            return { results: row ? [row] : [] };
          }

          if (query.includes("WHERE e.website IS NULL OR e.website = ''")) {
            const filtered = db.rows.filter(
              (row) =>
                !row.website ||
                !row.address ||
                !row.area ||
                ["stockholm", "central stockholm", "north stockholm", "south stockholm", "east stockholm", "west stockholm", "stockholms lan", "stockholm county", "stockholms kommun", "sweden", "sverige", "unspecified"].includes(row.area.toLowerCase()),
            );
            const limit = Number(this.values.at(-1) ?? 100);
            return { results: shapeCandidateRows(filtered.slice(0, limit), query) };
          }

          if (query.includes("WHERE e.district IS NULL")) {
            const filtered = db.rows.filter((row) => !row.area || ["stockholm", "central stockholm", "north stockholm", "south stockholm", "east stockholm", "west stockholm", "stockholms lan", "stockholm county", "stockholms kommun", "sweden", "sverige", "unspecified"].includes(row.area.toLowerCase()));
            const limit = Number(this.values.at(-1) ?? 100);
            return { results: shapeCandidateRows(filtered.slice(0, limit), query) };
          }

          const state = query.includes("WHERE e.lifecycle_state = ?") ? this.values[0] : "all";
          const limit = Number(this.values.at(-1) ?? 100);
          const filtered = state === "all" ? db.rows : db.rows.filter((row) => row.lifecycleState === state);
          return { results: shapeCandidateRows(filtered.slice(0, limit), query) };
        },
        async run() {
          if (query.includes("UPDATE establishments")) {
            if (query.includes("SET name = ?")) {
              const [
                name,
                kind,
                area,
                address,
                website,
                description,
                latitude,
                longitude,
                lifecycleState,
                validationLabel,
                priceLevel,
                validationNotes,
                updatedAt,
                id,
              ] = this.values;
              const row = db.rows.find((item) => item.id === id);
              if (!row) return { success: true, meta: { changes: 0 } };
              row.name = name;
              row.kind = kind;
              row.area = area;
              row.address = address;
              row.website = website;
              row.note = description;
              row.latitude = latitude;
              row.longitude = longitude;
              row.lifecycleState = lifecycleState;
              row.validationLabel = validationLabel;
              row.priceLevel = priceLevel;
              row.validationNotes = validationNotes;
              row.updatedAt = updatedAt;
              return { success: true, meta: { changes: 1 } };
            }

            if (query.includes("SET website = ?")) {
              const [website, validationNotes, updatedAt, id] = this.values;
              const row = db.rows.find((item) => item.id === id);
              if (!row) return { success: true, meta: { changes: 0 } };
              row.website = website;
              row.validationNotes = validationNotes;
              row.updatedAt = updatedAt;
              return { success: true, meta: { changes: 1 } };
            }

            if (query.includes("SET district = ?")) {
              const [district, validationNotes, updatedAt, id] = this.values;
              const row = db.rows.find((item) => item.id === id);
              if (!row) return { success: true, meta: { changes: 0 } };
              row.area = district;
              row.validationNotes = validationNotes;
              row.updatedAt = updatedAt;
              return { success: true, meta: { changes: 1 } };
            }

            if (query.includes("candidate_review_status = 'merged_duplicate'")) {
              const [targetId, validationNotes, updatedAt, id] = this.values;
              const row = db.rows.find((item) => item.id === id);
              if (!row) return { success: true, meta: { changes: 0 } };
              row.candidateReviewStatus = "merged_duplicate";
              row.duplicateResolution = "merged";
              row.mergedIntoEstablishmentId = targetId;
              row.validationNotes = validationNotes;
              row.updatedAt = updatedAt;
              return { success: true, meta: { changes: 1 } };
            }

            if (query.includes("candidate_review_status = 'duplicate_checked_keep_separate'")) {
              const [validationNotes, updatedAt, id] = this.values;
              const row = db.rows.find((item) => item.id === id);
              if (!row) return { success: true, meta: { changes: 0 } };
              row.candidateReviewStatus = "duplicate_checked_keep_separate";
              row.duplicateResolution = "keep_separate";
              row.validationNotes = validationNotes;
              row.updatedAt = updatedAt;
              return { success: true, meta: { changes: 1 } };
            }

            if (query.includes("address = COALESCE")) {
              return { success: true, meta: { changes: 1 } };
            }

            const [lifecycleState, validationLabel, validationNotes, updatedAt, id] = this.values;
            const row = db.rows.find((item) => item.id === id);
            if (!row) return { success: true, meta: { changes: 0 } };
            row.lifecycleState = lifecycleState;
            row.validationLabel = validationLabel;
            row.validationNotes = validationNotes;
            row.updatedAt = updatedAt;
            return { success: true, meta: { changes: 1 } };
          }

          if (query.includes("INSERT INTO evidence_sources")) {
            const [targetId, sourceId] = this.values;
            db.copiedEvidence.push({ targetId, sourceId });
            return { success: true, meta: { changes: 1 } };
          }

          if (query.includes("INSERT INTO establishment_tags")) {
            const [targetId, sourceId] = this.values;
            db.copiedTags.push({ targetId, sourceId });
            return { success: true, meta: { changes: 1 } };
          }

          if (query.includes("INSERT INTO admin_review_events")) {
            const [establishmentId, lifecycleState, validationLabel, validationNotes, reviewedAt, action, targetEstablishmentId] = this.values;
            db.events.push({ establishmentId, lifecycleState, validationLabel, validationNotes, reviewedAt, action, targetEstablishmentId });
            return { success: true, meta: { changes: 1 } };
          }

          if (query.includes("INSERT INTO admin_label_exports")) {
            const [exportedAt, eventCount, labelCount, duplicateResolutionCount, exportedBy] = this.values;
            db.exports.push({ exportedAt, eventCount, labelCount, duplicateResolutionCount, exportedBy });
            return { success: true, meta: { changes: 1 } };
          }

          return { success: true, meta: { changes: 0 } };
        },
      };
    },
  };

  return db;
}
