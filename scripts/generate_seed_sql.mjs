import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const input = resolve(process.argv[2] ?? "public/data/places.json");
const output = resolve(process.argv[3] ?? "drizzle/seed-places.sql");
const now = new Date().toISOString();

const rawData = JSON.parse(await readFile(input, "utf8"));
const places = rawData.places ?? rawData;

const lines = [
  "BEGIN TRANSACTION;",
  "DELETE FROM score_snapshots;",
  "DELETE FROM engagement_snapshots;",
  "DELETE FROM rating_snapshots;",
  "DELETE FROM specialty_coffee_attributes;",
  "DELETE FROM establishment_tags;",
  "DELETE FROM evidence_sources;",
  "DELETE FROM establishments;",
];

for (const place of places) {
  lines.push(
    `INSERT INTO establishments (id, name, type, district, description, price_level, latitude, longitude, chain_status, osm_type, osm_id, created_at, updated_at, address, website) VALUES (${[
      place.id,
      sql(place.name),
      sql(place.kind),
      sql(place.area || "Stockholm"),
      sql(place.note || place.description || null),
      place.priceLevel ?? "NULL",
      place.latitude ?? "NULL",
      place.longitude ?? "NULL",
      sql(place.tags?.includes("Independent") ? "independent" : "unknown"),
      sql(null),
      sql(null),
      sql(now),
      sql(now),
      sql(place.address || null),
      sql(place.website || null),
    ].join(", ")});`,
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

lines.push("COMMIT;");

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
