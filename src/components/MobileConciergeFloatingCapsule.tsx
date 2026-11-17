import { useState } from "react";
import type { ConciergeResponse, ChatMessage } from "../../lib/concierge/contracts";
import type { PlaceInput } from "../../lib/scoring";
import type { Language } from "../app/shared";
import { ConciergeAnswerView } from "./ConciergeAnswerView";
import { Sparkle, X, CaretUp, CaretDown, ListBullets } from "@phosphor-icons/react";

interface MobileConciergeFloatingCapsuleProps {
  answer: string | null;
  response?: ConciergeResponse | null;
  places: PlaceInput[];
  messages?: ChatMessage[];
  onSelectPlace: (id: number) => void;
  onRefineQuery: (query: string) => void;
  onDismiss: () => void;
  onOpenList: () => void;
  lang?: Language;
  onTriggerAction?: (action: "add_place", prefillName?: string) => void;
  recommendedCount?: number;
}

export function MobileConciergeFloatingCapsule({
  answer,
  response,
  places,
  messages = [],
  onSelectPlace,
  onRefineQuery,
  onDismiss,
  onOpenList,
  lang = "sv",
  onTriggerAction,
  recommendedCount = 0,
}: MobileConciergeFloatingCapsuleProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!answer) return null;

  const introText = response?.intro || answer.replace(/^#+\s+/gm, "").split("\n\n")[0] || "";

  return (
    <div
      className={`mobile-concierge-floating-capsule ${isExpanded ? "is-expanded" : ""}`}
      id="concierge-answer-mobile"
      aria-label={lang === "sv" ? "Concierge-rekommendation" : "Concierge recommendation"}
    >
      <div className="capsule-top-row">
        <div className="capsule-badge-group">
          <span className="capsule-spark-badge">
            <Sparkle size={13} weight="fill" />
            <span>Concierge</span>
          </span>
          {recommendedCount > 0 ? (
            <span className="capsule-count-badge">
              {recommendedCount} {lang === "sv" ? "ställen" : "places"}
            </span>
          ) : null}
        </div>
        <div className="capsule-actions">
          <button
            type="button"
            className="capsule-toggle-btn"
            onClick={() => setIsExpanded((prev) => !prev)}
            aria-expanded={isExpanded}
            aria-label={
              isExpanded
                ? lang === "sv"
                  ? "Minimera svar"
                  : "Minimize answer"
                : lang === "sv"
                  ? "Expandera motivering"
                  : "Expand reasoning"
            }
          >
            {isExpanded ? (
              <>
                <span>{lang === "sv" ? "Mindre" : "Less"}</span>
                <CaretDown size={14} weight="bold" />
              </>
            ) : (
              <>
                <span>{lang === "sv" ? "Läs motivering" : "Read advice"}</span>
                <CaretUp size={14} weight="bold" />
              </>
            )}
          </button>
          <button
            type="button"
            className="capsule-dismiss-btn"
            onClick={onDismiss}
            aria-label={lang === "sv" ? "Avfärda" : "Dismiss"}
          >
            <X size={15} weight="bold" />
          </button>
        </div>
      </div>

      {!isExpanded ? (
        <div className="capsule-compact-body">
          <p className="capsule-intro-snippet">{introText}</p>
          <div className="capsule-compact-footer">
            <button
              type="button"
              className="capsule-show-list-btn"
              onClick={onOpenList}
            >
              <ListBullets size={15} weight="bold" />
              <span>
                {lang === "sv"
                  ? `Visa ${recommendedCount || "alla"} i listan`
                  : `Show ${recommendedCount || "all"} in list`}
              </span>
            </button>
          </div>
        </div>
      ) : (
        <div className="capsule-expanded-body">
          <ConciergeAnswerView
            answer={answer}
            response={response ?? undefined}
            places={places}
            onSelectPlace={(id) => {
              onSelectPlace(id);
              setIsExpanded(false);
            }}
            onRefineQuery={onRefineQuery}
            onTriggerAction={onTriggerAction}
            lang={lang}
            onClose={() => setIsExpanded(false)}
            messages={messages}
            hidePlaceCards
          />
          <div className="capsule-expanded-footer">
            <button
              type="button"
              className="capsule-show-list-btn"
              onClick={() => {
                setIsExpanded(false);
                onOpenList();
              }}
            >
              <ListBullets size={15} weight="bold" />
              <span>
                {lang === "sv"
                  ? `Öppna platslistan (${recommendedCount})`
                  : `Open places list (${recommendedCount})`}
              </span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
