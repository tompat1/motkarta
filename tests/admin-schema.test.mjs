import assert from "node:assert/strict";
import test from "node:test";

import {
  onRequestGet as getAdminSchema,
  onRequestPost as postAdminSchema,
} from "../functions/api/admin/schema.ts";

const adminToken = "review-secret";

test("admin schema endpoint is closed when no admin token is configured", async () => {
  const response = await getAdminSchema({
    request: new Request("https://motkarta.test/api/admin/schema"),
    env: {},
  });
  const payload = await response.json();

  assert.equal(response.status, 503);
  assert.match(payload.error, /not configured/i);
});

test("admin schema endpoint does not use demo schema when D1 is missing", async () => {
  const response = await getAdminSchema({
    request: new Request("https://motkarta.test/api/admin/schema", {
      headers: { "x-motkarta-admin-token": adminToken },
    }),
    env: { MOTKARTA_ADMIN_TOKEN: adminToken },
  });
  const payload = await response.json();

  assert.equal(response.status, 503);
  assert.equal(payload.source, "unavailable");
});

test("admin schema status reports missing admin review parts", async () => {
  const db = fakeSchemaD1({
    establishments: ["id", "name", "type", "district", "description", "created_at", "updated_at"],
  });

  const response = await getAdminSchema({
    request: new Request("https://motkarta.test/api/admin/schema", {
      headers: { authorization: `Bearer ${adminToken}` },
    }),
    env: { DB: db, MOTKARTA_ADMIN_TOKEN: adminToken },
  });
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.ready, false);
  assert.equal(payload.baseSchemaReady, true);
  assert(payload.missing.some((issue) => issue.table === "admin_review_events"));
  assert(payload.missing.some((issue) => issue.table === "admin_label_exports"));
  assert(payload.missing.some((issue) => issue.table === "establishments" && issue.column === "lifecycle_state"));
});

test("admin schema POST prepares known schema against bound DB", async () => {
  const db = fakeSchemaD1({
    establishments: ["id", "name", "type", "district", "description", "created_at", "updated_at"],
  });

  const response = await postAdminSchema({
    request: new Request("https://motkarta.test/api/admin/schema", {
      method: "POST",
      headers: { "x-motkarta-admin-token": adminToken },
    }),
    env: { DB: db, MOTKARTA_ADMIN_TOKEN: adminToken },
  });
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.success, true);
  assert.equal(payload.ready, true);
  assert(db.tables.establishments.has("lifecycle_state"));
  assert(db.tables.establishments.has("candidate_source_type"));
  assert(db.tables.admin_review_events.has("action"));
  assert(db.tables.admin_label_exports.has("exported_at"));
  assert(db.runs.some((query) => query.includes("CREATE TABLE IF NOT EXISTS admin_label_exports")));
});

test("admin schema POST reports missing base schema without creating arbitrary app tables", async () => {
  const db = fakeSchemaD1({});

  const response = await postAdminSchema({
    request: new Request("https://motkarta.test/api/admin/schema", {
      method: "POST",
      headers: { "x-motkarta-admin-token": adminToken },
    }),
    env: { DB: db, MOTKARTA_ADMIN_TOKEN: adminToken },
  });
  const payload = await response.json();

  assert.equal(response.status, 409);
  assert.equal(payload.ready, false);
  assert.equal(payload.baseSchemaReady, false);
  assert(payload.missing.some((issue) => issue.table === "establishments"));
  assert.equal(db.tables.admin_review_events, undefined);
});

function fakeSchemaD1(initialTables) {
  const db = {
    tables: Object.fromEntries(
      Object.entries(initialTables).map(([table, columns]) => [table, new Set(columns)]),
    ),
    runs: [],
    prepare(query) {
      return {
        values: [],
        bind(...values) {
          this.values = values;
          return this;
        },
        async all() {
          if (query.includes("FROM sqlite_master")) {
            const table = this.values[0];
            return { results: db.tables[table] ? [{ name: table }] : [] };
          }

          if (query.startsWith("PRAGMA table_info(")) {
            const table = query.match(/PRAGMA table_info\(([^)]+)\)/)?.[1];
            const columns = table ? [...(db.tables[table] ?? [])] : [];
            return { results: columns.map((name) => ({ name })) };
          }

          return { results: [] };
        },
        async run() {
          db.runs.push(query);
          if (query.includes("CREATE TABLE IF NOT EXISTS admin_review_events")) {
            db.tables.admin_review_events = new Set([
              "id",
              "establishment_id",
              "lifecycle_state",
              "validation_label",
              "validation_notes",
              "reviewed_at",
              "action",
              "target_establishment_id",
            ]);
          }

          if (query.includes("CREATE TABLE IF NOT EXISTS admin_label_exports")) {
            db.tables.admin_label_exports = new Set([
              "id",
              "exported_at",
              "event_count",
              "label_count",
              "duplicate_resolution_count",
              "exported_by",
              "notes",
            ]);
          }

          if (query.startsWith("ALTER TABLE ")) {
            const match = query.match(/ALTER TABLE (\w+) ADD COLUMN (\w+)/);
            if (match) {
              db.tables[match[1]] ??= new Set();
              db.tables[match[1]].add(match[2]);
            }
          }

          return { success: true, meta: { changes: 1 } };
        },
      };
    },
  };
  return db;
}
