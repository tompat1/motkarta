import React from "react";
import type { ScoreBreakdown } from "../../lib/scoring";
import type { Language } from "../app/shared";

export interface MotkartaScoreWidgetProps {
  scores?: Partial<ScoreBreakdown> | null;
  overallScore?: number | null;
  lang?: Language;
  className?: string;
}

export function MotkartaScoreWidget({
  scores,
  overallScore,
  lang = "sv",
  className = "",
}: MotkartaScoreWidgetProps) {
  const isSv = lang === "sv";

  const relevance = Math.round(scores?.relevance ?? 0);
  const quality = Math.round(scores?.quality ?? 0);
  const popularity = Math.round(scores?.popularity ?? 0);
  const discovery = Math.round(scores?.discovery ?? 0);
  const freshness = Math.round(scores?.freshness ?? 0);

  const fallbackOverall =
    scores?.recommendation !== undefined
      ? scores.recommendation
      : (relevance * 0.35 + quality * 0.25 + popularity * 0.15 + discovery * 0.15 + freshness * 0.10);
  const overall = Math.round(overallScore ?? fallbackOverall);
  const clampedOverall = Math.max(0, Math.min(100, overall));

  // 2 * PI * 40 ~= 251.327
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = 0;
  const strokeDasharray = `${((clampedOverall / 100) * circumference).toFixed(2)} ${circumference.toFixed(2)}`;

  const metrics = [
    { label: isSv ? "RELEVANS" : "RELEVANCE", value: Math.max(0, Math.min(100, relevance)) },
    { label: isSv ? "KVALITET" : "QUALITY", value: Math.max(0, Math.min(100, quality)) },
    { label: isSv ? "POPULARITET" : "POPULARITY", value: Math.max(0, Math.min(100, popularity)) },
    { label: isSv ? "UPPTÄCKT" : "DISCOVERY", value: Math.max(0, Math.min(100, discovery)) },
    { label: isSv ? "FÄRSKHET" : "FRESHNESS", value: Math.max(0, Math.min(100, freshness)) },
  ];

  const overallLabel = isSv ? "TOTALT" : "OVERALL";

  return (
    <section className={`motkarta-score-widget ${className}`.trim()} aria-label={isSv ? "Motkarta poängöversikt" : "Motkarta score breakdown"}>
      <div className="motkarta-score-widget-header">
        <h4 className="motkarta-score-widget-title">MOTKARTA SCORE</h4>
      </div>

      <div className="motkarta-score-widget-body">
        {/* Left column: 5 progress bars */}
        <div className="motkarta-score-bars">
          {metrics.map((m) => (
            <div key={m.label} className="motkarta-score-bar-row">
              <span className="motkarta-score-bar-label">{m.label}</span>
              <div
                className="motkarta-score-bar-track"
                role="progressbar"
                aria-valuenow={m.value}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={m.label}
              >
                <div
                  className="motkarta-score-bar-fill"
                  style={{ width: `${m.value}%` }}
                />
              </div>
              <span className="motkarta-score-bar-val">{m.value}</span>
            </div>
          ))}
        </div>

        {/* Right column: Donut gauge */}
        <div className="motkarta-score-gauge">
          <svg className="motkarta-score-gauge-svg" viewBox="0 0 100 100" aria-hidden="true">
            <circle
              cx="50"
              cy="50"
              r={radius}
              className="motkarta-score-gauge-track"
              strokeWidth="11"
              fill="none"
            />
            <circle
              cx="50"
              cy="50"
              r={radius}
              className="motkarta-score-gauge-fill"
              strokeWidth="11"
              fill="none"
              strokeDasharray={strokeDasharray}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="butt"
              transform="rotate(-90 50 50)"
            />
          </svg>
          <div className="motkarta-score-gauge-center">
            <span className="motkarta-score-gauge-num">{overall}</span>
            <span className="motkarta-score-gauge-sub">{overallLabel}</span>
          </div>
        </div>
      </div>
    </section>
  );
}

export default MotkartaScoreWidget;
