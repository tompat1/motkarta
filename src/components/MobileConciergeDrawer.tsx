import { useState, useRef, useEffect, type FormEvent } from "react";
import type { ConciergeResponse, ChatMessage } from "../../lib/concierge/contracts";
import type { PlaceInput } from "../../lib/scoring";
import type { Language } from "../app/shared";
import { ConciergeAnswerView } from "./ConciergeAnswerView";
import { Sparkle, X, MapTrifold, PaperPlaneRight } from "@phosphor-icons/react";

interface MobileConciergeDrawerProps {
  answer: string | null;
  response?: ConciergeResponse | null;
  places: PlaceInput[];
  messages?: ChatMessage[];
  isOpen: boolean;
  onClose: () => void;
  onSelectPlace: (id: number) => void;
  onRefineQuery: (query: string) => void;
  onViewOnMap: () => void;
  lang?: Language;
  onTriggerAction?: (action: "add_place", prefillName?: string) => void;
  recommendedCount?: number;
}

export function MobileConciergeDrawer({
  answer,
  response,
  places,
  messages = [],
  isOpen,
  onClose,
  onSelectPlace,
  onRefineQuery,
  onViewOnMap,
  lang = "sv",
  onTriggerAction,
  recommendedCount = 0,
}: MobileConciergeDrawerProps) {
  const [followUpText, setFollowUpText] = useState("");
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen && bodyRef.current) {
      bodyRef.current.scrollTop = 0;
    }
  }, [isOpen, answer]);

  if (!answer) return null;

  const handleSubmitFollowUp = (e: FormEvent) => {
    e.preventDefault();
    const query = followUpText.trim();
    if (!query) return;
    onRefineQuery(query);
    setFollowUpText("");
  };

  return (
    <>
      <div
        className={`mobile-concierge-drawer-backdrop ${isOpen ? "is-open" : ""}`}
        onClick={onClose}
        aria-hidden="true"
      />
      <section
        className={`mobile-concierge-drawer ${isOpen ? "is-open" : ""}`}
        id="concierge-answer-mobile"
        aria-label={lang === "sv" ? "AI-Concierge Dialog" : "AI Concierge Dialogue"}
        role="dialog"
        aria-modal="true"
      >
        <div className="mobile-concierge-drawer-handle" aria-hidden="true" />
        <header className="mobile-concierge-drawer-header">
          <div className="mobile-concierge-drawer-title-group">
            <span className="mobile-concierge-drawer-badge">
              <Sparkle size={14} weight="fill" />
              <span>Concierge</span>
            </span>
            {response?.query ? (
              <span className="mobile-concierge-drawer-query" title={response.query}>
                &ldquo;{response.query}&rdquo;
              </span>
            ) : null}
          </div>
          <button
            type="button"
            className="mobile-concierge-drawer-close"
            onClick={onClose}
            aria-label={lang === "sv" ? "Stäng dialog" : "Close dialogue"}
          >
            <X size={18} weight="bold" />
          </button>
        </header>

        {recommendedCount > 0 ? (
          <div className="mobile-concierge-drawer-action-banner">
            <button
              type="button"
              className="mobile-concierge-map-cta-btn"
              onClick={onViewOnMap}
            >
              <MapTrifold size={16} weight="bold" />
              <span>
                {lang === "sv"
                  ? `Visa ${recommendedCount} ställe${recommendedCount === 1 ? "" : "n"} på kartan`
                  : `Show ${recommendedCount} place${recommendedCount === 1 ? "" : "s"} on the map`}
              </span>
            </button>
          </div>
        ) : null}

        <div className="mobile-concierge-drawer-body" ref={bodyRef}>
          <ConciergeAnswerView
            answer={answer}
            response={response ?? undefined}
            places={places}
            onSelectPlace={(id) => {
              onSelectPlace(id);
              onClose();
            }}
            onRefineQuery={onRefineQuery}
            onTriggerAction={onTriggerAction}
            lang={lang}
            onClose={onClose}
            messages={messages}
            hidePlaceCards
          />
        </div>

        <form className="mobile-concierge-drawer-bottom-bar" onSubmit={handleSubmitFollowUp}>
          <input
            type="text"
            className="mobile-concierge-drawer-input"
            value={followUpText}
            onChange={(e) => setFollowUpText(e.target.value)}
            placeholder={
              lang === "sv"
                ? "Ställ en följdfråga till Concierge..."
                : "Ask Concierge a follow-up..."
            }
            aria-label={lang === "sv" ? "Följdfråga" : "Follow-up question"}
          />
          <button
            type="submit"
            className="mobile-concierge-drawer-send-btn"
            disabled={!followUpText.trim()}
            aria-label={lang === "sv" ? "Skicka följdfråga" : "Send follow-up"}
          >
            <PaperPlaneRight size={16} weight="bold" />
          </button>
        </form>
      </section>
    </>
  );
}
