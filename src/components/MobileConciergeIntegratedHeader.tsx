import { useState, useMemo } from "react";
import type { ConciergeResponse, ChatMessage } from "../../lib/concierge/contracts";
import type { PlaceInput } from "../../lib/scoring";
import type { Language } from "../app/shared";
import { ConciergeAnswerView } from "./ConciergeAnswerView";
import { buildFollowUpChips } from "../app/concierge-client";
import { Sparkle, X, CaretDown, CaretUp, MapTrifold } from "@phosphor-icons/react";

interface MobileConciergeIntegratedHeaderProps {
  answer: string;
  response?: ConciergeResponse | null;
  places: PlaceInput[];
  messages?: ChatMessage[];
  onSelectPlace: (id: number) => void;
  onRefineQuery: (query: string) => void;
  onDismiss: () => void;
  onToggleView: () => void;
  mobileViewMode: "map" | "list";
  lang?: Language;
  onTriggerAction?: (action: "add_place", prefillName?: string) => void;
  recommendedCount?: number;
}

export function MobileConciergeIntegratedHeader({
  answer,
  response,
  places,
  messages = [],
  onSelectPlace,
  onRefineQuery,
  onDismiss,
  onToggleView,
  mobileViewMode,
  lang = "sv",
  onTriggerAction,
  recommendedCount = 0,
}: MobileConciergeIntegratedHeaderProps) {
  const [showFullAnalysis, setShowFullAnalysis] = useState(false);

  const introText = response?.intro || answer.replace(/^#+\s+/gm, "").split("\n\n")[0] || "";

  const followUpChips = useMemo(() => {
    return buildFollowUpChips(response?.query ?? "", response ?? undefined, messages, lang);
  }, [response, messages, lang]);

  return (
    <div className="mobile-concierge-integrated-header" id="concierge-answer-mobile">
      <div className="integrated-header-top-bar">
        <div className="integrated-header-lead">
          <span className="integrated-spark-badge">
            <Sparkle size={13} weight="fill" />
            <span>Concierge</span>
          </span>
          <h2 className="integrated-query-title">
            {response?.query ? `“${response.query}”` : (lang === "sv" ? "Rekommendation" : "Recommendation")}
          </h2>
        </div>
        <div className="integrated-header-actions">
          <button
            type="button"
            className="integrated-view-toggle-btn"
            onClick={onToggleView}
            aria-label={mobileViewMode === "map" ? "Visa lista" : "Visa karta"}
          >
            {mobileViewMode === "map" ? (
              <>
                <CaretUp size={13} weight="bold" />
                <span>{lang === "sv" ? "Lista" : "List"}</span>
              </>
            ) : (
              <>
                <MapTrifold size={13} weight="bold" />
                <span>{lang === "sv" ? "Karta" : "Map"}</span>
              </>
            )}
          </button>
          <button
            type="button"
            className="integrated-dismiss-btn"
            onClick={onDismiss}
            aria-label={lang === "sv" ? "Avfärda Concierge-sökning" : "Dismiss Concierge search"}
            title={lang === "sv" ? "Avfärda" : "Dismiss"}
          >
            <X size={15} weight="bold" />
          </button>
        </div>
      </div>

      <div className="integrated-summary-body">
        <p className="integrated-intro-quote">{introText}</p>

        {followUpChips.length > 0 && !showFullAnalysis ? (
          <div className="integrated-follow-up-chips" role="group" aria-label="Förslag på följdfrågor">
            {followUpChips.map((chip, idx) => (
              <button
                key={idx}
                type="button"
                className="integrated-chip-pill"
                onClick={() => onRefineQuery(chip.query)}
              >
                <span>{chip.label}</span>
              </button>
            ))}
          </div>
        ) : null}

        <div className="integrated-details-row">
          {recommendedCount > 0 ? (
            <span className="integrated-count-readout">
              {recommendedCount} {lang === "sv" ? "utvalda ställen nedan" : "curated places below"}
            </span>
          ) : <span />}

          <button
            type="button"
            className="integrated-expand-analysis-btn"
            onClick={() => setShowFullAnalysis((prev) => !prev)}
            aria-expanded={showFullAnalysis}
          >
            {showFullAnalysis ? (
              <>
                <span>{lang === "sv" ? "Dölj analys" : "Hide analysis"}</span>
                <CaretUp size={13} weight="bold" />
              </>
            ) : (
              <>
                <span>{lang === "sv" ? "Läs full analys" : "Full analysis"}</span>
                <CaretDown size={13} weight="bold" />
              </>
            )}
          </button>
        </div>

        {showFullAnalysis ? (
          <div className="integrated-full-analysis-container">
            <ConciergeAnswerView
              answer={answer}
              response={response ?? undefined}
              places={places}
              onSelectPlace={(id) => {
                onSelectPlace(id);
                setShowFullAnalysis(false);
              }}
              onRefineQuery={onRefineQuery}
              onTriggerAction={onTriggerAction}
              lang={lang}
              onClose={() => setShowFullAnalysis(false)}
              messages={messages}
              hidePlaceCards
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
