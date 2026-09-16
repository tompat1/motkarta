import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { filterPublishedPlaces, samePlaceIdentity } from "../lib/place-visibility.ts";
import { onRequestGet as getVisibility } from "../functions/api/place-visibility.ts";
import { onRequestPost as review, onRequestGet as candidates } from "../functions/api/admin/candidates.ts";
import { onRequestPost as ensureSchema } from "../functions/api/admin/schema.ts";
import { onRequestGet as getPlaces } from "../functions/api/places.ts";
import { processConciergeQuery } from "../functions/api/concierge.ts";
import { sanitizeAndAugmentPlaces } from "../src/app/place-sanitization.ts";

const catalog = JSON.parse(readFileSync(new URL("../public/data/places.json", import.meta.url))).places;
const arirang = catalog.find((place) => place.name === "Arirang");
const belgo = catalog.find((place) => place.name === "Belgobarens bakficka");
const token = "local-test-only";
const request = (path, body) => new Request(`https://motkarta.test${path}`, {
  method: body ? "POST" : "GET",
  headers: { "x-motkarta-admin-token": token, "content-type": "application/json" },
  ...(body ? { body: JSON.stringify(body) } : {}),
});

async function database(t) {
  const sqlite = new DatabaseSync(":memory:");
  t.after(() => sqlite.close());
  const dir = new URL("../drizzle/", import.meta.url);
  for (const filename of readdirSync(dir).filter((name) => /^\d.*\.sql$/.test(name)).sort()) {
    sqlite.exec(readFileSync(new URL(filename, dir), "utf8"));
  }
  const DB = { prepare(query) {
    const statement = sqlite.prepare(query);
    let values = [];
    return {
      bind(...args) { values = args; return this; },
      async all() { return { results: statement.all(...values) }; },
      async run() { return { success: true, meta: { changes: Number(statement.run(...values).changes) } }; },
    };
  } };
  const env = { DB, MOTKARTA_ADMIN_TOKEN: token };
  assert.equal((await ensureSchema({ request: request("/api/admin/schema", {}), env })).status, 200);
  sqlite.prepare(`INSERT INTO establishments
    (id, name, type, district, description, latitude, longitude, osm_type, osm_id, created_at, updated_at)
    VALUES (?, ?, 'Restaurant', 'Kungsholmen', '', ?, ?, 'node', '3845015364', '2026-09-16', '2026-09-16')`)
    .run(42, belgo.name, belgo.latitude, belgo.longitude);
  return { env, sqlite };
}

test("static Arirang closure is respected before map/list/search scoring", () => {
  assert.ok(arirang && belgo);
  assert.deepEqual(sanitizeAndAugmentPlaces([arirang, belgo]).map((p) => p.name), [belgo.name]);
});

test("publication identity handles namespaces, branches, aliases and legacy imports", () => {
  const d1 = { ...belgo, id: 42, idNamespace: "d1" };
  assert.equal(samePlaceIdentity(belgo, d1), true);
  assert.equal(samePlaceIdentity(belgo, { ...d1, osmIdentity: "node:999" }), false);
  assert.equal(samePlaceIdentity(belgo, { ...d1, osmIdentity: "node:999", osmAliases: [belgo.osmIdentity] }), true);
  assert.equal(samePlaceIdentity(belgo, { ...d1, osmIdentity: undefined }), true);
  assert.equal(samePlaceIdentity(belgo, { ...d1, osmIdentity: undefined, latitude: 59.4 }), false);
  assert.equal(samePlaceIdentity(belgo, { id: belgo.id, idNamespace: "d1", name: "Different venue" }), false);
  const canonical = { ...belgo, id: 1 };
  assert.deepEqual(filterPublishedPlaces([canonical, { ...belgo, id: 2, duplicateResolution: "merged" }]), [canonical]);
});

test("authenticated removal and restoration propagate through SQLite, static catalog, places API and concierge", async (t) => {
  const { env, sqlite } = await database(t);
  const serveEnv = { ...env, ASSETS: { fetch: async () => Response.json({ places: [arirang, belgo] }) } };
  const closure = { id: 42, state: "candidate", validationLabel: "closed_wrong_category", validationNotes: "Admin reviewed closure." };

  const unauthorized = await review({ request: new Request("https://motkarta.test/api/admin/candidates", { method: "POST", body: JSON.stringify(closure) }), env });
  assert.equal(unauthorized.status, 401);
  assert.equal((await review({ request: request("/api/admin/candidates", closure), env })).status, 200);
  const visibility = await getVisibility({ env });
  assert.equal(visibility.headers.get("cache-control"), "no-store");
  const { blocked } = await visibility.json();
  assert.equal(blocked[0].id, 42);
  assert.equal(blocked[0].osmIdentity, belgo.osmIdentity);
  assert.deepEqual(filterPublishedPlaces([arirang, belgo], blocked), []);

  const removed = await candidates({ request: request("/api/admin/candidates?state=removed&q=Belgobarens"), env });
  assert.deepEqual((await removed.json()).candidates.map((p) => p.id), [42]);
  const unmatched = await candidates({ request: request("/api/admin/candidates?state=removed&q=Unknown"), env });
  assert.deepEqual((await unmatched.json()).candidates, []);
  const publicResult = await getPlaces({ request: request("/api/places"), env: serveEnv });
  assert.deepEqual((await publicResult.json()).places, []);
  const concierge = await processConciergeQuery(belgo.name, serveEnv, {}, false, "https://motkarta.test");
  assert.deepEqual((await concierge.json()).cards, []);

  assert.equal((await review({ request: request("/api/admin/candidates", { id: 42, state: "baseline", validationLabel: null, validationNotes: "Rechecked." }), env })).status, 200);
  assert.deepEqual((await (await getVisibility({ env })).json()).blocked, []);
  const restored = await getPlaces({ request: request("/api/places"), env: serveEnv });
  assert.deepEqual((await restored.json()).places.map((p) => p.name), [belgo.name]);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM admin_review_events").get().count, 2);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM establishments").get().count, 1);
  assert.equal((await review({ request: request("/api/admin/candidates", { ...closure, id: 999 }), env })).status, 404);
});

test("publication read failures do not resurrect static venues", async () => {
  const env = { DB: { prepare() { return { async all() { throw new Error("D1 unavailable"); } }; } }, ASSETS: { fetch: async () => Response.json({ places: [belgo] }) } };
  assert.equal((await getVisibility({ env })).status, 503);
  assert.equal((await getVisibility({ env: {} })).status, 503);
  const response = await getPlaces({ request: request("/api/places"), env });
  assert.equal(response.status, 503);
  assert.deepEqual((await response.json()).places, []);
  const concierge = await processConciergeQuery(belgo.name, env, {}, false, "https://motkarta.test");
  assert.equal(concierge.status, 503);
});
