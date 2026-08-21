import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const [inputPath, outputPath = "outputs/human_validation_labels.json"] = process.argv.slice(2);

if (!inputPath) {
  throw new Error("usage: node scripts/export_review_labels.mjs data/review-events-export.json outputs/human_validation_labels.json");
}

const rows = extractRows(JSON.parse(await readFile(resolve(inputPath), "utf8")));
const latestByPlace = new Map();

for (const row of rows) {
  const key = String(row.establishment_id ?? row.id ?? "");
  if (!key || latestByPlace.has(key)) {
    continue;
  }
  latestByPlace.set(key, row);
}

const labels = [];
const duplicateResolutions = [];

for (const row of latestByPlace.values()) {
  const sourceType = clean(row.candidate_source_type);
  const sourceId = clean(row.candidate_source_id);
  const base = {
    id: `place:${row.establishment_id}`,
    name: clean(row.name),
    sourceType,
    sourceId,
    notes: clean(row.validation_notes),
    reviewedAt: clean(row.reviewed_at),
  };

  if (row.validation_label) {
    labels.push({
      ...base,
      label: clean(row.validation_label),
    });
  }

  if (row.duplicate_resolution || row.action === "merge_duplicate" || row.action === "keep_separate") {
    duplicateResolutions.push({
      ...base,
      action: clean(row.action),
      duplicateResolution: clean(row.duplicate_resolution),
      targetEstablishmentId: row.target_establishment_id ?? row.merged_into_establishment_id ?? null,
    });
  }
}

const output = {
  updatedAt: new Date().toISOString(),
  policy: "Human validation labels exported from admin review events. Duplicate resolutions are kept separate from hidden-gem/mainstream labels.",
  labels,
  duplicateResolutions,
};

await writeFile(resolve(outputPath), `${JSON.stringify(output, null, 2)}\n`, "utf8");
console.log(`Wrote ${outputPath} (${labels.length} labels, ${duplicateResolutions.length} duplicate resolutions)`);

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

function clean(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}
