import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const [placesPath, evidencePath, tagsPath, outputPath] = process.argv.slice(2);

if (!placesPath || !evidencePath || !tagsPath || !outputPath) {
  throw new Error(
    "usage: node scripts/combine_score_export.mjs data/place-export.json data/evidence-export.json data/tag-export.json data/score-input.json",
  );
}

const rows = extractRows(JSON.parse(await readFile(resolve(placesPath), "utf8")));
const evidenceRows = extractRows(JSON.parse(await readFile(resolve(evidencePath), "utf8")));
const tagRows = extractRows(JSON.parse(await readFile(resolve(tagsPath), "utf8")));

await writeFile(
  resolve(outputPath),
  `${JSON.stringify({ rows, evidenceRows, tagRows }, null, 2)}\n`,
  "utf8",
);

console.log(`Wrote ${outputPath} (${rows.length} places, ${evidenceRows.length} evidence rows, ${tagRows.length} tags)`);

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

  throw new Error("Expected a JSON array, Wrangler D1 JSON response, or object with results.");
}
