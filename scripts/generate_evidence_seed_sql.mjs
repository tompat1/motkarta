import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { assertEvidenceImportRecord, placeReference } from "../lib/evidence-import.ts";
import { sql } from "../lib/import-utils.ts";

const input = resolve(process.argv[2] ?? "data/evidence.json");
const output = resolve(process.argv[3] ?? "drizzle/seed-evidence.sql");
const records = JSON.parse(await readFile(input, "utf8"));
const importedAt = new Date().toISOString();

if (!Array.isArray(records)) {
  throw new Error("Evidence import file must contain a JSON array.");
}

const lines = [
  "BEGIN TRANSACTION;",
  "-- Manual evidence enrichment. Matches existing places by OSM id or exact name.",
];

let imported = 0;

for (const record of records) {
  assertEvidenceImportRecord(record);
  imported += 1;
  const establishmentRef = placeReference(record);

  if (record.establishment) {
    const updates = [
      record.establishment.name ? `name = ${sql(record.establishment.name)}` : null,
      record.establishment.type ? `type = ${sql(record.establishment.type)}` : null,
      record.establishment.district ? `district = ${sql(record.establishment.district)}` : null,
      record.establishment.description ? `description = ${sql(record.establishment.description)}` : null,
      typeof record.establishment.priceLevel === "number"
        ? `price_level = ${sql(record.establishment.priceLevel)}`
        : null,
      typeof record.establishment.latitude === "number"
        ? `latitude = ${sql(record.establishment.latitude)}`
        : null,
      typeof record.establishment.longitude === "number"
        ? `longitude = ${sql(record.establishment.longitude)}`
        : null,
      record.establishment.chainStatus ? `chain_status = ${sql(record.establishment.chainStatus)}` : null,
      `updated_at = ${sql(importedAt)}`,
    ].filter(Boolean);

    if (updates.length) {
      lines.push(`UPDATE establishments SET ${updates.join(", ")} WHERE id = ${establishmentRef};`);
    }
  }

  for (const evidence of record.evidence) {
    const capturedAt = evidence.capturedAt ?? importedAt;
    lines.push(
      `INSERT INTO evidence_sources (establishment_id, source_type, source_name, url, confidence, captured_at, summary) SELECT ${establishmentRef}, ${sql(evidence.sourceType)}, ${sql(evidence.sourceName)}, ${sql(evidence.url)}, ${sql(evidence.confidence)}, ${sql(capturedAt)}, ${sql(evidence.summary)} WHERE ${establishmentRef} IS NOT NULL;`,
    );
  }

  for (const tag of record.tags ?? []) {
    lines.push(
      `INSERT INTO establishment_tags (establishment_id, tag) SELECT ${establishmentRef}, ${sql(tag)} WHERE ${establishmentRef} IS NOT NULL AND NOT EXISTS (SELECT 1 FROM establishment_tags WHERE establishment_id = ${establishmentRef} AND tag = ${sql(tag)});`,
    );
  }

  if (record.specialty) {
    lines.push(
      `INSERT INTO specialty_coffee_attributes (establishment_id, specialty_verified, own_roastery, traceable_coffee, filter_coffee, espresso_based, rotating_roasters, single_origin, manual_brew_methods_json, decaf_available, beans_for_sale, verification_sources, updated_at) SELECT ${[
        establishmentRef,
        sql(record.specialty.specialtyVerified),
        sql(record.specialty.ownRoastery),
        sql(record.specialty.traceableCoffee),
        sql(record.specialty.filterCoffee),
        sql(record.specialty.espressoBased),
        sql(record.specialty.rotatingRoasters),
        sql(record.specialty.singleOrigin),
        sql(JSON.stringify(record.specialty.manualBrewMethods)),
        sql(record.specialty.decafAvailable),
        sql(record.specialty.beansForSale),
        sql(record.specialty.verificationSources),
        sql(importedAt),
      ].join(", ")} WHERE ${establishmentRef} IS NOT NULL ON CONFLICT(establishment_id) DO UPDATE SET specialty_verified = excluded.specialty_verified, own_roastery = excluded.own_roastery, traceable_coffee = excluded.traceable_coffee, filter_coffee = excluded.filter_coffee, espresso_based = excluded.espresso_based, rotating_roasters = excluded.rotating_roasters, single_origin = excluded.single_origin, manual_brew_methods_json = excluded.manual_brew_methods_json, decaf_available = excluded.decaf_available, beans_for_sale = excluded.beans_for_sale, verification_sources = excluded.verification_sources, updated_at = excluded.updated_at;`,
    );
  }
}

lines.push("COMMIT;");

await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${lines.join("\n")}\n`, "utf8");
console.log(`Wrote ${output} (${imported} records)`);
