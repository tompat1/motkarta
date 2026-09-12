import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { isExcludedCatalogName, isExcludedCatalogPlace } from "../lib/catalog-exclusions.ts";
import { sanitizeAndAugmentPlaces } from "../src/app/place-sanitization.ts";
import { onRequestGet as getPlaces } from "../functions/api/places.ts";
import { eligiblePlace } from "../lib/concierge/gates.ts";

const fixture = JSON.parse(readFileSync(new URL("./fixtures/catalog-exclusions.json", import.meta.url), "utf8"));
const names = [...fixture.excluded, ...fixture.nonFood, ...fixture.included];
const places = names.map((name, id) => ({ id, name, kind: "Restaurant", area: "Södermalm", tags: [], chainStatus: "unknown" }));

test("excluded chains and hostels are removed before list/map/search/saved results", () => {
  assert.deepEqual(sanitizeAndAugmentPlaces(places).map((place) => place.name), fixture.included);
  assert.deepEqual(places.filter(eligiblePlace).map((place) => place.name), fixture.included);
});

test("published catalog and SQL seeds contain no O'Learys entries or dependent rows", () => {
  const catalog = JSON.parse(readFileSync(new URL("../public/data/places.json", import.meta.url), "utf8"));
  assert.equal(catalog.places.some(isExcludedCatalogPlace), false);
  assert.equal(catalog.totalPlaces, catalog.places.length);
  for (const file of ["seed-places.sql", "seed-osm.sql"]) {
    const sql = readFileSync(new URL(`../drizzle/${file}`, import.meta.url), "utf8");
    assert.equal(isExcludedCatalogName(sql), false);
    assert.doesNotMatch(sql, /\b(?:1745655804|2454920710|870110783|710212268|1707636603|11993313340|1622348307|4133378355)\b/);
  }
});

test("Tasstipset-only venues stay excluded while existing venues keep dog-friendly provenance", () => {
  assert.equal(isExcludedCatalogPlace({ id: 1015019099, name: "Scandic Continental" }), true);
  assert.equal(isExcludedCatalogPlace({ id: 1015019099, name: "Unrelated D1 venue" }), false);
  assert.equal(isExcludedCatalogPlace({ id: 123, name: "New Venue", sourceName: "Tasstipset" }), true);
  assert.equal(isExcludedCatalogPlace({ id: 123, name: "Existing Venue", sourceName: "OpenStreetMap", tags: ["Tasstipset", "Dog friendly"] }), false);
});

for (const mode of ["unbound", "empty", "populated", "failed"]) {
  test(`places API excludes O'Learys with ${mode} D1 and asset fallback`, async () => {
    const DB = mode === "unbound" ? undefined : {
      prepare: (query) => ({ all: async () => {
        if (mode === "failed") throw new Error("D1 unavailable");
        return { results: mode === "populated" && query.includes("FROM establishments")
          ? names.map((name, id) => ({ id, name, type: "Restaurant", district: "Södermalm", chain_status: "unknown" }))
          : [] };
      } }),
    };
    const response = await getPlaces({
      request: new Request("https://motkarta.test/api/places"),
      env: { DB, ASSETS: { fetch: async () => Response.json({ places }) } },
    });
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).places.map((place) => place.name), fixture.included);
  });
}
