import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";

import { assertEvidenceImportRecord, placeReference } from "../lib/evidence-import.ts";

const execFileAsync = promisify(execFile);

test("evidence import validates source type and confidence", () => {
  assert.throws(
    () =>
      assertEvidenceImportRecord({
        match: { name: "Test" },
        evidence: [{ sourceType: "scrape", sourceName: "Bad", confidence: 0.5 }],
      }),
    /Unsupported evidence source type/,
  );

  assert.throws(
    () =>
      assertEvidenceImportRecord({
        match: { name: "Test" },
        evidence: [{ sourceType: "editorial", sourceName: "Bad", confidence: 5 }],
      }),
    /confidence/,
  );
});

test("place reference prefers OSM identity over name matching", () => {
  assert.equal(
    placeReference({ match: { osmType: "node", osmId: "100", name: "Ignored" }, evidence: [] }),
    "(SELECT id FROM establishments WHERE osm_type = 'node' AND osm_id = '100' LIMIT 1)",
  );
});

test("evidence seed generator emits enrichment SQL", async () => {
  const source = join(tmpdir(), `motkarta-evidence-${process.pid}.json`);
  const target = join(tmpdir(), `motkarta-evidence-${process.pid}.sql`);
  await writeFile(
    source,
    JSON.stringify([
      {
        match: { osmType: "node", osmId: "300" },
        establishment: { type: "Specialty coffee", chainStatus: "independent" },
        evidence: [
          {
            sourceType: "specialist_guide",
            sourceName: "Manual review",
            confidence: 0.9,
            summary: "Verified specialty coffee.",
          },
        ],
        tags: ["Independent", "Filter"],
        specialty: {
          specialtyVerified: true,
          ownRoastery: true,
          traceableCoffee: true,
          filterCoffee: true,
          espressoBased: true,
          rotatingRoasters: false,
          singleOrigin: true,
          manualBrewMethods: ["V60"],
          decafAvailable: true,
          beansForSale: true,
          verificationSources: 1,
        },
      },
    ]),
    "utf8",
  );

  await execFileAsync("node", ["scripts/generate_evidence_seed_sql.mjs", source, target]);
  const sql = await readFile(target, "utf8");

  assert.match(sql, /UPDATE establishments SET type = 'Specialty coffee'/);
  assert.match(sql, /INSERT INTO evidence_sources/);
  assert.match(sql, /INSERT INTO specialty_coffee_attributes/);
  assert.match(sql, /ON CONFLICT\(establishment_id\) DO UPDATE/);
});
