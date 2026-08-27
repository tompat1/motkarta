import assert from "node:assert/strict";
import test from "node:test";

import {
  onRequestGet as getRecommendationReport,
  onRequestPost as postRecommendationEvents,
} from "../functions/api/recommendation-events.ts";
import {
  RECOMMENDATION_EVENT_PRIVACY_VERSION,
  RECOMMENDATION_EVENT_SCHEMA_VERSION,
  RECOMMENDATION_SCORER_VERSION,
  buildRecommendationEventIdempotencyKey,
  recommendationCuisineContext,
  recommendationModeForContext,
  recommendationResultSetSignature,
} from "../lib/recommendation-events.ts";

const adminToken = "events-secret";

test("recommendation events endpoint validates shadow batches without D1", async () => {
  const response = await postRecommendationEvents({
    request: new Request("https://motkarta.test/api/recommendation-events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ events: [validEvent()] }),
    }),
    env: {},
  });
  const payload = await response.json();

  assert.equal(response.status, 202);
  assert.equal(payload.source, "shadow");
  assert.equal(payload.accepted, 1);
  assert.equal(payload.stored, 0);
  assert.equal(payload.trainingUse, false);
});

test("recommendation events endpoint rejects unknown vocabularies and raw query text", async () => {
  const response = await postRecommendationEvents({
    request: new Request("https://motkarta.test/api/recommendation-events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        events: [
          {
            ...validEvent(),
            eventType: "click",
            queryContext: { rawQuery: "best dinner near me", hasQuery: true },
          },
        ],
      }),
    }),
    env: {},
  });
  const payload = await response.json();

  assert.equal(response.status, 400);
  assert(payload.errors.some((error) => error.includes("eventType")));
  assert(payload.errors.some((error) => error.includes("rawQuery")));
});

test("recommendation events endpoint rejects free text hidden in allowlisted context fields", async () => {
  const response = await postRecommendationEvents({
    request: requestWithEvents([
      {
        ...validEvent(),
        queryContext: {
          ...validEvent().queryContext,
          cuisine: "best dinner near my home",
          kind: "Restaurant",
          mode: "For you",
        },
      },
    ]),
    env: {},
  });
  const payload = await response.json();

  assert.equal(response.status, 400);
  assert(payload.errors.some((error) => error.includes("queryContext.cuisine")));
  assert(payload.errors.some((error) => error.includes("queryContext.kind")));
  assert(payload.errors.some((error) => error.includes("queryContext.mode")));
});

test("recommendation event helpers preserve result-set identity and mode distribution", () => {
  const baseContext = validEvent().queryContext;
  const resultSetA = recommendationResultSetSignature(baseContext, [10, 11, 12]);
  const resultSetB = recommendationResultSetSignature(baseContext, [12, 11, 10]);
  const firstExposureKey = buildRecommendationEventIdempotencyKey({
    sessionId: "session_test",
    eventType: "impression",
    establishmentId: 10,
    resultPosition: 0,
    modelVersion: RECOMMENDATION_SCORER_VERSION,
    queryContext: baseContext,
    resultSetId: `rs_${resultSetA}_1`,
  });
  const repeatReconciliationKey = buildRecommendationEventIdempotencyKey({
    sessionId: "session_test",
    eventType: "impression",
    establishmentId: 10,
    resultPosition: 0,
    modelVersion: RECOMMENDATION_SCORER_VERSION,
    queryContext: baseContext,
    resultSetId: `rs_${resultSetA}_1`,
  });
  const laterExposureKey = buildRecommendationEventIdempotencyKey({
    sessionId: "session_test",
    eventType: "impression",
    establishmentId: 10,
    resultPosition: 0,
    modelVersion: RECOMMENDATION_SCORER_VERSION,
    queryContext: baseContext,
    resultSetId: `rs_${resultSetA}_2`,
  });

  assert.notEqual(resultSetA, resultSetB);
  assert.equal(firstExposureKey, repeatReconciliationKey);
  assert.notEqual(firstExposureKey, laterExposureKey);
  assert(firstExposureKey.length <= 160);
  assert.equal(recommendationModeForContext({ ...baseContext, surface: "map" }), "map");
  assert.equal(recommendationModeForContext({ ...baseContext, kind: "saved" }), "saved");
  assert.equal(recommendationModeForContext({ ...baseContext, mode: "hidden_gems" }), "hidden_gems");
  assert.equal(recommendationModeForContext({ ...baseContext, sortMode: "distance" }), "nearby");
  assert.equal(recommendationModeForContext({ ...baseContext, hasQuery: false }), "list");
  assert.equal(recommendationCuisineContext("best dinner near my home"), "other");
});

test("recommendation events endpoint rejects cross-origin and missing-token writes", async () => {
  const crossOrigin = await postRecommendationEvents({
    request: requestWithEvents([validEvent()], { origin: "https://example.invalid" }),
    env: {},
  });
  const crossOriginPayload = await crossOrigin.json();

  assert.equal(crossOrigin.status, 403);
  assert.equal(crossOriginPayload.source, "rejected");

  const missingToken = await postRecommendationEvents({
    request: requestWithEvents([validEvent()]),
    env: { RECOMMENDATION_EVENT_INGESTION_TOKEN: "required-token" },
  });
  const missingTokenPayload = await missingToken.json();

  assert.equal(missingToken.status, 401);
  assert.equal(missingTokenPayload.source, "rejected");

  const suppliedToken = await postRecommendationEvents({
    request: requestWithEvents([validEvent()], { "x-motkarta-ingestion-token": "required-token" }),
    env: { RECOMMENDATION_EVENT_INGESTION_TOKEN: "required-token" },
  });

  assert.equal(suppliedToken.status, 202);
});

test("recommendation events endpoint enforces per-client write quota before D1 writes", async () => {
  const db = fakeEventsD1();
  const events = Array.from({ length: 50 }, (_, index) =>
    validEvent({
      establishmentId: 500 + index,
      anonymousUserId: "anon_quota_user",
      sessionId: "session_quota",
      idempotencyKey: `session_quota:impression:${500 + index}:${index}:transparent-scorer-v1:ctx`,
      resultPosition: index,
    }),
  );

  const first = await postRecommendationEvents({
    request: requestWithEvents(events, { "cf-connecting-ip": "203.0.113.10" }),
    env: { DB: db, RECOMMENDATION_EVENT_RATE_LIMIT_PER_MINUTE: "50" },
  });
  const second = await postRecommendationEvents({
    request: requestWithEvents(events, { "cf-connecting-ip": "203.0.113.10" }),
    env: { DB: db, RECOMMENDATION_EVENT_RATE_LIMIT_PER_MINUTE: "50" },
  });
  const secondPayload = await second.json();

  assert.equal(first.status, 202);
  assert.equal(second.status, 429);
  assert.equal(secondPayload.source, "rate_limited");
  assert.equal(db.events.length, 50);
});

test("recommendation events endpoint does not rate-limit different clients behind one IP too early", async () => {
  const db = fakeEventsD1();
  const eventsForClient = (clientId) =>
    Array.from({ length: 50 }, (_, index) =>
      validEvent({
        establishmentId: 700 + index,
        anonymousUserId: clientId,
        sessionId: `session_${clientId}`,
        idempotencyKey: `session_${clientId}:impression:${700 + index}:${index}:transparent-scorer-v1:ctx`,
        resultPosition: index,
      }),
    );

  const first = await postRecommendationEvents({
    request: requestWithEvents(eventsForClient("anon_shared_ip_one"), { "cf-connecting-ip": "203.0.113.20" }),
    env: { DB: db, RECOMMENDATION_EVENT_RATE_LIMIT_PER_MINUTE: "50" },
  });
  const second = await postRecommendationEvents({
    request: requestWithEvents(eventsForClient("anon_shared_ip_two"), { "cf-connecting-ip": "203.0.113.20" }),
    env: { DB: db, RECOMMENDATION_EVENT_RATE_LIMIT_PER_MINUTE: "50" },
  });

  assert.equal(first.status, 202);
  assert.equal(second.status, 202);
  assert.equal(db.events.length, 100);
});

test("recommendation events endpoint stores events idempotently with privacy metadata", async () => {
  const db = fakeEventsD1();
  const event = validEvent();

  const first = await postRecommendationEvents({
    request: requestWithEvents([event]),
    env: { DB: db },
  });
  const firstPayload = await first.json();

  const second = await postRecommendationEvents({
    request: requestWithEvents([event]),
    env: { DB: db },
  });
  const secondPayload = await second.json();

  assert.equal(first.status, 202);
  assert.equal(firstPayload.stored, 1);
  assert.equal(second.status, 202);
  assert.equal(secondPayload.stored, 0);
  assert.equal(secondPayload.duplicates, 1);
  assert.equal(db.events.length, 1);
  assert.equal(db.lastPlaceholderCount, db.lastBindCount);
  assert.equal(db.lastColumnCount, db.lastBindCount);
  assert.equal(db.events[0].schema_version, RECOMMENDATION_EVENT_SCHEMA_VERSION);
  assert.equal(db.events[0].privacy_version, RECOMMENDATION_EVENT_PRIVACY_VERSION);
  assert.match(db.events[0].expires_at, /^20/);
  assert.equal(db.events[0].query_context_json.includes("best dinner"), false);
});

test("recommendation events report is admin protected and summarizes shadow data quality", async () => {
  const db = fakeEventsD1();
  await postRecommendationEvents({
    request: requestWithEvents([
      validEvent(),
      {
        ...validEvent({
          establishmentId: 11,
          eventType: "save",
          resultPosition: null,
          idempotencyKey: "session_test:save:11:none:transparent-scorer-v1:ctx",
        }),
      },
    ]),
    env: { DB: db },
  });

  const closed = await getRecommendationReport({
    request: new Request("https://motkarta.test/api/recommendation-events"),
    env: { DB: db },
  });
  assert.equal(closed.status, 503);

  const response = await getRecommendationReport({
    request: new Request("https://motkarta.test/api/recommendation-events", {
      headers: { "x-motkarta-admin-token": adminToken },
    }),
    env: { DB: db, MOTKARTA_ADMIN_TOKEN: adminToken },
  });
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.mode, "shadow");
  assert.equal(payload.trainingUse, false);
  assert.equal(payload.counts.total, 2);
  assert.equal(payload.counts.missingPosition, 0);
  assert.equal(payload.counts.missingIdempotency, 0);
  assert.equal(payload.counts.missingRetention, 0);
  assert.equal(payload.counts.missingReceivedAt, 0);
  assert.equal(payload.counts.missingSchemaVersion, 0);
  assert.equal(payload.counts.missingPrivacyVersion, 0);
  assert.equal(payload.byEventType.impression, 1);
  assert.equal(payload.byEventType.save, 1);
  assert.equal(payload.qualityReady, true);
});

test("recommendation events report fails readiness when required control metadata is missing", async () => {
  const db = fakeEventsD1();
  db.events.push({
    establishment_id: 10,
    anonymous_user_id: "anon_test_user",
    session_id: "session_test",
    event_type: "impression",
    result_position: 0,
    recommendation_mode: "search",
    query_context_json: "{}",
    model_version: RECOMMENDATION_SCORER_VERSION,
    occurred_at: new Date().toISOString(),
    idempotency_key: "session_test:impression:10:0:transparent-scorer-v1:ctx",
    received_at: null,
    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    schema_version: "",
    privacy_version: "",
  });

  const response = await getRecommendationReport({
    request: new Request("https://motkarta.test/api/recommendation-events", {
      headers: { "x-motkarta-admin-token": adminToken },
    }),
    env: { DB: db, MOTKARTA_ADMIN_TOKEN: adminToken },
  });
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.counts.missingReceivedAt, 1);
  assert.equal(payload.counts.missingSchemaVersion, 1);
  assert.equal(payload.counts.missingPrivacyVersion, 1);
  assert.equal(payload.qualityReady, false);
});

function validEvent(overrides = {}) {
  return {
    establishmentId: 10,
    anonymousUserId: "anon_test_user",
    sessionId: "session_test",
    eventType: "impression",
    resultPosition: 0,
    recommendationMode: "search",
    queryContext: {
      hasQuery: true,
      queryLengthBucket: "medium",
      kind: "restaurant",
      cuisine: "french",
      mode: "for_you",
      sortMode: "best_match",
      resultCount: 12,
      surface: "results",
    },
    modelVersion: RECOMMENDATION_SCORER_VERSION,
    occurredAt: new Date().toISOString(),
    idempotencyKey: "session_test:impression:10:0:transparent-scorer-v1:ctx",
    ...overrides,
  };
}

function requestWithEvents(events, headers = {}) {
  return new Request("https://motkarta.test/api/recommendation-events", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify({ events }),
  });
}

function fakeEventsD1() {
  const db = {
    events: [],
    lastBindCount: 0,
    lastColumnCount: 0,
    lastPlaceholderCount: 0,
    prepare(query) {
      return {
        values: [],
        bind(...values) {
          this.values = values;
          return this;
        },
        async run() {
          if (query.includes("INSERT OR IGNORE INTO recommendation_events")) {
            db.lastBindCount = this.values.length;
            db.lastColumnCount = columnCount(query);
            db.lastPlaceholderCount = (query.match(/\?/g) ?? []).length;
            assert.equal(db.lastPlaceholderCount, db.lastBindCount);
            assert.equal(db.lastColumnCount, db.lastBindCount);
            const [
              establishment_id,
              anonymous_user_id,
              session_id,
              event_type,
              result_position,
              recommendation_mode,
              query_context_json,
              model_version,
              occurred_at,
              idempotency_key,
              received_at,
              expires_at,
              schema_version,
              privacy_version,
            ] = this.values;
            if (db.events.some((event) => event.idempotency_key === idempotency_key)) {
              return { success: true, meta: { changes: 0 } };
            }
            db.events.push({
              establishment_id,
              anonymous_user_id,
              session_id,
              event_type,
              result_position,
              recommendation_mode,
              query_context_json,
              model_version,
              occurred_at,
              idempotency_key,
              received_at,
              expires_at,
              schema_version,
              privacy_version,
            });
            return { success: true, meta: { changes: 1 } };
          }
          return { success: true, meta: { changes: 0 } };
        },
        async all() {
          if (query.includes("COUNT(*) AS value FROM recommendation_events WHERE occurred_at")) {
            return { results: [{ value: db.events.length }] };
          }
          if (query.includes("expires_at IS NOT NULL AND expires_at <=")) {
            return { results: [{ value: 0 }] };
          }
          if (query.includes("event_type = 'impression' AND result_position IS NULL")) {
            return { results: [{ value: db.events.filter((event) => event.event_type === "impression" && event.result_position == null).length }] };
          }
          if (query.includes("idempotency_key IS NULL")) {
            return { results: [{ value: db.events.filter((event) => !event.idempotency_key).length }] };
          }
          if (query.includes("expires_at IS NULL")) {
            return { results: [{ value: db.events.filter((event) => !event.expires_at).length }] };
          }
          if (query.includes("received_at IS NULL")) {
            return { results: [{ value: db.events.filter((event) => !event.received_at).length }] };
          }
          if (query.includes("schema_version IS NULL")) {
            return { results: [{ value: db.events.filter((event) => !event.schema_version).length }] };
          }
          if (query.includes("privacy_version IS NULL")) {
            return { results: [{ value: db.events.filter((event) => !event.privacy_version).length }] };
          }
          if (query.includes("GROUP BY event_type")) {
            return { results: groupBy(db.events, "event_type") };
          }
          if (query.includes("GROUP BY recommendation_mode")) {
            return { results: groupBy(db.events, "recommendation_mode") };
          }
          if (query.includes("COUNT(*) AS value FROM recommendation_events")) {
            return { results: [{ value: db.events.length }] };
          }
          return { results: [] };
        },
      };
    },
  };
  return db;
}

function columnCount(query) {
  const columns = query.match(/recommendation_events \(([^)]+)\)/)?.[1] ?? "";
  return columns.split(",").map((column) => column.trim()).filter(Boolean).length;
}

function groupBy(events, key) {
  const counts = new Map();
  for (const event of events) {
    counts.set(event[key], (counts.get(event[key]) ?? 0) + 1);
  }
  return [...counts.entries()].map(([groupKey, value]) => ({ key: groupKey, value }));
}
