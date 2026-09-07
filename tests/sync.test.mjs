import test from "node:test";
import assert from "node:assert/strict";
import { onRequestGet, onRequestPost } from "../functions/api/sync.ts";

test("POST /api/sync generates 6-character sync code and stores savedPlaceIds", async () => {
  const request = new Request("https://motkarta.se/api/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ savedPlaceIds: [1, 3, 14] }),
  });

  const response = await onRequestPost({ request, env: {} });
  assert.equal(response.status, 200);

  const data = await response.json();
  assert.equal(data.success, true);
  assert.ok(data.syncCode.startsWith("MOT-"));
  assert.deepEqual(data.savedPlaceIds, [1, 3, 14]);
});

test("GET /api/sync fetches stored savedPlaceIds by code", async () => {
  // First save a sync payload
  const postRequest = new Request("https://motkarta.se/api/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ savedPlaceIds: [5, 12, 39], existingCode: "MOT-TEST" }),
  });
  await onRequestPost({ request: postRequest, env: {} });

  // Then retrieve it by code
  const getRequest = new Request("https://motkarta.se/api/sync?code=MOT-TEST", { method: "GET" });
  const response = await onRequestGet({ request: getRequest, env: {} });

  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.syncCode, "MOT-TEST");
  assert.deepEqual(data.savedPlaceIds, [5, 12, 39]);
});

test("GET /api/sync handles missing or invalid sync codes cleanly", async () => {
  const getRequest = new Request("https://motkarta.se/api/sync?code=MOT-INVALID999", { method: "GET" });
  const response = await onRequestGet({ request: getRequest, env: {} });

  assert.equal(response.status, 404);
  const data = await response.json();
  assert.ok(data.error.includes("not found"));
});
