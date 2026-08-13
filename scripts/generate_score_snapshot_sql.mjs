import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { sql } from "../lib/import-utils.ts";
import { rowsToPlaceInputs } from "../lib/place-records.ts";
import { scorePlace } from "../lib/scoring.ts";

const input = resolve(process.argv[2] ?? "data/places-for-scoring.json");
const output = resolve(process.argv[3] ?? "drizzle/score-snapshots.sql");
const computedAt = new Date().toISOString();
const payload = JSON.parse(await readFile(input, "utf8"));
const places = normalizePlaces(payload);

const lines = [
  "BEGIN TRANSACTION;",
  "-- Score snapshot import. Scores are computed from exported PlaceInput records.",
];

for (const place of places) {
  const scored = scorePlace(place);
  lines.push(
    `INSERT INTO score_snapshots (establishment_id, quality_score, popularity_score, relevance_score, discovery_score, freshness_score, recommendation_score, computed_at) VALUES (${[
      sql(scored.id),
      sql(round(scored.scores.quality)),
      sql(round(scored.scores.popularity)),
      sql(round(scored.scores.relevance)),
      sql(round(scored.scores.discovery)),
      sql(round(scored.scores.freshness)),
      sql(round(scored.scores.recommendation)),
      sql(computedAt),
    ].join(", ")});`,
  );
}

lines.push("COMMIT;");

await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${lines.join("\n")}\n`, "utf8");
console.log(`Wrote ${output} (${places.length} score snapshots)`);

function extractRows(payload) {
  if (Array.isArray(payload)) {
    if (payload[0]?.results && Array.isArray(payload[0].results)) {
      return payload[0].results;
    }

    return payload;
  }

  if (Array.isArray(payload?.results)) {
    return payload.results;
  }

  throw new Error("Expected a JSON array, a Wrangler D1 JSON response, or an object with results.");
}

function normalizePlaces(payload) {
  if (Array.isArray(payload?.places)) {
    return payload.places;
  }

  if (payload?.rows && payload?.evidenceRows) {
    return rowsToPlaceInputs(payload.rows, payload.evidenceRows, payload.tagRows ?? []);
  }

  const rows = extractRows(payload);
  if (rows[0]?.kind && rows[0]?.evidence && rows[0]?.engagement) {
    return rows;
  }

  return rowsToPlaceInputs(rows);
}

function round(value) {
  return Math.round(value * 100) / 100;
}
