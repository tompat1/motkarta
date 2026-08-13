import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  normalizeOsmEstablishmentType,
  osmDescription,
  osmTags,
} from "../lib/osm-normalize.ts";
import { numericOrNull, parseCsv, sql } from "../lib/import-utils.ts";

const input = resolve(process.argv[2] ?? "data/stockholm_food_places.csv");
const output = resolve(process.argv[3] ?? "drizzle/seed-osm.sql");
const capturedAt = new Date().toISOString();

const rows = parseCsv(await readFile(input, "utf8"));
const lines = [
  "BEGIN TRANSACTION;",
  "-- OSM baseline import. Does not delete manually curated evidence.",
];

let imported = 0;
let skipped = 0;

for (const row of rows) {
  const type = normalizeOsmEstablishmentType(row);
  if (!type || !row.name || !row.osm_type || !row.osm_id) {
    skipped += 1;
    continue;
  }

  imported += 1;
  const description = osmDescription(row, type);
  const latitude = numericOrNull(row.latitude);
  const longitude = numericOrNull(row.longitude);
  const establishmentRef = `(SELECT id FROM establishments WHERE osm_type = ${sql(row.osm_type)} AND osm_id = ${sql(row.osm_id)} LIMIT 1)`;

  lines.push(
    `INSERT INTO establishments (name, type, district, description, price_level, latitude, longitude, chain_status, osm_type, osm_id, created_at, updated_at) VALUES (${[
      sql(row.name),
      sql(type),
      sql("Stockholm"),
      sql(description),
      "NULL",
      latitude,
      longitude,
      sql("unknown"),
      sql(row.osm_type),
      sql(row.osm_id),
      sql(capturedAt),
      sql(capturedAt),
    ].join(", ")}) ON CONFLICT(osm_type, osm_id) DO UPDATE SET name = excluded.name, type = excluded.type, description = excluded.description, latitude = excluded.latitude, longitude = excluded.longitude, updated_at = excluded.updated_at;`,
  );

  lines.push(
    `INSERT INTO evidence_sources (establishment_id, source_type, source_name, url, confidence, captured_at, summary) SELECT ${establishmentRef}, 'osm', 'OpenStreetMap', ${sql(osmUrl(row))}, 0.65, ${sql(capturedAt)}, ${sql(`OSM ${row.category} baseline import`)} WHERE ${establishmentRef} IS NOT NULL;`,
  );

  for (const tag of osmTags(row)) {
    lines.push(
      `INSERT INTO establishment_tags (establishment_id, tag) SELECT ${establishmentRef}, ${sql(tag)} WHERE ${establishmentRef} IS NOT NULL AND NOT EXISTS (SELECT 1 FROM establishment_tags WHERE establishment_id = ${establishmentRef} AND tag = ${sql(tag)});`,
    );
  }
}

lines.push("COMMIT;");

await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${lines.join("\n")}\n`, "utf8");
console.log(`Wrote ${output} (${imported} imported, ${skipped} skipped)`);

function osmUrl(row) {
  const type = row.osm_type === "node" ? "node" : row.osm_type === "way" ? "way" : "relation";
  return `https://www.openstreetmap.org/${type}/${row.osm_id}`;
}
