#!/usr/bin/env node
/**
 * Live RAG provider capture for Motkarta Concierge (BGE-M3 + Vectorize + Gemma/Template).
 *
 * Sends a representative Swedish & English evaluation batch to the live
 * `/api/concierge` endpoint, measures end-to-end provider latency, hybrid
 * retrieval activation, grounded citation faithfulness, and intent-level answer
 * relevance, and writes a dated artifact to `public/data/rag_provider_capture.json`.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const defaultOutput = path.join(root, "public/data/rag_provider_capture.json");
const urlArg = process.argv.find((value) => /^https?:\/\//.test(value));
const origin = new URL(urlArg ?? "https://motkarta.rynell.org").origin;
const outputPath = defaultOutput;

const EVAL_QUERIES = [
  { query: "bästa pizzeriorna i stan", language: "sv", expectMode: "answer", expectKeywords: ["pizza"] },
  { query: "god pasta nära Södermalm", language: "sv", expectMode: "answer", expectKeywords: ["södermalm", "pasta", "italian"] },
  { query: "äta fisk", language: "sv", expectMode: "answer", expectKeywords: ["fisk", "fish", "seafood", "herring", "strömming"] },
  { query: "Jag vill äta kött", language: "sv", expectMode: "answer", expectKeywords: ["steak", "grill", "bbq", "barbecue", "meat", "brisket"] },
  { query: "äta husman", language: "sv", expectMode: "answer", expectKeywords: ["svensk", "swedish", "husman", "pelikan", "operakällaren", "orangeriet"] },
  { query: "äta vegetariskt", language: "sv", expectMode: "answer", expectKeywords: ["vegetarian", "vegan", "plant", "hermans", "mahalo", "fotografiska"] },
  { query: "Drop Coffee Roasters", language: "en", expectMode: "answer", expectName: "Drop Coffee" },
  { query: "cozy place to unwind", language: "en", expectMode: "answer", expectKeywords: ["cozy", "mysig", "café", "cafe", "wine", "bar", "restaurant"] },
  { query: "specialty coffee Södermalm", language: "en", expectMode: "answer", expectKeywords: ["södermalm", "coffee", "specialty", "kaffe"] },
  { query: "bra surdegsbageri i Stockholm", language: "sv", expectMode: "answer", expectKeywords: ["bakery", "bageri", "surdeg", "sourdough", "bröd"] },
  { query: "mysig vinbar på Södermalm", language: "sv", expectMode: "answer", expectKeywords: ["vin", "wine", "bar", "södermalm"] },
  { query: "best sushi in Tokyo", language: "en", expectMode: "abstain" },
];

const PROHIBITED_COMMERCIAL_RE = /\b(\d\.\d\s*stars?|tripadvisor|google\s+rating|yelp\s+stars?)\b/i;

function percentile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return Math.round(sorted[idx]);
}

function evaluateFaithfulness(result, spec) {
  const cards = Array.isArray(result.cards) ? result.cards : [];
  const answerText = String(result.answer ?? "");
  if (PROHIBITED_COMMERCIAL_RE.test(answerText)) {
    return { score: 0, reason: "prohibited_commercial_claim" };
  }
  if (spec.expectMode === "abstain") {
    const abstained = cards.length === 0;
    return { score: abstained ? 1 : 0, reason: abstained ? "clean_abstention" : "returned_cards_on_out_of_scope" };
  }
  if (cards.length === 0) {
    return { score: 0, reason: "no_cards_returned" };
  }
  const citedCards = cards.filter((card) => Array.isArray(card.citations) && card.citations.length > 0);
  const citationRatio = citedCards.length / cards.length;
  return {
    score: Number(citationRatio.toFixed(4)),
    reason: citationRatio === 1 ? "all_cards_cited" : `cited_${citedCards.length}_of_${cards.length}`,
  };
}

function evaluateRelevance(result, spec) {
  const cards = Array.isArray(result.cards) ? result.cards : [];
  if (spec.expectMode === "abstain") {
    const ok = cards.length === 0;
    return { score: ok ? 1 : 0, reason: ok ? "abstained_correctly" : "failed_abstention" };
  }
  if (cards.length === 0) {
    return { score: 0, reason: "empty_results" };
  }
  if (spec.expectName) {
    const found = cards.some((card) => String(card.name ?? "").toLowerCase().includes(spec.expectName.toLowerCase()));
    return { score: found ? 1 : 0, reason: found ? "exact_name_matched" : "exact_name_missed" };
  }
  const blob = cards
    .map((card) => [
      card.name,
      card.area,
      card.whyItMatches,
      ...(Array.isArray(card.citations) ? card.citations.map((c) => `${c.field} ${c.value}`) : []),
    ].join(" "))
    .join(" ")
    .toLowerCase();
  const matched = (spec.expectKeywords ?? []).some((kw) => blob.includes(kw.toLowerCase()));
  return { score: matched ? 1 : 0, reason: matched ? "intent_matched" : "intent_mismatch" };
}

const checks = [];
for (const spec of EVAL_QUERIES) {
  const started = Date.now();
  const response = await fetch(`${origin}/api/concierge`, {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify({ query: spec.query, language: spec.language }),
    signal: AbortSignal.timeout(20000),
  });
  const elapsedMs = Date.now() - started;
  if (!response.ok) {
    const errText = (await response.text().catch(() => "")).slice(0, 300);
    checks.push({
      query: spec.query,
      language: spec.language,
      httpStatus: response.status,
      elapsedMs,
      error: errText,
      faithfulness: 0,
      answerRelevance: 0,
    });
    continue;
  }
  const result = await response.json();
  const faith = evaluateFaithfulness(result, spec);
  const rel = evaluateRelevance(result, spec);
  checks.push({
    query: spec.query,
    language: spec.language,
    httpStatus: response.status,
    elapsedMs,
    status: result.status,
    source: result.source,
    retrievalMode: result.retrievalMode,
    synthesisMode: result.synthesisMode,
    modelVersion: result.modelVersion,
    cardCount: Array.isArray(result.cards) ? result.cards.length : 0,
    topNames: (result.cards ?? []).slice(0, 3).map((c) => c.name),
    fallbackReasons: result.diagnostics?.fallbackReasons ?? [],
    timingsMs: result.diagnostics?.timingsMs ?? null,
    faithfulness: faith.score,
    faithfulnessReason: faith.reason,
    answerRelevance: rel.score,
    relevanceReason: rel.reason,
  });
}

const okChecks = checks.filter((c) => c.httpStatus === 200);
const latencies = okChecks.map((c) => c.elapsedMs);
const answerableOk = okChecks.filter((c) => c.query !== "best sushi in Tokyo");
const hybridCount = answerableOk.filter((c) => c.retrievalMode === "hybrid").length;
const avg = (arr) => (arr.length ? Number((arr.reduce((sum, n) => sum + n, 0) / arr.length).toFixed(4)) : null);

const report = {
  schemaVersion: "rag-provider-capture-v1",
  capturedAt: new Date().toISOString(),
  measuredDate: new Date().toISOString().slice(0, 10),
  origin,
  queryCount: checks.length,
  successfulQueries: okChecks.length,
  hybridQueries: hybridCount,
  hybridActivationRate: answerableOk.length ? Number((hybridCount / answerableOk.length).toFixed(4)) : 0,
  metrics: {
    providerLatencyMedianMs: percentile(latencies, 50),
    providerLatencyP95Ms: percentile(latencies, 95),
    faithfulness: avg(okChecks.map((c) => c.faithfulness)),
    answerRelevance: avg(okChecks.map((c) => c.answerRelevance)),
  },
  checks,
};

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, JSON.stringify(report, null, 2) + "\n", "utf8");
console.log(JSON.stringify({
  capturedAt: report.capturedAt,
  origin: report.origin,
  successfulQueries: `${report.successfulQueries}/${report.queryCount}`,
  hybridActivationRate: report.hybridActivationRate,
  metrics: report.metrics,
}, null, 2));
