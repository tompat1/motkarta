import React from "react";
import { CheckCircle, Clock, Graph, ShieldCheck, Warning } from "@phosphor-icons/react";

import type {
  RagComparisonMetricId,
  RagQualitySnapshot,
  RagTestResult,
} from "../../lib/admin-rag-quality";
import type { Language } from "../app/shared";

const metricCopy: Record<
  RagComparisonMetricId,
  { sv: string; en: string; detailSv: string; detailEn: string }
> = {
  faithfulness: {
    sv: "Faktatrohet",
    en: "Faithfulness",
    detailSv: "Påståenden stöds av hämtad kontext",
    detailEn: "Claims stay within retrieved context",
  },
  answerRelevance: {
    sv: "Svarsrelevans",
    en: "Answer relevance",
    detailSv: "Svaret möter frågans avsikt direkt",
    detailEn: "The answer directly addresses the request",
  },
  contextPrecision: {
    sv: "Kontextprecision",
    en: "Context precision",
    detailSv: "NDCG@5 — rätt fakta rankas tidigt",
    detailEn: "NDCG@5 — relevant facts rank first",
  },
  contextRecall: {
    sv: "Kontextåterkallning",
    en: "Context recall",
    detailSv: "Recall@50 — nödvändiga kandidater hittas",
    detailEn: "Recall@50 — required candidates are found",
  },
  providerLatency: {
    sv: "Providerlatens",
    en: "Provider latency",
    detailSv: "BGE-M3 + Vectorize + Gemma, slutpunkt till slutpunkt",
    detailEn: "BGE-M3 + Vectorize + Gemma, end to end",
  },
};

const testCopy: Record<RagTestResult["id"], { sv: string; en: string }> = {
  typecheck: { sv: "TypeScript & typer", en: "TypeScript & types" },
  lint: { sv: "ESLint & Ruff", en: "ESLint & Ruff" },
  javascript: { sv: "JavaScript-enhetstester", en: "JavaScript unit tests" },
  python: { sv: "Python ML & pipeline", en: "Python ML & pipeline" },
  playwright: { sv: "Playwright webbläsartester", en: "Playwright browser tests" },
  ragQuality: { sv: "RAG kvalitets- och kapacitetsgrind", en: "RAG quality & capacity gate" },
};

const sliceCopy = {
  development: { sv: "Utveckling", en: "Development" },
  holdout: { sv: "Regression holdout", en: "Regression holdout" },
  en: { sv: "Engelska", en: "English" },
  sv: { sv: "Svenska", en: "Swedish" },
  pl: { sv: "Polska", en: "Polish" },
  specialtyCoffee: { sv: "Specialkaffe", en: "Specialty coffee" },
} as const;

function percent(value: number | null, digits = 1): string {
  return value === null ? "—" : `${(value * 100).toFixed(digits)}%`;
}

function testResultText(result: RagTestResult, lang: Language): string {
  if (result.id === "typecheck" || result.id === "lint") {
    return lang === "sv" ? "Godkänd" : "Passed";
  }
  const parts = [
    `${result.passed ?? 0} ${lang === "sv" ? "godkända" : "passed"}`,
  ];
  if (result.skipped) parts.push(`${result.skipped} ${lang === "sv" ? "överhoppade" : "skipped"}`);
  if (result.flaky) parts.push(`${result.flaky} ${lang === "sv" ? "godkänd vid omkörning" : "passed on retry"}`);
  return parts.join(" · ");
}

export function AdminRagQualityDashboard({
  evaluation,
  lang,
}: {
  evaluation: RagQualitySnapshot;
  lang: Language;
}) {
  const sv = lang === "sv";
  const scoredMetrics = evaluation.comparison.filter(
    (metric) => metric.unit === "ratio" && metric.baseline !== null && metric.current !== null,
  );

  return (
    <section className="admin-rag-quality" aria-labelledby="rag-quality-title">
      <header className="admin-rag-quality-header">
        <div>
          <h4 id="rag-quality-title">
            {sv ? "RAG-kvalitet, säkerhet och kapacitet" : "RAG quality, safety & capacity"}
          </h4>
          <p>
            {sv
              ? "Daterad release-evidens från den verkliga lokala retrievern. Mätta värden visas som siffror; saknade provider- och generationsmått markeras öppet."
              : "Dated release evidence from the real local retriever. Measured values are numeric; missing provider and generation metrics are explicitly marked."}
          </p>
        </div>
        <div className="admin-rag-gate-status" role="status">
          <CheckCircle size={18} weight="fill" aria-hidden="true" />
          <span>{sv ? "Releasegrind godkänd" : "Release gate passed"}</span>
          <small>{evaluation.measuredAt}</small>
        </div>
      </header>

      <dl className="admin-rag-evidence-strip">
        <div>
          <dt>{sv ? "Godkända tester" : "Passing tests"}</dt>
          <dd>{evaluation.passedTestCount}</dd>
        </div>
        <div>
          <dt>{sv ? "Benchmarkfrågor" : "Benchmark queries"}</dt>
          <dd>{evaluation.queryCount}</dd>
        </div>
        <div>
          <dt>{sv ? "Avsiktsfamiljer" : "Intent families"}</dt>
          <dd>{evaluation.intentFamilyCount}</dd>
        </div>
        <div>
          <dt>{sv ? "Kandidatbudget" : "Candidate budget"}</dt>
          <dd>
            {evaluation.capacity.returnedCandidates}/{evaluation.capacity.candidateLimit}
          </dd>
        </div>
      </dl>

      <section className="admin-rag-comparison" aria-labelledby="rag-comparison-title">
        <div className="admin-rag-section-heading">
          <div>
            <h5 id="rag-comparison-title">
              <Graph size={18} weight="bold" aria-hidden="true" />
              {sv ? "Baseline mot nuvarande RAG" : "Baseline vs current RAG"}
            </h5>
            <p>
              {sv
                ? "Grupperad jämförelse för RAG-triaden, retrieval och latens. Endast oberoende mätta värden får staplar."
                : "Grouped comparison for the RAG triad, retrieval, and latency. Only independently measured values receive bars."}
            </p>
          </div>
          <div className="admin-rag-chart-legend" aria-label={sv ? "Diagramförklaring" : "Chart legend"}>
            <span><i className="baseline" />{evaluation.baselineName}</span>
            <span><i className="current" />{evaluation.currentName}</span>
          </div>
        </div>

        <div
          className="admin-rag-grouped-chart"
          role="img"
          aria-label={sv
            ? "Grupperat stapeldiagram över historisk och korrigerad retrieval samt omätta RAG-mått"
            : "Grouped bar chart of historical and corrected retrieval plus unmeasured RAG metrics"}
        >
          {evaluation.comparison.map((metric) => {
            const copy = metricCopy[metric.id];
            const measured = metric.baseline !== null && metric.current !== null && metric.unit === "ratio";
            return (
              <div className={`admin-rag-chart-row ${measured ? "is-measured" : "is-unmeasured"}`} key={metric.id}>
                <div className="admin-rag-chart-label">
                  <strong>{sv ? copy.sv : copy.en}</strong>
                  <span>{sv ? copy.detailSv : copy.detailEn}</span>
                </div>
                {measured ? (
                  <div className="admin-rag-bar-pair" aria-hidden="true">
                    <div>
                      <span>{sv ? "Bas" : "Base"}</span>
                      <div className="admin-rag-bar-track"><i className="baseline" style={{ width: percent(metric.baseline, 3) }} /></div>
                    </div>
                    <div>
                      <span>{sv ? "Nu" : "Now"}</span>
                      <div className="admin-rag-bar-track"><i className="current" style={{ width: percent(metric.current, 3) }} /></div>
                    </div>
                  </div>
                ) : (
                  <div className="admin-rag-unmeasured">
                    <Clock size={16} aria-hidden="true" />
                    <span>{sv ? "Inte mätt — providerfångst krävs" : "Not measured — provider capture required"}</span>
                  </div>
                )}
                <div className="admin-rag-chart-values">
                  {measured ? (
                    <>
                      <span>{percent(metric.baseline)}</span>
                      <strong>{percent(metric.current)}</strong>
                    </>
                  ) : (
                    <span>{sv ? "Ingen poäng" : "No score"}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <details className="admin-rag-data-table">
          <summary>{sv ? "Visa exakta värden och evidens" : "View exact values and evidence"}</summary>
          <div className="admin-rag-table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{sv ? "Mått" : "Metric"}</th>
                  <th>{evaluation.baselineName}</th>
                  <th>{evaluation.currentName}</th>
                  <th>{sv ? "Evidens" : "Evidence"}</th>
                </tr>
              </thead>
              <tbody>
                {evaluation.comparison.map((metric) => {
                  const copy = metricCopy[metric.id];
                  return (
                    <tr key={metric.id}>
                      <th scope="row">{sv ? copy.sv : copy.en}</th>
                      <td>{metric.unit === "ratio" ? percent(metric.baseline) : "—"}</td>
                      <td>{metric.unit === "ratio" ? percent(metric.current) : "—"}</td>
                      <td>{sv ? metric.evidenceSv : metric.evidence}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </details>
      </section>

      <div className="admin-rag-evidence-grid">
        <section className="admin-rag-test-ledger" aria-labelledby="rag-test-ledger-title">
          <div className="admin-rag-section-heading">
            <div>
              <h5 id="rag-test-ledger-title">
                <CheckCircle size={18} weight="bold" aria-hidden="true" />
                {sv ? "Fullständig testgrind" : "Complete test gate"}
              </h5>
              <p>{sv ? "Senaste registrerade lokala körning." : "Latest recorded local run."}</p>
            </div>
          </div>
          <ul>
            {evaluation.tests.map((result) => (
              <li key={result.id}>
                <CheckCircle size={17} weight="fill" aria-hidden="true" />
                <span>
                  <strong>{sv ? testCopy[result.id].sv : testCopy[result.id].en}</strong>
                  <small>{testResultText(result, lang)}</small>
                </span>
                <em>{result.scope === "rag_gate" ? "RAG" : sv ? "FULL GRIND" : "FULL GATE"}</em>
              </li>
            ))}
          </ul>
        </section>

        <section className="admin-rag-safety" aria-labelledby="rag-safety-title">
          <div className="admin-rag-section-heading">
            <div>
              <h5 id="rag-safety-title">
                <ShieldCheck size={18} weight="bold" aria-hidden="true" />
                {sv ? "Retrieval, säkerhet och exponering" : "Retrieval, safety & exposure"}
              </h5>
              <p>{sv ? "Mätta resultat från samma 128 frågor." : "Measured on the same 128 queries."}</p>
            </div>
          </div>
          <dl>
            <div><dt>{sv ? "Avstår vid ej stödd fråga" : "Unsupported-query abstention"}</dt><dd>{percent(evaluation.retrievalSignals.unsupportedAbstention.current)}</dd></div>
            <div><dt>{sv ? "Exakt namn som toppresultat" : "Exact-name top result"}</dt><dd>{percent(evaluation.retrievalSignals.exactNameSuccess.current)}</dd></div>
            <div><dt>{sv ? "Oberoende exponering" : "Independent exposure"}</dt><dd>{percent(evaluation.retrievalSignals.independentExposureShare.current)}</dd></div>
            <div><dt>{sv ? "Katalogtäckning" : "Catalog coverage"}</dt><dd>{percent(evaluation.retrievalSignals.catalogCoverage.current)}</dd></div>
            <div><dt>{sv ? "Exponerings-Gini, lägre är bättre" : "Exposure Gini, lower is better"}</dt><dd>{evaluation.retrievalSignals.exposureGini.current.toFixed(3)}</dd></div>
            <div><dt>{sv ? "Dubbletter vid kapacitetsgräns" : "Duplicates at capacity"}</dt><dd>{evaluation.capacity.duplicateCandidates}</dd></div>
          </dl>
        </section>
      </div>

      <section className="admin-rag-slices" aria-labelledby="rag-slices-title">
        <div className="admin-rag-section-heading">
          <div>
            <h5 id="rag-slices-title">{sv ? "Recall@50 per kritisk delmängd" : "Recall@50 by critical slice"}</h5>
            <p>{sv ? "Små delmängder är regressionssignaler, inte populationsestimat." : "Small slices are regression signals, not population estimates."}</p>
          </div>
        </div>
        <div className="admin-rag-slice-list">
          {evaluation.slices.map((slice) => (
            <div key={slice.id}>
              <span>{sv ? sliceCopy[slice.id].sv : sliceCopy[slice.id].en}</span>
              <div className="admin-rag-slice-track" aria-hidden="true"><i style={{ width: percent(slice.recallAt50, 3) }} /></div>
              <strong>{percent(slice.recallAt50)}</strong>
            </div>
          ))}
        </div>
      </section>

      <aside className="admin-rag-limitations" aria-labelledby="rag-limitations-title">
        <Warning size={20} weight="fill" aria-hidden="true" />
        <div>
          <h5 id="rag-limitations-title">{sv ? "Vad diagrammet inte bevisar" : "What this chart does not prove"}</h5>
          <ul>
            {evaluation.limitations.map((limitation) => (
              <li key={limitation.en}>{sv ? limitation.sv : limitation.en}</li>
            ))}
          </ul>
          <p>
            {sv ? "Källor" : "Sources"}: {evaluation.sourceCommands.join(" · ")}
          </p>
        </div>
      </aside>
    </section>
  );
}
