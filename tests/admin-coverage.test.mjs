import test from "node:test";
import assert from "node:assert/strict";
import { onRequestGet, onRequestPost } from "../functions/api/admin/coverage.ts";

const adminToken = "dev-admin-token";

test("admin coverage endpoint rejects unauthorized requests when unconfigured", async () => {
  const req = new Request("https://motkarta.se/api/admin/coverage", {
    method: "GET",
  });
  const res = await onRequestGet({ request: req, env: {} });
  assert.equal(res.status, 503);
});

test("admin coverage endpoint rejects invalid token", async () => {
  const req = new Request("https://motkarta.se/api/admin/coverage", {
    method: "GET",
    headers: {
      "x-motkarta-admin-token": "wrong-token",
    },
  });
  const res = await onRequestGet({ request: req, env: { MOTKARTA_ADMIN_TOKEN: adminToken } });
  assert.equal(res.status, 401);
});

test("admin coverage endpoint returns coverage report when authorized", async () => {
  const req = new Request("https://motkarta.se/api/admin/coverage", {
    method: "GET",
    headers: {
      "x-motkarta-admin-token": adminToken,
    },
  });
  const res = await onRequestGet({ request: req, env: { MOTKARTA_ADMIN_TOKEN: adminToken } });
  assert.equal(res.status, 200);

  const data = await res.json();
  assert.ok(data.totalPlaces > 0);
  assert.ok(data.address.percentage >= 0);
  assert.ok(data.photos.percentage >= 0);
  assert.equal(data.curatedSources.totalSources, 7);
  assert.equal(data.curatedSources.passingSources, 7);
});

test("admin coverage POST triggers enrichment action", async () => {
  const req = new Request("https://motkarta.se/api/admin/coverage", {
    method: "POST",
    headers: {
      "x-motkarta-admin-token": adminToken,
      "content-type": "application/json",
    },
    body: JSON.stringify({ action: "enrich_addresses" }),
  });
  const res = await onRequestPost({ request: req, env: { MOTKARTA_ADMIN_TOKEN: adminToken } });
  assert.equal(res.status, 200);

  const data = await res.json();
  assert.equal(data.success, true);
  assert.ok(data.report);
});
