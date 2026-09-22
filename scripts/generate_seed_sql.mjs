import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { isExcludedCatalogPlace } from "../lib/catalog-exclusions.ts";

const input = resolve(process.argv[2] ?? "public/data/places.json");
const output = resolve(process.argv[3] ?? "drizzle/seed-places.sql");
const now = new Date().toISOString();

const rawData = JSON.parse(await readFile(input, "utf8"));
const places = (rawData.places ?? rawData).filter((place) => !isExcludedCatalogPlace(place));

const lines = [
  "DELETE FROM score_snapshots;",
  "DELETE FROM engagement_snapshots;",
  "DELETE FROM rating_snapshots;",
  "DELETE FROM specialty_coffee_attributes;",
  "DELETE FROM establishment_tags;",
  "DELETE FROM evidence_sources;",
];

function derivePriceLevel(place) {
  // Display prices are sourced separately; do not populate commercial/scoring tiers.
  return "NULL";
}

for (const place of places) {
  lines.push(
    `INSERT INTO establishments (id, name, type, district, description, price_level, latitude, longitude, chain_status, osm_type, osm_id, created_at, updated_at, address, website, opening_hours, price_sek) VALUES (${[
      place.id,
      sql(place.name),
      sql(place.kind),
      sql(place.area || "Stockholm"),
      sql(place.note || place.description || null),
      derivePriceLevel(place),
      place.latitude ?? "NULL",
      place.longitude ?? "NULL",
      sql(place.tags?.includes("Independent") ? "independent" : "unknown"),
      sql(null),
      sql(null),
      sql(now),
      sql(now),
      sql(place.address || null),
      sql(place.website || null),
      sql(place.openingHours || null),
      sql(place.priceSEK || null),
    ].join(", ")}) ON CONFLICT(id) DO UPDATE SET name=excluded.name, type=excluded.type, district=excluded.district, description=excluded.description, latitude=excluded.latitude, longitude=excluded.longitude, chain_status=excluded.chain_status, updated_at=excluded.updated_at, address=excluded.address, website=excluded.website, opening_hours=excluded.opening_hours, price_sek=excluded.price_sek;`,
  );

  if (Array.isArray(place.tags)) {
    for (const tag of place.tags) {
      lines.push(
        `INSERT INTO establishment_tags (establishment_id, tag) VALUES (${place.id}, ${sql(tag)});`,
      );
    }
  }

  if (place.specialty) {
    lines.push(
      `INSERT INTO specialty_coffee_attributes (establishment_id, specialty_verified, own_roastery, traceable_coffee, filter_coffee, espresso_based, rotating_roasters, single_origin, manual_brew_methods_json, decaf_available, beans_for_sale, verification_sources, updated_at) VALUES (${[
        place.id,
        bool(place.specialty.specialtyVerified),
        bool(place.specialty.ownRoastery),
        bool(place.specialty.traceableCoffee),
        bool(place.specialty.filterCoffee),
        bool(place.specialty.espressoBased),
        bool(place.specialty.rotatingRoasters),
        bool(place.specialty.singleOrigin),
        sql(JSON.stringify(place.specialty.manualBrewMethods || [])),
        bool(place.specialty.decafAvailable),
        bool(place.specialty.beansForSale),
        place.specialty.verificationSources || 1,
        sql(now),
      ].join(", ")});`,
    );
  }
}

await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${lines.join("\n")}\n`, "utf8");
console.log(`Wrote ${output} (${places.length} places)`);

function sql(value) {
  if (value === null || value === undefined) return "NULL";
  return `'${String(value).replace(/'/g, "''")}'`;
}

function bool(value) {
  return value ? 1 : 0;
}
