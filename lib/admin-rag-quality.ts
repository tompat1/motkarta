export type RagComparisonMetricId =
  | "faithfulness"
  | "answerRelevance"
  | "contextPrecision"
  | "contextRecall"
  | "providerLatency";

export type RagComparisonMetric = {
  id: RagComparisonMetricId;
  baseline: number | null;
  current: number | null;
  unit: "ratio" | "milliseconds";
  evidence: string;
  evidenceSv: string;
};

export type RagTestResult = {
  id: "typecheck" | "lint" | "javascript" | "python" | "playwright" | "ragQuality";
  status: "passed" | "passed_with_retry";
  passed?: number;
  skipped?: number;
  flaky?: number;
  scope: "full_gate" | "rag_gate";
};

export type RagQualitySnapshot = {
  schemaVersion: "rag-quality-dashboard-v1";
  measuredAt: string;
  fixtureVersion: string;
  queryCount: number;
  intentFamilyCount: number;
  labelProvenance: string;
  baselineName: string;
  currentName: string;
  gateStatus: "passed_with_retry";
  passedTestCount: number;
  comparison: RagComparisonMetric[];
  retrievalSignals: {
    unsupportedAbstention: { baseline: number; current: number };
    exactNameSuccess: { baseline: number; current: number };
    catalogCoverage: { baseline: number; current: number };
    exposureGini: { baseline: number; current: number };
    independentExposureShare: { baseline: number | null; current: number };
  };
  slices: Array<{ id: "development" | "holdout" | "en" | "sv" | "pl" | "specialtyCoffee"; recallAt50: number }>;
  capacity: {
    saturatedCatalogSize: number;
    candidateLimit: number;
    returnedCandidates: number;
    duplicateCandidates: number;
    deterministic: boolean;
  };
  tests: RagTestResult[];
  limitations: Array<{ en: string; sv: string }>;
  sourceCommands: string[];
};

/**
 * Dated, source-labeled evidence from the 2026-11-21 local release gate.
 * This is intentionally a snapshot, not a fabricated live monitoring feed.
 */
export const RAG_QUALITY_SNAPSHOT: RagQualitySnapshot = {
  schemaVersion: "rag-quality-dashboard-v1",
  measuredAt: "2026-11-21",
  fixtureVersion: "concierge-query-fixtures-v1",
  queryCount: 128,
  intentFamilyCount: 32,
  labelProvenance:
    "Agent-authored source judgments against a synthetic catalog; not human satisfaction outcomes.",
  baselineName: "Historical lexical",
  currentName: "Corrected lexical",
  gateStatus: "passed_with_retry",
  passedTestCount: 841,
  comparison: [
    {
      id: "faithfulness",
      baseline: null,
      current: null,
      unit: "ratio",
      evidence: "Structural citation and fallback guardrails pass; no independent live generation score exists.",
      evidenceSv: "Strukturella citerings- och fallbackgrinder passerar; oberoende poäng för livegenerering saknas.",
    },
    {
      id: "answerRelevance",
      baseline: null,
      current: null,
      unit: "ratio",
      evidence: "Requires independently reviewed generated answers; retrieval labels are not a substitute.",
      evidenceSv: "Kräver oberoende granskade genererade svar; retrieval-etiketter är inte en ersättning.",
    },
    {
      id: "contextPrecision",
      baseline: 0.75,
      current: 0.9523809523809523,
      unit: "ratio",
      evidence: "NDCG@5 across the 128-query regression fixture.",
      evidenceSv: "NDCG@5 över regressionsfixturen med 128 frågor.",
    },
    {
      id: "contextRecall",
      baseline: 0.81,
      current: 0.9523809523809523,
      unit: "ratio",
      evidence: "Recall@50 across answerable source-labeled queries.",
      evidenceSv: "Recall@50 över besvarbara, källmärkta frågor.",
    },
    {
      id: "providerLatency",
      baseline: null,
      current: null,
      unit: "milliseconds",
      evidence: "Live BGE-M3, Vectorize, and Gemma latency requires an authorized provider capture.",
      evidenceSv: "Live-latens för BGE-M3, Vectorize och Gemma kräver en auktoriserad providerfångst.",
    },
  ],
  retrievalSignals: {
    unsupportedAbstention: { baseline: 0, current: 1 },
    exactNameSuccess: { baseline: 0.333, current: 1 },
    catalogCoverage: { baseline: 0.85, current: 0.75 },
    exposureGini: { baseline: 0.569, current: 0.4191358024691358 },
    independentExposureShare: { baseline: null, current: 1 },
  },
  slices: [
    { id: "development", recallAt50: 0.9642857142857143 },
    { id: "holdout", recallAt50: 0.9285714285714286 },
    { id: "en", recallAt50: 0.9848484848484849 },
    { id: "sv", recallAt50: 0.7857142857142857 },
    { id: "pl", recallAt50: 1 },
    { id: "specialtyCoffee", recallAt50: 1 },
  ],
  capacity: {
    saturatedCatalogSize: 80,
    candidateLimit: 50,
    returnedCandidates: 50,
    duplicateCandidates: 0,
    deterministic: true,
  },
  tests: [
    { id: "typecheck", status: "passed", scope: "full_gate" },
    { id: "lint", status: "passed", scope: "full_gate" },
    { id: "javascript", status: "passed", passed: 517, scope: "full_gate" },
    { id: "python", status: "passed", passed: 187, scope: "full_gate" },
    {
      id: "playwright",
      status: "passed_with_retry",
      passed: 137,
      skipped: 6,
      flaky: 1,
      scope: "full_gate",
    },
    { id: "ragQuality", status: "passed", passed: 2, scope: "rag_gate" },
  ],
  limitations: [
    {
      en: "Faithfulness and answer relevance do not have independent live-model scores yet.",
      sv: "Faktatrohet och svarsrelevans har ännu inga oberoende poäng från livemodellen.",
    },
    {
      en: "Provider latency, throughput, concurrency, and cost were not measured by the local gate.",
      sv: "Providerlatens, genomströmning, samtidighet och kostnad mättes inte av den lokala grinden.",
    },
    {
      en: "Hybrid semantic quality needs an authorized capture matched to the current corpus hash.",
      sv: "Hybrid semantisk kvalitet kräver en auktoriserad fångst som matchar aktuell corpus-hash.",
    },
    {
      en: "The regression labels are synthetic source judgments and do not measure user satisfaction.",
      sv: "Regressionsetiketterna är syntetiska källbedömningar och mäter inte användarnöjdhet.",
    },
  ],
  sourceCommands: [
    ".venv/bin/python execution/evaluate_concierge.py --split all",
    ".venv/bin/python -m pytest -q tests_python/test_concierge_quality_gate.py",
    "npm run rag:capture",
    "npm run test:gate",
  ],
};

export type LiveRagProviderCapture = {
  schemaVersion?: string;
  capturedAt?: string;
  measuredDate?: string;
  origin?: string;
  queryCount?: number;
  successfulQueries?: number;
  hybridQueries?: number;
  hybridActivationRate?: number;
  metrics?: {
    providerLatencyMedianMs?: number | null;
    providerLatencyP95Ms?: number | null;
    faithfulness?: number | null;
    answerRelevance?: number | null;
  };
};

export function applyLiveProviderCapture(
  base: RagQualitySnapshot,
  capture: LiveRagProviderCapture | null | undefined,
): RagQualitySnapshot {
  if (!capture?.metrics || !capture.successfulQueries) return base;
  const dateLabel = capture.measuredDate || capture.capturedAt?.slice(0, 10) || base.measuredAt;
  const sampleLabel = `${capture.successfulQueries}/${capture.queryCount ?? capture.successfulQueries}`;
  const hybridPct = Math.round((capture.hybridActivationRate ?? 0) * 100);
  const p95 = capture.metrics.providerLatencyP95Ms;

  return {
    ...base,
    measuredAt: dateLabel,
    comparison: base.comparison.map((metric) => {
      if (metric.id === "providerLatency" && typeof capture.metrics?.providerLatencyMedianMs === "number") {
        return {
          ...metric,
          current: capture.metrics.providerLatencyMedianMs,
          evidence: `Live ${capture.origin ?? "production"} capture (${dateLabel}, n=${sampleLabel}): median ${capture.metrics.providerLatencyMedianMs} ms${p95 ? `, p95 ${p95} ms` : ""}, hybrid ${hybridPct}%.`,
          evidenceSv: `Livefångst ${capture.origin ?? "produktion"} (${dateLabel}, n=${sampleLabel}): median ${capture.metrics.providerLatencyMedianMs} ms${p95 ? `, p95 ${p95} ms` : ""}, hybrid ${hybridPct}%.`,
        };
      }
      if (metric.id === "faithfulness" && typeof capture.metrics?.faithfulness === "number") {
        return {
          ...metric,
          current: capture.metrics.faithfulness,
          evidence: `Live citation-grounding check (${dateLabel}, n=${sampleLabel}) against ${capture.origin ?? "production"} /api/concierge.`,
          evidenceSv: `Livekontroll av citeringsstöd (${dateLabel}, n=${sampleLabel}) mot ${capture.origin ?? "produktion"} /api/concierge.`,
        };
      }
      if (metric.id === "answerRelevance" && typeof capture.metrics?.answerRelevance === "number") {
        return {
          ...metric,
          current: capture.metrics.answerRelevance,
          evidence: `Live intent-satisfaction check (${dateLabel}, n=${sampleLabel}) across Swedish & English queries.`,
          evidenceSv: `Livekontroll av avsiktsmatchning (${dateLabel}, n=${sampleLabel}) på svenska och engelska frågor.`,
        };
      }
      return metric;
    }),
  };
}
