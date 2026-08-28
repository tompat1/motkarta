import assert from "node:assert/strict";
import test from "node:test";

import { onRequestGet as getMlStatus } from "../functions/api/admin/ml-status.ts";

const adminToken = "review-secret";

test("admin ml status endpoint is closed when no admin token is configured", async () => {
  const response = await getMlStatus({
    request: new Request("https://motkarta.test/api/admin/ml-status"),
    env: {},
  });
  const payload = await response.json();

  assert.equal(response.status, 503);
  assert.match(payload.error, /not configured/i);
});

test("admin ml status endpoint rejects unauthorized requests", async () => {
  const response = await getMlStatus({
    request: new Request("https://motkarta.test/api/admin/ml-status"),
    env: { MOTKARTA_ADMIN_TOKEN: adminToken },
  });
  assert.equal(response.status, 401);
});

test("admin ml status endpoint returns model specifications, telemetry, and code snippets", async () => {
  const fakeDb = {
    prepare(query) {
      return {
        bind() {
          return this;
        },
        async all() {
          if (query.includes("COUNT(*) as cnt")) {
            return { results: [{ cnt: 42 }] };
          }
          if (query.includes("recommendation_mode")) {
            return { results: [{ key: "explore", value: 30 }] };
          }
          if (query.includes("event_type")) {
            return { results: [{ key: "impression", value: 30 }] };
          }
          if (query.includes("result_position")) {
            return { results: [{ key: 1, value: 20 }] };
          }
          return { results: [] };
        },
      };
    },
  };

  const response = await getMlStatus({
    request: new Request("https://motkarta.test/api/admin/ml-status", {
      headers: { "x-motkarta-admin-token": adminToken },
    }),
    env: { DB: fakeDb, MOTKARTA_ADMIN_TOKEN: adminToken },
  });

  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.source, "d1");
  assert.equal(payload.models.length, 3);
  assert.equal(payload.models[0].id, "discovery-hgbr-spatial-oof-v1");
  assert.equal(payload.models[1].id, "isolation-forest-spatial-v1");
  assert.equal(payload.models[2].id, "rec-v1-debiased");
  assert.equal(payload.seabornCharts.length, 4);
  assert.equal(payload.seabornCharts[0].id, "eda_feature_relationships");
  assert.equal(payload.lifecycleStages.length, 6);
  assert.equal(payload.gapsAndImprovements.length, 4);
  assert.equal(payload.telemetry.totalEvents, 42);
  assert.equal(payload.codeSnippets.length, 4);
  assert.match(payload.codeSnippets[0].code, /fit_discovery_model/);
  assert.match(payload.codeSnippets[1].code, /IsolationForest/);
  assert.match(payload.codeSnippets[2].code, /SentenceTransformer/);
  assert.match(payload.codeSnippets[3].code, /evaluate_position_bias/);
});
