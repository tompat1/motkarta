import test from "node:test";
import assert from "node:assert/strict";
import { onRequestGet, onRequestPost, computeCoverageReport } from "../functions/api/admin/coverage.ts";

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
  assert.equal(data.totalPlaces, 0);
  assert.equal(data.source, 'unavailable');
  assert.equal(data.photos.count, 0);
  assert.equal(data.openingHours.count, 0);
  assert.equal(data.priceInfo.count, 0);
  assert.equal(data.curatedSources.status, 'UNKNOWN');
  assert.equal(data.lastEnrichedAt, null);
  assert.ok(data.errors.length);

});

test("admin coverage POST truthfully reports audit only", async () => {
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
  assert.equal(data.success, false);
  assert.equal(data.action, 'audit');
  assert.match(data.message, /does not run enrichment/);
  assert.ok(data.report);
});


test('coverage preserves real zeros and counts both photo stores without double counting places', async (t) => {
  const { DatabaseSync } = await import('node:sqlite');
  const sqlite = new DatabaseSync(':memory:');
  t.after(() => sqlite.close());
  sqlite.exec(`CREATE TABLE establishments(id INTEGER PRIMARY KEY, address TEXT, website TEXT, opening_hours TEXT, price_sek TEXT, price_level INTEGER, latitude REAL, longitude REAL);
    INSERT INTO establishments VALUES(1,'Stockholm',NULL,NULL,NULL,NULL,59.3,18);
    CREATE TABLE place_photos(place_id INTEGER,url TEXT);
    CREATE TABLE place_photo_uploads(place_id INTEGER);
    INSERT INTO place_photos VALUES(1,'https://example.org/photo.jpg');
    INSERT INTO place_photo_uploads VALUES(1);`);
  const db = { prepare(sql) { return { async all() { return { results: sqlite.prepare(sql).all() }; } }; } };
  const report = await computeCoverageReport(db);
  assert.equal(report.totalPlaces, 1);
  assert.equal(report.openingHours.count, 0);
  assert.equal(report.priceInfo.count, 0);
  assert.equal(report.address.count, 0);
  assert.equal(report.photos.count, 1);
  assert.equal(report.photos.totalPhotos, 2);
  assert.deepEqual(report.errors, []);
  sqlite.exec('DROP TABLE place_photos; DROP TABLE place_photo_uploads;');
  const missing = await computeCoverageReport(db);
  assert.equal(missing.photos.count, 0);
  assert.equal(missing.errors.length, 2);
});

test("admin coverage endpoint returns enrichmentReport and urlBlocklist", async () => {
  const req = new Request("https://motkarta.se/api/admin/coverage", {
    method: "GET",
    headers: {
      "x-motkarta-admin-token": adminToken,
    },
  });
  const res = await onRequestGet({ request: req, env: { MOTKARTA_ADMIN_TOKEN: adminToken } });
  assert.equal(res.status, 200);

  const data = await res.json();
  assert.ok("enrichmentReport" in data);
  assert.ok(Array.isArray(data.urlBlocklist));
});

test("admin coverage POST supports unblock_url action", async () => {
  const req = new Request("https://motkarta.se/api/admin/coverage", {
    method: "POST",
    headers: {
      "x-motkarta-admin-token": adminToken,
      "content-type": "application/json",
    },
    body: JSON.stringify({ action: "unblock_url", url: "https://nonexistent-sample.com" }),
  });
  const res = await onRequestPost({ request: req, env: { MOTKARTA_ADMIN_TOKEN: adminToken } });
  assert.equal(res.status, 200);

  const data = await res.json();
  assert.equal(data.success, true);
  assert.equal(data.action, "unblock_url");
  assert.match(data.message, /Unblocked/);
  assert.ok(Array.isArray(data.report.urlBlocklist));
});
