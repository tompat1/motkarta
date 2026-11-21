import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { RAG_QUALITY_SNAPSHOT } from "../lib/admin-rag-quality.ts";

test("RAG dashboard evidence is complete, bounded, and honest about unmeasured metrics", () => {
  assert.equal(RAG_QUALITY_SNAPSHOT.queryCount, 128);
  assert.equal(RAG_QUALITY_SNAPSHOT.intentFamilyCount, 32);
  assert.equal(RAG_QUALITY_SNAPSHOT.passedTestCount, 841);
  assert.deepEqual(RAG_QUALITY_SNAPSHOT.tests.map((result) => result.id), [
    "typecheck", "lint", "javascript", "python", "playwright", "ragQuality",
  ]);
  assert.equal(RAG_QUALITY_SNAPSHOT.tests.find((result) => result.id === "javascript")?.passed, 517);
  assert.equal(RAG_QUALITY_SNAPSHOT.tests.find((result) => result.id === "python")?.passed, 187);
  assert.equal(RAG_QUALITY_SNAPSHOT.tests.find((result) => result.id === "playwright")?.passed, 137);
  assert.equal(RAG_QUALITY_SNAPSHOT.tests.find((result) => result.id === "playwright")?.flaky, 1);
  assert.equal(RAG_QUALITY_SNAPSHOT.capacity.returnedCandidates, RAG_QUALITY_SNAPSHOT.capacity.candidateLimit);
  assert.equal(RAG_QUALITY_SNAPSHOT.capacity.duplicateCandidates, 0);
  assert.equal(RAG_QUALITY_SNAPSHOT.capacity.deterministic, true);

  for (const id of ["faithfulness", "answerRelevance", "providerLatency"]) {
    const metric = RAG_QUALITY_SNAPSHOT.comparison.find((item) => item.id === id);
    assert.equal(metric?.baseline, null);
    assert.equal(metric?.current, null);
  }
});

test("RAG dashboard provides a dedicated menu, grouped comparison, table, and limitations", async () => {
  const dashboard = await readFile(new URL("../src/admin/AdminMlDashboard.tsx", import.meta.url), "utf8");
  const ragView = await readFile(new URL("../src/admin/AdminRagQualityDashboard.tsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");

  assert.match(dashboard, /activeSection === "rag"/);
  assert.match(dashboard, /<span>2\. RAG<\/span>/);
  assert.match(ragView, /admin-rag-grouped-chart/);
  assert.match(ragView, /<table>/);
  assert.match(ragView, /What this chart does not prove/);
  assert.match(ragView, /Not measured — provider capture required/);
  assert.match(styles, /\.admin-rag-grouped-chart/);
  assert.match(styles, /\.admin-rag-limitations/);
});
