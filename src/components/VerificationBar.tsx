import type { ScoredPlace } from "../../lib/scoring";
import type { Language } from "../app/shared";
import { translations } from "../app/shared";
import { Certificate, CheckCircle, Coffee, ShieldCheck } from "@phosphor-icons/react";

export function VerificationBar({ place, lang = "sv" }: { place: ScoredPlace; lang?: Language }) {
  const v = place.verification;
  const t = translations[lang];

  return (
    <div
      className="verification-bar"
      style={{
        marginTop: "14px",
        marginBottom: "14px",
        padding: "12px 14px",
        background: "var(--color-paper)",
        border: "1px solid var(--color-mist)",
        borderRadius: "var(--radius-none)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--color-signal)" }}>
          {t.whyItAppears}
        </span>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "10px",
            fontWeight: 600,
            padding: "3px 8px",
            background: place.evidence?.confidence === "High" ? "var(--color-water)" : "var(--color-white)",
            color: place.evidence?.confidence === "High" ? "var(--color-white)" : "var(--color-ink)",
            border: "1px solid var(--color-mist)",
            textTransform: "uppercase",
          }}
        >
          {place.evidence?.confidence === "High" ? t.confidenceHigh : place.evidence?.confidence === "Medium" ? t.confidenceMed : t.confidenceLow}
        </span>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "8px" }}>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "11px",
            padding: "4px 8px",
            background: "var(--color-white)",
            border: "1px solid var(--color-mist)",
            color: "var(--color-ink)",
            display: "inline-flex",
            alignItems: "center",
            gap: "5px",
          }}
        >
          <ShieldCheck size={14} weight="bold" style={{ color: "var(--color-water)" }} />
          {t.independentBusiness}
        </span>
        {v?.specialistGuide.verified ? (
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "11px",
              padding: "4px 8px",
              background: "var(--color-white)",
              border: "1px solid var(--color-mist)",
              color: "var(--color-ink)",
              display: "inline-flex",
              alignItems: "center",
              gap: "5px",
            }}
          >
            <Certificate size={14} weight="bold" style={{ color: "var(--color-water)" }} />
            {t.specialistGuide}
          </span>
        ) : null}
        {v?.structuredEvidence.verified ? (
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "11px",
              padding: "4px 8px",
              background: "var(--color-white)",
              border: "1px solid var(--color-mist)",
              color: "var(--color-ink)",
              display: "inline-flex",
              alignItems: "center",
              gap: "5px",
            }}
          >
            <CheckCircle size={14} weight="bold" style={{ color: "var(--color-water)" }} />
            {t.municipalInspection}
          </span>
        ) : null}
        {place.specialty?.specialtyVerified ? (
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "11px",
              padding: "4px 8px",
              background: "var(--color-white)",
              border: "1px solid var(--color-water)",
              color: "var(--color-water)",
              fontWeight: 600,
              display: "inline-flex",
              alignItems: "center",
              gap: "5px",
            }}
          >
            <Coffee size={14} weight="bold" style={{ color: "var(--color-water)" }} />
            {t.specialtyProof}
          </span>
        ) : null}
      </div>

      <p style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--color-stone)", margin: "4px 0 0", lineHeight: "1.4" }}>
        {t.transparencyFooter}
      </p>
    </div>
  );
}
