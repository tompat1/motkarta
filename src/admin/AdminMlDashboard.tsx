import { useCallback, useEffect, useState } from "react";
import type { Language } from "../app/shared";
import { ArrowsOut, CircleNotch, Clock, Copy, Image, Scales, ShieldCheck, Sliders, Sparkle, TerminalWindow } from "@phosphor-icons/react";

type MlStatusResponse = {
  source?: string;
  timestamp?: string;
  models?: Array<{
    id: string;
    name: string;
    type: string;
    validation: string;
    status: string;
    description: string;
    metrics: Record<string, unknown>;
  }>;
  seabornCharts?: Array<{
    id: string;
    title: string;
    url: string;
    description: string;
  }>;
  lifecycleStages?: Array<{
    stage: string;
    completion: number;
    status: string;
    notes: string;
  }>;
  gapsAndImprovements?: Array<{
    id: string;
    title: string;
    impactScore: number;
    category: string;
    problem: string;
    solution: string;
  }>;
  telemetry?: {
    totalEvents?: number;
    last24hEvents?: number;
    eventsByMode?: Record<string, number>;
    eventsByType?: Record<string, number>;
    positionDistribution?: Record<string, number>;
  };
  codeSnippets?: Array<{
    id: string;
    title: string;
    filename: string;
    description: string;
    code: string;
  }>;
  error?: string;
};

export function AdminMlDashboard({
  lang = "sv",
  adminHeaders,
  hasAdminAuth,
}: {
  lang?: Language;
  adminHeaders: (tokenOverride?: string, extraHeaders?: Record<string, string>) => Record<string, string>;
  hasAdminAuth: boolean;
}) {
  const [data, setData] = useState<MlStatusResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("model_discovery");
  const [activeChartTab, setActiveChartTab] = useState("eda_feature_relationships");
  const [previewChartUrl, setPreviewChartUrl] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const loadMlStatus = useCallback(async () => {
    if (!hasAdminAuth) return;
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch("/api/admin/ml-status", {
        headers: adminHeaders(),
      });
      const res = (await resp.json().catch(() => ({}))) as MlStatusResponse;
      if (!resp.ok) {
        throw new Error(res.error ?? (lang === "sv" ? "Kunde inte ladda ML-status." : "Could not load ML status."));
      }
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [hasAdminAuth, adminHeaders, lang]);

  useEffect(() => {
    void loadMlStatus();
  }, [loadMlStatus]);

  const copyCode = (codeText: string, id: string) => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      void navigator.clipboard.writeText(codeText);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  if (loading && !data) {
    return (
      <div className="admin-review-empty">
        <CircleNotch size={20} className="animate-spin" />
        <span>{lang === "sv" ? "Laddar ML-modeller & Seaborn-grafer..." : "Loading ML models & Seaborn charts..."}</span>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="admin-review-empty">
        <span className="admin-review-error">{error}</span>
      </div>
    );
  }

  const activeSnippet = data?.codeSnippets?.find((s) => s.id === activeTab) ?? data?.codeSnippets?.[0];
  const activeSeabornChart = data?.seabornCharts?.find((c) => c.id === activeChartTab) ?? data?.seabornCharts?.[0];

  return (
    <div className="admin-ml-container">
      <header className="admin-ml-header">
        <div className="admin-ml-title-group">
          <h3>
            <Sparkle size={20} weight="fill" style={{ color: "var(--color-gold)" }} />
            {lang === "sv" ? "Machine Learning Status, Seaborn Grafer & Livscykel" : "Machine Learning Status, Seaborn Charts & Lifecycle"}
          </h3>
          <p>
            {lang === "sv"
              ? "Fullständig livscykel för Motkartas ML-modeller, Seaborn EDA- & Residualgrafer, samt identifierade systemluckor."
              : "Complete lifecycle for Motkarta's ML models, Seaborn EDA & Residual graphs, and identified system gaps."}
          </p>
        </div>
        <button type="button" className="admin-ml-refresh-btn" onClick={() => void loadMlStatus()} disabled={loading}>
          {loading ? <CircleNotch size={14} className="animate-spin" /> : <Clock size={14} weight="bold" />}
          {lang === "sv" ? "Uppdatera status" : "Refresh status"}
        </button>
      </header>

      {/* 1. Model Status Cards */}
      <div className="admin-ml-cards-grid">
        {(data?.models ?? []).map((model) => (
          <div key={model.id} className="admin-ml-card">
            <div className="admin-ml-card-header">
              <span className="admin-ml-status-pill">{model.status}</span>
              <span className="admin-ml-model-type">{model.type}</span>
            </div>
            <h4>{model.name}</h4>
            <p className="admin-ml-card-desc">{model.description}</p>
            <div className="admin-ml-validation-tag">
              <ShieldCheck size={12} weight="bold" /> {model.validation}
            </div>
            <div className="admin-ml-metrics-row">
              {Object.entries(model.metrics).map(([k, v]) => (
                <div key={k} className="admin-ml-metric-badge">
                  <span className="admin-ml-metric-key">{k}</span>
                  <span className="admin-ml-metric-val">{Array.isArray(v) ? v.length : String(v)}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* 2. Python Seaborn Visualization Gallery */}
      <div className="admin-ml-seaborn-section">
        <div className="admin-ml-seaborn-header">
          <h4>
            <Image size={18} weight="bold" />
            {lang === "sv" ? "Python Seaborn Grafer & Diagnosticering" : "Python Seaborn Charts & Diagnostics"}
          </h4>
          <p>
            {lang === "sv"
              ? "Genererade Seaborn EDA-plots, korrelationsmatriser, residualfelevalvering och Isolation Forest avvikelser."
              : "Generated Seaborn EDA plots, correlation matrices, residual error evaluation, and Isolation Forest outliers."}
          </p>
        </div>

        {/* Seaborn Chart Selector Tabs */}
        <div className="admin-ml-code-tabs">
          {(data?.seabornCharts ?? []).map((chart) => (
            <button
              key={chart.id}
              type="button"
              className={`admin-ml-code-tab ${activeChartTab === chart.id ? "active" : ""}`}
              onClick={() => setActiveChartTab(chart.id)}
            >
              <span>{chart.title}</span>
            </button>
          ))}
        </div>

        {/* Display Active Seaborn Chart */}
        {activeSeabornChart ? (
          <div className="admin-ml-seaborn-display-card">
            <div className="admin-ml-seaborn-topbar">
              <div>
                <h5>{activeSeabornChart.title}</h5>
                <small>{activeSeabornChart.description}</small>
              </div>
              <button
                type="button"
                className="admin-ml-copy-btn"
                onClick={() => setPreviewChartUrl(activeSeabornChart.url)}
              >
                <ArrowsOut size={13} weight="bold" />
                {lang === "sv" ? "Förstora graf" : "Enlarge chart"}
              </button>
            </div>
            <div className="admin-ml-seaborn-img-container">
              <img
                src={activeSeabornChart.url}
                alt={activeSeabornChart.title}
                className="admin-ml-seaborn-img"
                onClick={() => setPreviewChartUrl(activeSeabornChart.url)}
              />
            </div>
          </div>
        ) : null}
      </div>

      {/* 3. Full ML Model Lifecycle & Stage Progress */}
      <div className="admin-ml-charts-section">
        <h4>
          <Sliders size={18} weight="bold" />
          {lang === "sv" ? "ML-Modellers Livscykel & Genomförandegrad" : "ML Model Lifecycle & Progress Tracking"}
        </h4>

        <div className="admin-ml-lifecycle-grid">
          {(data?.lifecycleStages ?? []).map((stage, idx) => (
            <div key={idx} className="admin-ml-lifecycle-stage-row">
              <div className="admin-ml-lifecycle-stage-meta">
                <span className="admin-ml-lifecycle-stage-title">{stage.stage}</span>
                <span className="admin-ml-lifecycle-stage-pct">{stage.completion}%</span>
              </div>
              <div className="admin-ml-bar-track">
                <div
                  className={`admin-ml-bar-fill ${stage.completion === 100 ? "complete" : stage.completion >= 70 ? "in-progress" : "planned"}`}
                  style={{ width: `${stage.completion}%` }}
                />
              </div>
              <small className="admin-ml-lifecycle-notes">{stage.notes}</small>
            </div>
          ))}
        </div>
      </div>

      {/* 4. Identified ML System Gaps & Needed Improvements */}
      <div className="admin-ml-gaps-section">
        <div className="admin-ml-gaps-header">
          <h4>
            <Scales size={18} weight="bold" />
            {lang === "sv" ? "Vad Vi Saknar & Behöver Förbättra (Gap Analysis)" : "What We Miss & Need to Improve (Gap Analysis)"}
          </h4>
          <p>
            {lang === "sv"
              ? "Identifierade utmaningar i nuvarande ML-arkitektur och rekommenderade förbättringsåtgärder."
              : "Identified challenges in the current ML architecture and recommended improvement actions."}
          </p>
        </div>

        <div className="admin-ml-gaps-grid">
          {(data?.gapsAndImprovements ?? []).map((gap) => (
            <div key={gap.id} className="admin-ml-gap-card">
              <div className="admin-ml-gap-card-header">
                <span className="admin-ml-gap-badge">{gap.category}</span>
                <span className="admin-ml-gap-severity">Impact {gap.impactScore}/100</span>
              </div>
              <h5>{gap.title}</h5>
              <div className="admin-ml-gap-problem">
                <strong>{lang === "sv" ? "Utmaning:" : "Challenge:"}</strong> {gap.problem}
              </div>
              <div className="admin-ml-gap-solution">
                <strong>{lang === "sv" ? "Lösning & Åtgärd:" : "Solution & Action:"}</strong> {gap.solution}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Fullscreen Lightbox Preview for Seaborn Charts */}
      {previewChartUrl ? (
        <div className="admin-ml-lightbox" onClick={() => setPreviewChartUrl(null)}>
          <div className="admin-ml-lightbox-content" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="admin-ml-lightbox-close" onClick={() => setPreviewChartUrl(null)}>
              ✕
            </button>
            <img src={previewChartUrl} alt="Seaborn ML Chart Full Preview" className="admin-ml-lightbox-img" />
          </div>
        </div>
      ) : null}

      {/* 3. Python Code Journey */}
      <div className="admin-ml-code-section">
        <div className="admin-ml-code-header">
          <h4>
            <TerminalWindow size={18} weight="bold" />
            {lang === "sv" ? "Python Kodresa — Våra ML-skript & Algoritmer" : "Python Code Journey — Our ML Scripts & Algorithms"}
          </h4>
          <p>
            {lang === "sv"
              ? "Bläddra igenom den faktiska Python-koden för avvikelsedetektering, residualberäkning och recommendation scoring."
              : "Browse the actual Python code driving anomaly detection, residual calculations, and recommendation scoring."}
          </p>
        </div>

        {/* Code Tabs */}
        <div className="admin-ml-code-tabs">
          {(data?.codeSnippets ?? []).map((snippet) => (
            <button
              key={snippet.id}
              type="button"
              className={`admin-ml-code-tab ${activeTab === snippet.id ? "active" : ""}`}
              onClick={() => setActiveTab(snippet.id)}
            >
              <span>{snippet.title}</span>
            </button>
          ))}
        </div>

        {/* Code Container */}
        {activeSnippet ? (
          <div className="admin-ml-code-block">
            <div className="admin-ml-code-topbar">
              <span className="admin-ml-code-filename">{activeSnippet.filename}</span>
              <span className="admin-ml-code-desc">{activeSnippet.description}</span>
              <button
                type="button"
                className="admin-ml-copy-btn"
                onClick={() => copyCode(activeSnippet.code, activeSnippet.id)}
              >
                <Copy size={13} weight="bold" />
                {copiedId === activeSnippet.id
                  ? (lang === "sv" ? "Kopierad!" : "Copied!")
                  : (lang === "sv" ? "Kopiera kod" : "Copy code")}
              </button>
            </div>
            <pre className="admin-ml-code-pre">
              <code>{activeSnippet.code}</code>
            </pre>
          </div>
        ) : null}
      </div>
    </div>
  );
}
