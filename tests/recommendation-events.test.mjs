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
  assert.equal(payload.byEventType.impression, 1);
  assert.equal(payload.byEventType.save, 1);
  assert.equal(payload.qualityReady, true);
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
      kind: "Restaurant",
      cuisine: "french",
      mode: "For you",
      sortMode: "Best match",
      resultCount: 12,
      surface: "results",
    },
    modelVersion: RECOMMENDATION_SCORER_VERSION,
    occurredAt: new Date().toISOString(),
    idempotencyKey: "session_test:impression:10:0:transparent-scorer-v1:ctx",
    ...overrides,
  };
}

function requestWithEvents(events) {
  return new Request("https://motkarta.test/api/recommendation-events", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ events }),
  });
}

function fakeEventsD1() {
  const db = {
    events: [],
    prepare(query) {
      return {
        values: [],
        bind(...values) {
          this.values = values;
          return this;
        },
        async run() {
          if (query.includes("INSERT OR IGNORE INTO recommendation_events")) {
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
          if (query.includes("expires_at IS NULL OR privacy_version IS NULL")) {
            return { results: [{ value: db.events.filter((event) => !event.expires_at || !event.privacy_version).length }] };
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

function groupBy(events, key) {
  const counts = new Map();
  for (const event of events) {
    counts.set(event[key], (counts.get(event[key]) ?? 0) + 1);
  }
  return [...counts.entries()].map(([groupKey, value]) => ({ key: groupKey, value }));
}
