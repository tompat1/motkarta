import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { sql } from "../lib/import-utils.ts";

const args = process.argv.slice(2);
const input = resolve(args[0] ?? "outputs/candidate_queue.json");
const output = resolve(args[1] ?? "drizzle/seed-candidates.sql");
const importedAt = new Date().toISOString();
const allowedStates = new Set(["baseline", "candidate", "verified", "featured"]);
const allowedKinds = new Set(["Restaurant", "Bakery", "Café", "Specialty coffee"]);
const forbiddenValueFieldNames = new Set([
  "rating",
  "ratingAverage",
  "reliableRatingCount",
  "reviewCount",
  "review_count",
  "user_ratings_total",
  "reviews",
  "price_level",
  "priceLevel",
  "categoryPopularityRaw",
  "localPopularityPercentile",
  "mainstreamExposure",
  "engagement",
  "score",
  "scores",
  "popularity",
  "prominence",
]);
const stateFilter = parseStateFilter(args);

const payload = JSON.parse(await readFile(input, "utf8"));
const entries = Array.isArray(payload) ? payload : payload.entries;
if (!Array.isArray(entries)) {
  throw new Error("Candidate queue must be a JSON array or contain an entries array.");
}

const lines = [
  "BEGIN TRANSACTION;",
  "-- Candidate queue import. Neutral metadata only; preserves reviewed lifecycle decisions.",
];

let imported = 0;
let skipped = 0;

for (const entry of entries) {
  assertNoForbiddenValueFields(entry);

  if (!entry || typeof entry !== "object" || !entry.name) {
    skipped += 1;
    continue;
  }

  const state = normalizeState(entry.state);
  if (!stateFilter.has(state)) {
    skipped += 1;
    continue;
  }

  const sourceType = clean(entry.sourceType) || "candidate_queue";
  const sourceId = clean(entry.sourceId) || clean(entry.id);
  if (!sourceId) {
    skipped += 1;
    continue;
  }

  imported += 1;
  const name = clean(entry.name);
  const kind = normalizeKind(entry);
  const district = clean(entry.area) || "Stockholm";
  const address = clean(entry.address);
  const website = clean(entry.website);
  const sourceUrl = clean(entry.sourceUrl);
  const sourceName = clean(entry.sourceName) || sourceTypeLabel(sourceType);
  const reviewStatus = clean(entry.reviewStatus);
  const allowedUse = clean(entry.allowedUse);
  const description = candidateDescription({ sourceName, reviewStatus, allowedUse, address });
  const latitude = numberOrNull(entry.latitude);
  const longitude = numberOrNull(entry.longitude);
  const validationLabel = clean(entry.validationLabel);
  const validationNotes = clean(entry.validationNotes);
  const capturedAt = clean(entry.capturedAt) || importedAt;
  const evidenceSourceType = normalizeEvidenceSourceType(sourceType);
  const evidenceSummary = evidenceSummaryFor(entry, sourceName);
  const establishmentRef = `(SELECT id FROM establishments WHERE candidate_source_type = ${sql(sourceType)} AND candidate_source_id = ${sql(sourceId)} LIMIT 1)`;

  lines.push(
    `INSERT INTO establishments (name, type, district, description, price_level, latitude, longitude, chain_status, osm_type, osm_id, created_at, updated_at, lifecycle_state, validation_label, validation_notes, address, website, candidate_source_type, candidate_source_id, candidate_review_status, candidate_allowed_use) VALUES (${[
      sql(name),
      sql(kind),
      sql(district),
      sql(description),
      "NULL",
      latitude,
      longitude,
      sql("unknown"),
      "NULL",
      "NULL",
      sql(importedAt),
      sql(importedAt),
      sql(state),
      sql(validationLabel),
      sql(validationNotes),
      sql(address),
      sql(website),
      sql(sourceType),
      sql(sourceId),
      sql(reviewStatus),
      sql(allowedUse),
    ].join(", ")}) ON CONFLICT(candidate_source_type, candidate_source_id) DO UPDATE SET name = excluded.name, type = excluded.type, district = excluded.district, description = excluded.description, latitude = COALESCE(excluded.latitude, establishments.latitude), longitude = COALESCE(excluded.longitude, establishments.longitude), address = COALESCE(excluded.address, establishments.address), website = COALESCE(excluded.website, establishments.website), candidate_review_status = excluded.candidate_review_status, candidate_allowed_use = excluded.candidate_allowed_use, lifecycle_state = CASE WHEN establishments.lifecycle_state IN ('verified', 'featured') THEN establishments.lifecycle_state ELSE excluded.lifecycle_state END, validation_label = CASE WHEN establishments.validation_label IS NOT NULL THEN establishments.validation_label ELSE excluded.validation_label END, validation_notes = CASE WHEN establishments.validation_notes IS NOT NULL THEN establishments.validation_notes ELSE excluded.validation_notes END, updated_at = excluded.updated_at;`,
  );

  lines.push(
    `INSERT INTO evidence_sources (establishment_id, source_type, source_name, url, confidence, captured_at, summary) SELECT ${establishmentRef}, ${sql(evidenceSourceType)}, ${sql(sourceName)}, ${sql(sourceUrl || website)}, ${sql(confidenceForSource(sourceType))}, ${sql(capturedAt)}, ${sql(evidenceSummary)} WHERE ${establishmentRef} IS NOT NULL AND NOT EXISTS (SELECT 1 FROM evidence_sources WHERE establishment_id = ${establishmentRef} AND source_type = ${sql(evidenceSourceType)} AND source_name = ${sql(sourceName)});`,
  );

  lines.push(
    `INSERT INTO establishment_tags (establishment_id, tag) SELECT ${establishmentRef}, 'Candidate' WHERE ${establishmentRef} IS NOT NULL AND NOT EXISTS (SELECT 1 FROM establishment_tags WHERE establishment_id = ${establishmentRef} AND tag = 'Candidate');`,
  );

  for (const tag of normalizedTags(entry.tags)) {
    lines.push(
      `INSERT INTO establishment_tags (establishment_id, tag) SELECT ${establishmentRef}, ${sql(tag)} WHERE ${establishmentRef} IS NOT NULL AND NOT EXISTS (SELECT 1 FROM establishment_tags WHERE establishment_id = ${establishmentRef} AND tag = ${sql(tag)});`,
    );
  }
}

lines.push("COMMIT;");

await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${lines.join("\n")}\n`, "utf8");
console.log(`Wrote ${output} (${imported} imported, ${skipped} skipped)`);

function parseStateFilter(argv) {
  const defaultStates = new Set(["candidate", "verified", "featured"]);
  const index = argv.indexOf("--states");
  if (argv.includes("--all-states")) {
    return new Set(["baseline", "candidate", "verified", "featured"]);
  }

  if (index === -1 || !argv[index + 1]) {
    return defaultStates;
  }

  const states = argv[index + 1]
    .split(",")
    .map((state) => state.trim())
    .filter(Boolean);

  for (const state of states) {
    if (!allowedStates.has(state)) {
      throw new Error(`Unsupported candidate import state: ${state}`);
    }
  }

  return new Set(states);
}

function normalizeState(value) {
  const state = clean(value);
  return allowedStates.has(state) ? state : "candidate";
}

function normalizeKind(entry) {
  const kind = clean(entry.kind);
  if (allowedKinds.has(kind)) {
    return kind;
  }

  const text = `${entry.name ?? ""} ${entry.address ?? ""} ${entry.sourceType ?? ""}`.toLowerCase();
  if (text.includes("roaster") || text.includes("roastery") || text.includes("rosteri")) {
    return "Specialty coffee";
  }
  if (text.includes("bakery") || text.includes("bageri") || text.includes("bageriet")) {
    return "Bakery";
  }
  if (text.includes("café") || text.includes("cafe") || text.includes("kaffe")) {
    return "Café";
  }
  return "Restaurant";
}

function normalizeEvidenceSourceType(sourceType) {
  if (sourceType === "osm_baseline") return "osm";
  if (sourceType === "curated_submission") return "editorial";
  return sourceType;
}

function confidenceForSource(sourceType) {
  if (sourceType === "osm_baseline") return 0.65;
  if (sourceType === "municipal_unmatched") return 0.7;
  if (sourceType === "curated_submission") return 0.72;
  if (sourceType === "google_metadata") return 0.2;
  return 0.5;
}

function candidateDescription({ sourceName, reviewStatus, allowedUse, address }) {
  const parts = [
    `Candidate imported from ${sourceName}.`,
    reviewStatus ? `Review status: ${reviewStatus}.` : "",
    address ? `Address: ${address}.` : "",
    allowedUse ? `Allowed use: ${allowedUse}` : "",
  ].filter(Boolean);

  return parts.join(" ").slice(0, 900);
}

function evidenceSummaryFor(entry, sourceName) {
  const pieces = [
    `Candidate queue evidence from ${sourceName}.`,
    entry.reviewStatus ? `Review status: ${clean(entry.reviewStatus)}.` : "",
    entry.allowedUse ? `Allowed use: ${clean(entry.allowedUse)}` : "",
  ].filter(Boolean);
  return pieces.join(" ").slice(0, 900);
}

function sourceTypeLabel(sourceType) {
  if (sourceType === "google_metadata") return "Google Places metadata-only discovery";
  if (sourceType === "municipal_unmatched") return "Stockholms stad livsmedelskontroll";
  if (sourceType === "curated_submission") return "Curated submission";
  if (sourceType === "osm_baseline") return "OpenStreetMap";
  return "Candidate queue";
}

function normalizedTags(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return Array.from(
    new Set(
      value
        .map((tag) => clean(tag))
        .filter(Boolean)
        .filter((tag) => !["candidate"].includes(tag.toLowerCase())),
    ),
  );
}

function assertNoForbiddenValueFields(value, path = []) {
  const found = forbiddenValueFields(value, path);
  if (found.length) {
    throw new Error(`Candidate queue contains forbidden value fields: ${found.join(", ")}`);
  }
}

function forbiddenValueFields(value, path) {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => forbiddenValueFields(item, [...path, String(index)]));
  }

  if (!value || typeof value !== "object") {
    return [];
  }

  return Object.entries(value).flatMap(([key, nested]) => {
    const currentPath = [...path, key];
    const own = forbiddenValueFieldNames.has(key) ? [currentPath.join(".")] : [];
    return [...own, ...forbiddenValueFields(nested, currentPath)];
  });
}

function numberOrNull(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? String(parsed) : "NULL";
}

function clean(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}
