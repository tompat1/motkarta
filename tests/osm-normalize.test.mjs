import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";

import { normalizeOsmEstablishmentType, osmTags } from "../lib/osm-normalize.ts";

const execFileAsync = promisify(execFile);

test("OSM normalization maps known categories to establishment types", () => {
  assert.equal(normalizeOsmEstablishmentType({ category: "restaurant" }), "Restaurant");
  assert.equal(normalizeOsmEstablishmentType({ category: "bakery" }), "Bakery");
  assert.equal(normalizeOsmEstablishmentType({ category: "cafe", cuisine: "coffee_shop" }), "Café");
  assert.equal(normalizeOsmEstablishmentType({ category: "coffee_roaster" }), "Specialty coffee");
  assert.equal(normalizeOsmEstablishmentType({ category: "coffee" }), "Specialty coffee");
});

test("OSM tags preserve structured source clues", () => {
  assert.deepEqual(
    osmTags({
      osm_type: "node",
      osm_id: "1",
      name: "Test",
      category: "coffee_roaster",
      cuisine: "coffee;bakery",
      opening_hours: "Mo-Fr",
      website: "https://example.com",
    }),
    ["Coffee Roaster", "Coffee", "Bakery", "Website", "Opening hours"],
  );
});

test("OSM seed generator emits D1 import SQL", async () => {
  const target = join(tmpdir(), `motkarta-osm-${process.pid}.sql`);
  await execFileAsync("node", [
    "scripts/generate_osm_seed_sql.mjs",
    "tests/fixtures/osm_sample.csv",
    target,
  ]);

  const sql = await readFile(target, "utf8");

  assert.match(sql, /Plain Cafe', 'Café'/);
  assert.match(sql, /Neighbourhood Bakery', 'Bakery'/);
  assert.match(sql, /Small Roaster', 'Specialty coffee'/);
  assert.match(sql, /Corner Restaurant', 'Restaurant'/);
  assert.match(sql, /ON CONFLICT\(osm_type, osm_id\)/);
});
