import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);

test("candidate import SQL upserts neutral metadata and preserves reviewed states", async () => {
  const source = join(tmpdir(), `motkarta-candidate-queue-${process.pid}.json`);
  const target = join(tmpdir(), `motkarta-candidate-import-${process.pid}.sql`);

  await writeFile(
    source,
    JSON.stringify({
      entries: [
        {
          id: "municipal-food-control:source-1",
          state: "candidate",
          sourceType: "municipal_unmatched",
          sourceId: "source-1",
          name: "Quiet Kitchen",
          address: "Kandgatan 12, Stockholm",
          latitude: 59.31,
          longitude: 18.02,
          sourceName: "Stockholms stad livsmedelskontroll",
          capturedAt: "2026-08-20",
          reviewStatus: "needs_osm_match_or_manual_place_creation",
          allowedUse: "Candidate existence evidence only.",
        },
        {
          id: "curated-submission:visit-stockholm-curated",
          state: "verified",
          sourceType: "curated_submission",
          sourceId: "visit-stockholm-curated",
          name: "Curated Trattoria",
          address: "Guidegatan 4, Stockholm",
          website: "https://curated.example",
          sourceUrl: "https://www.visitstockholm.se/",
          sourceName: "Visit Stockholm (Officiella Stadsguiden)",
          tags: ["Curated", "Visit Stockholm"],
        },
        {
          id: "osm-baseline:1",
          state: "baseline",
          sourceType: "osm_baseline",
          name: "Baseline Place",
        },
      ],
    }),
    "utf8",
  );

  await execFileAsync("node", ["scripts/generate_candidate_import_sql.mjs", source, target]);
  const generatedSql = await readFile(target, "utf8");

  assert.match(generatedSql, /INSERT INTO establishments/);
  assert.match(generatedSql, /candidate_source_type, candidate_source_id/);
  assert.match(generatedSql, /'municipal_unmatched', 'source-1'/);
  assert.match(generatedSql, /ON CONFLICT\(candidate_source_type, candidate_source_id\)/);
  assert.match(generatedSql, /lifecycle_state = CASE WHEN establishments.lifecycle_state IN \('verified', 'featured'\)/);
  assert.match(generatedSql, /INSERT INTO evidence_sources/);
  assert.match(generatedSql, /'curated_submission', 'visit-stockholm-curated'/);
  assert.match(generatedSql, /'editorial', 'Visit Stockholm \(Officiella Stadsguiden\)', 'https:\/\/www\.visitstockholm\.se\/'/);
  assert.match(generatedSql, /'Visit Stockholm'/);
  assert.doesNotMatch(generatedSql, /Baseline Place/);
  assert.doesNotMatch(generatedSql, /ratingAverage|reviewCount|priceLevel|prominence/);
});

test("candidate import SQL rejects forbidden value fields", async () => {
  const source = join(tmpdir(), `motkarta-candidate-forbidden-${process.pid}.json`);
  const target = join(tmpdir(), `motkarta-candidate-forbidden-${process.pid}.sql`);

  await writeFile(
    source,
    JSON.stringify({
      entries: [
        {
          id: "google-metadata:bad",
          state: "candidate",
          sourceType: "google_metadata",
          sourceId: "bad",
          name: "Bad Candidate",
          reviewCount: 900,
        },
      ],
    }),
    "utf8",
  );

  await assert.rejects(
    () => execFileAsync("node", ["scripts/generate_candidate_import_sql.mjs", source, target]),
    /forbidden value fields/i,
  );
});
