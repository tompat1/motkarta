import { useMemo, useState } from "react";
import { parseConciergeAnswer } from "../../lib/concierge-parser";
import type { PlaceInput } from "../../lib/scoring";
import type { Language } from "../app/shared";
import { ArrowSquareOut, CheckCircle, Globe, MapPin, MapTrifold, Sliders, Sparkle, ThumbsDown, ThumbsUp, X } from "@phosphor-icons/react";

export function ConciergeAnswerView({
  answer,
  places,
  onSelectPlace,
  onRefineQuery,
  lang = "sv",
  onClose,
}: {
  answer: string;
  places: PlaceInput[];
  onSelectPlace: (id: number) => void;
  onRefineQuery?: (extra: string) => void;
  lang?: Language;
  onClose?: () => void;
}) {
  const parsed = useMemo(() => parseConciergeAnswer(answer), [answer]);
  const [feedback, setFeedback] = useState<"up" | "down" | null>(null);

  const handleSelect = (placeName: string, explicitId?: number) => {
    if (explicitId) {
      onSelectPlace(explicitId);
      document.getElementById("map")?.scrollIntoView({ behavior: "smooth" });
      return;
    }

    const cleanQuery = placeName
      .replace(/^\d+[\.\)]\s*/, "")
      .replace(/\s*\([^)]*\)/g, "")
      .trim()
      .toLowerCase();

    const match =
      places.find((p) => p.name.replace(/\s*\([^)]*\)/g, "").trim().toLowerCase() === cleanQuery) ||
      places.find((p) => {
        const pClean = p.name.replace(/\s*\([^)]*\)/g, "").trim().toLowerCase();
        return pClean.startsWith(cleanQuery) || cleanQuery.startsWith(pClean);
      }) ||
      places.find((p) => p.name.replace(/\s*\([^)]*\)/g, "").trim().toLowerCase().includes(cleanQuery)) ||
      places.find((p) => {
        const pClean = p.name.replace(/\s*\([^)]*\)/g, "").trim().toLowerCase();
        return cleanQuery.includes(pClean) && pClean.length > 4;
      }) ||
      places.find((p) => {
        const tokens = cleanQuery.split(/\s+/).filter((t) => t.length > 2);
        const pLower = p.name.toLowerCase();
        return tokens.length > 0 && tokens.every((t) => pLower.includes(t));
      });

    if (match) {
      onSelectPlace(match.id);
      document.getElementById("map")?.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <div className="concierge-results">
      {onClose ? (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", paddingBottom: "10px", borderBottom: "1px solid var(--color-mist)" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontFamily: "var(--font-mono)", fontSize: "12px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--color-water)" }}>
            <Sparkle size={15} weight="bold" /> {lang === "sv" ? "AI-Concierge Svar" : "AI Concierge Result"}
          </span>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "var(--color-white)",
              border: "1px solid var(--color-ink)",
              padding: "4px 10px",
              fontFamily: "var(--font-mono)",
              fontSize: "11px",
              fontWeight: 600,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              textTransform: "uppercase",
            }}
            title={lang === "sv" ? "Dölj svar" : "Dismiss"}
          >
            <X size={13} weight="bold" /> {lang === "sv" ? "Dölj svar" : "Dismiss"}
          </button>
        </div>
      ) : null}
      {parsed.clarification ? (
        <div
          className="concierge-clarification-box"
          style={{
            background: "var(--color-paper)",
            border: "2px solid var(--color-signal)",
            padding: "16px 20px",
            marginBottom: "20px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              color: "var(--color-signal)",
              fontWeight: 700,
              textTransform: "uppercase",
              fontFamily: "var(--font-mono)",
              fontSize: "12px",
              marginBottom: "8px",
            }}
          >
            <Sliders size={16} weight="bold" /> Sökförtydligande krävs
          </div>
          <p
            style={{
              margin: "0 0 12px",
              fontFamily: "var(--font-body)",
              fontSize: "15px",
              fontWeight: 500,
              lineHeight: 1.4,
              color: "var(--color-ink)",
            }}
          >
            {parsed.clarification.question}
          </p>

          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "12px" }}>
            {["Spanien / Spanskt", "Mexiko / Mexikanskt", "Italien / Italienskt", "Frankrike / Franskt", "Asien / Thai"].map(
              (suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  style={{
                    background: "var(--color-white)",
                    border: "1px solid var(--color-ink)",
                    color: "var(--color-ink)",
                    fontWeight: 600,
                    fontFamily: "var(--font-mono)",
                    fontSize: "11px",
                    padding: "6px 12px",
                    cursor: "pointer",
                  }}
                  onClick={() => onRefineQuery?.(suggestion.split(" / ")[0])}
                >
                  + {suggestion}
                </button>
              ),
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const input = form.elements.namedItem("country") as HTMLInputElement;
              if (input?.value.trim()) {
                onRefineQuery?.(input.value.trim());
              }
            }}
            style={{ display: "flex", gap: "8px" }}
          >
            <input
              name="country"
              type="text"
              placeholder="Skriv land eller kök (t.ex. Spanien)..."
              style={{
                flex: 1,
                padding: "8px 12px",
                border: "1px solid var(--color-mist)",
                background: "var(--color-white)",
                fontFamily: "var(--font-body)",
                fontSize: "13px",
              }}
            />
            <button
              type="submit"
              style={{
                background: "var(--color-ink)",
                color: "var(--color-paper)",
                border: "none",
                padding: "8px 16px",
                fontFamily: "var(--font-mono)",
                fontSize: "11px",
                fontWeight: 600,
                textTransform: "uppercase",
                cursor: "pointer",
              }}
            >
              Precisera sökning
            </button>
          </form>
        </div>
      ) : parsed.intro ? (
        <p className="concierge-intro">{parsed.intro}</p>
      ) : null}

      {parsed.cards.map((card, idx) => {
        const cardNameClean = card.name.replace(/\s*\([^)]*\)/g, "").trim().toLowerCase();
        const matchedPlace =
          places.find((p) => p.name.replace(/\s*\([^)]*\)/g, "").trim().toLowerCase() === cardNameClean) ||
          places.find((p) => {
            const pClean = p.name.replace(/\s*\([^)]*\)/g, "").trim().toLowerCase();
            return pClean.startsWith(cardNameClean) || cardNameClean.startsWith(pClean);
          }) ||
          places.find((p) => p.name.replace(/\s*\([^)]*\)/g, "").trim().toLowerCase().includes(cardNameClean)) ||
          places.find((p) => {
            const pClean = p.name.replace(/\s*\([^)]*\)/g, "").trim().toLowerCase();
            return cardNameClean.includes(pClean) && pClean.length > 4;
          });

        const areaStr = card.area ?? matchedPlace?.area ?? "Stockholm";
        const hoursConf = card.hoursConfidence ?? "Verified";
        const isHigh = hoursConf.toLowerCase().includes("high");
        const isMed =
          hoursConf.toLowerCase().includes("medium") ||
          hoursConf.toLowerCase().includes("unverified");

        const queryStr = `${card.name} ${areaStr} Stockholm`;
        const osmUrl = `https://www.openstreetmap.org/search?query=${encodeURIComponent(queryStr)}`;
        const gmapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(queryStr)}`;
        const websiteUrl = matchedPlace?.website;

        return (
          <article key={`${card.name}-${idx}`} className="concierge-card">
            <div className="concierge-card-head">
              <h3 className="concierge-card-title">
                <button
                  type="button"
                  onClick={() => handleSelect(card.name, matchedPlace?.id)}
                  title="Click to view and highlight on map"
                >
                  {card.name}
                </button>
              </h3>
              <div className="concierge-badges">
                <span className="concierge-badge area">{areaStr}</span>
                <span className={`concierge-badge ${isHigh ? "high" : isMed ? "medium" : "low"}`}>
                  {hoursConf}
                </span>
              </div>
            </div>

            {card.whyItMatches ? (
              <div className="concierge-match-box">
                <b>Why it matches:</b> {card.whyItMatches}
              </div>
            ) : null}

            <div className="concierge-details">
              {card.priceConfidence ? (
                <div className="concierge-detail-row">
                  <span className="concierge-label">Price Confidence:</span>
                  <span>{card.priceConfidence}</span>
                </div>
              ) : null}

              {card.dataSources ? (
                <div className="concierge-detail-row">
                  <span className="concierge-label">Data Sources:</span>
                  <span>{card.dataSources}</span>
                </div>
              ) : null}

              {card.lastVerified ? (
                <div className="concierge-detail-row">
                  <span className="concierge-label">Last Verified:</span>
                  <span>{card.lastVerified}</span>
                </div>
              ) : null}

              {card.missingInfo ? (
                <div className="concierge-detail-row">
                  <span className="concierge-label">Missing/Uncertain Info:</span>
                  <span style={{ color: "#854d0e" }}>{card.missingInfo}</span>
                </div>
              ) : null}
            </div>

            <div className="concierge-actions">
              <button
                type="button"
                className="concierge-btn primary"
                onClick={() => handleSelect(card.name, matchedPlace?.id)}
              >
                <MapPin size={14} weight="fill" /> Select on Map
              </button>
              <a
                href={gmapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="concierge-btn"
              >
                <MapTrifold size={14} weight="bold" /> Google Maps <ArrowSquareOut size={11} />
              </a>
              <a
                href={osmUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="concierge-btn"
              >
                <Globe size={14} weight="bold" /> OpenStreetMap <ArrowSquareOut size={11} />
              </a>
              {websiteUrl ? (
                <a
                  href={websiteUrl.startsWith("http") ? websiteUrl : `https://${websiteUrl}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="concierge-btn"
                >
                  <ArrowSquareOut size={14} weight="bold" /> Website
                </a>
              ) : null}
            </div>
          </article>
        );
      })}

      {parsed.charter.length ? (
        <div className="concierge-charter-box">
          <div className="concierge-charter-title">Ethical & Technical Charter</div>
          <div className="concierge-charter-list">
            {parsed.charter.map((bullet, i) => (
              <span key={i} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <CheckCircle size={14} weight="fill" style={{ color: "#8ed6b5", flexShrink: 0 }} />
                {bullet}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      <div
        className="concierge-feedback-bar"
        style={{
          marginTop: "16px",
          padding: "12px 16px",
          background: "var(--color-paper)",
          border: "1px solid var(--color-mist)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "12px",
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "11px",
            fontWeight: 600,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: "var(--color-ink)",
          }}
        >
          {lang === "sv" ? "Var svaret hjälpsamt?" : "Was this recommendation helpful?"}
        </span>

        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <button
            type="button"
            className={`feedback-btn ${feedback === "up" ? "active-up" : ""}`}
            onClick={() => setFeedback("up")}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "6px 12px",
              background: feedback === "up" ? "var(--color-water)" : "var(--color-white)",
              color: feedback === "up" ? "var(--color-white)" : "var(--color-ink)",
              border: "1px solid var(--color-mist)",
              fontFamily: "var(--font-mono)",
              fontSize: "11px",
              fontWeight: 600,
              cursor: "pointer",
              transition: "all var(--motion-fast)",
            }}
            title={lang === "sv" ? "Hjälpsamt (Tummen upp)" : "Helpful (Thumbs up)"}
          >
            <ThumbsUp size={14} weight={feedback === "up" ? "fill" : "bold"} />
            {lang === "sv" ? "Ja" : "Yes"}
          </button>
          <button
            type="button"
            className={`feedback-btn ${feedback === "down" ? "active-down" : ""}`}
            onClick={() => setFeedback("down")}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "6px 12px",
              background: feedback === "down" ? "var(--color-signal)" : "var(--color-white)",
              color: feedback === "down" ? "var(--color-white)" : "var(--color-ink)",
              border: "1px solid var(--color-mist)",
              fontFamily: "var(--font-mono)",
              fontSize: "11px",
              fontWeight: 600,
              cursor: "pointer",
              transition: "all var(--motion-fast)",
            }}
            title={lang === "sv" ? "Inte hjälpsamt (Tummen ner)" : "Not helpful (Thumbs down)"}
          >
            <ThumbsDown size={14} weight={feedback === "down" ? "fill" : "bold"} />
            {lang === "sv" ? "Nej" : "No"}
          </button>
        </div>

        {feedback ? (
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "11px",
              color: feedback === "up" ? "var(--color-water)" : "var(--color-signal)",
              fontWeight: 600,
            }}
          >
            {feedback === "up"
              ? lang === "sv"
                ? "Tack för din feedback! 👍"
                : "Thanks for your feedback! 👍"
              : lang === "sv"
                ? "Tack! Vi förbättrar källorna. 👎"
                : "Thanks! We'll improve our sources. 👎"}
          </span>
        ) : null}
      </div>
    </div>
  );
}
