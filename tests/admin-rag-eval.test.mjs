import test from "node:test";
import assert from "node:assert/strict";
import {
  simulateRagEvaluation,
  formatEuropeanDateTime,
  exportEvaluationsAsJson,
  INITIAL_RAG_EVALUATIONS,
} from "../lib/admin-rag-eval.ts";

test("simulateRagEvaluation parses 'Pizza' query accurately without falling back to bakery", () => {
  const result = simulateRagEvaluation("Pizza", "sv");

  assert.ok(result.cuisine.toLowerCase().includes("pizza"), `Expected Pizza in cuisine, got ${result.cuisine}`);
  assert.ok(result.superpower.toLowerCase().includes("pizza"), `Expected Pizza in superpower, got ${result.superpower}`);
  assert.ok(
    result.sampleMatch.includes("Omnipollos Hatt") ||
    result.sampleMatch.includes("800 Grader") ||
    result.sampleMatch.includes("Crisp Pizza Social"),
    `Expected actual pizza venues in sampleMatch, got:\n${result.sampleMatch}`
  );
  assert.ok(!result.sampleMatch.includes("Bageri Petrus"), "Pizza query should not return bakery");
  assert.ok(result.excludedChains.includes("Pizza Hut"), "Pizza query should filter Pizza Hut");
  assert.ok(result.excludedChains.includes("Domino's"), "Pizza query should filter Domino's");
});

test("simulateRagEvaluation parses 'Mysigt café med bra espresso på Södermalm'", () => {
  const result = simulateRagEvaluation("Mysigt café med bra espresso på Södermalm", "sv");

  assert.ok(result.cuisine.includes("Specialty Coffee"), `Expected Specialty Coffee, got ${result.cuisine}`);
  assert.equal(result.area, "Södermalm");
  assert.ok(result.superpower.includes("Specialty Coffee"));
  assert.ok(result.sampleMatch.includes("Drop Coffee") || result.sampleMatch.includes("Lykke"));
  assert.ok(result.excludedChains.includes("Starbucks"));
  assert.ok(result.excludedChains.includes("Espresso House"));
});

test("simulateRagEvaluation parses 'Tjeckisk öl och husmanskost'", () => {
  const result = simulateRagEvaluation("Tjeckisk öl och husmanskost", "sv");

  assert.ok(result.cuisine.includes("Tjeckiskt"));
  assert.ok(result.sampleMatch.includes("Soldaten Svejk"));
  assert.ok(result.excludedChains.includes("O'Learys"));
});

test("simulateRagEvaluation detects dog friendly superpower and outdoor seating", () => {
  const result = simulateRagEvaluation("Hundvänlig bistro med uteservering", "sv");

  assert.ok(result.superpower.includes("Hundvänligt"));
  assert.ok(result.superpower.includes("Uteservering"));
});

test("formatEuropeanDateTime formats into 24-hour European format with Stockholm/Gdańsk", () => {
  // Test with a fixed timestamp: 2026-09-11 12:30:00 UTC (14:30 CEST)
  const fixedDate = new Date("2026-09-11T12:30:00Z");
  const formatted = formatEuropeanDateTime(fixedDate, "sv");

  assert.ok(formatted.includes("2026-09-11"));
  assert.ok(formatted.includes("kl. 14:30"));
  assert.ok(formatted.includes("(Stockholm/Gdańsk)"));
  assert.ok(!formatted.includes("AM") && !formatted.includes("PM"), "Must be 24-hour format");
});

test("exportEvaluationsAsJson formats DPO pairs for Cloudflare Workers AI", () => {
  const jsonStr = exportEvaluationsAsJson(INITIAL_RAG_EVALUATIONS);
  const parsed = JSON.parse(jsonStr);

  assert.equal(parsed.targetModel, "@cf/meta/llama-3.1-8b-instruct");
  assert.ok(Array.isArray(parsed.dpoPairs));
  assert.equal(parsed.dpoPairs.length, INITIAL_RAG_EVALUATIONS.length);
  assert.ok(parsed.totalEvaluations >= 2);
  assert.ok(parsed.dpoPairs[0].prompt);
  assert.ok(parsed.dpoPairs[0].chosen);
});

test("simulateRagEvaluation and getInitialRagEvaluations support English localization", async () => {
  const { getInitialRagEvaluations } = await import("../lib/admin-rag-eval.ts");

  // English simulation test
  const enResult = simulateRagEvaluation("Pizza", "en");
  assert.equal(enResult.area, "Stockholm City Center");
  assert.ok(enResult.superpower.includes("Pizza"));
  assert.ok(enResult.factualityScore.includes("Zero Hallucinated Attributes"));
  assert.ok(enResult.sampleMatch.includes("Verified Double-Lock"));

  // English initial evaluations test
  const enDefaults = getInitialRagEvaluations("en");
  assert.equal(enDefaults.length, 2);
  assert.equal(enDefaults[0].extractedCuisine, "European Dining (Previous Bug)");
  assert.ok(enDefaults[0].feedbackNotes.includes("Previously, a general query"));
  assert.ok(enDefaults[0].tags.includes("❌ Wrong category/cuisine"));
  assert.ok(!enDefaults[0].formattedTime.includes("kl."));
});
