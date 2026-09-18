import React, { useState } from "react";
import {
  X,
  ArrowRight,
  CaretDown,
  CaretUp,
  Sparkle,
  ShieldCheck,
  Check,
} from "@phosphor-icons/react";
import type { ScoredPlace } from "../../lib/scoring";
import { kindFilterLabel, type Language } from "../app/shared";
import { DUMMY_PLACE_IMAGE_URL } from "../../lib/lazy-media";

interface MobilePlaceSlideUpProps {
  place: ScoredPlace | null;
  isSaved?: boolean;
  photoUrl: string | null;
  lang: Language;
  onOpenDetails: (place: ScoredPlace) => void;
  onToggleSave?: (id: number) => void;
  onClose?: () => void;
  onToggleListView?: () => void;
}

export function MobilePlaceSlideUp({
  place,
  isSaved,
  photoUrl,
  lang,
  onOpenDetails,
  onToggleSave,
  onClose,
  onToggleListView,
}: MobilePlaceSlideUpProps) {
  const [showWhyReason, setShowWhyReason] = useState(false);

  if (!place) return null;

  const noteText =
    place.note?.trim() ||
    place.discoveryReasons?.[0] ||
    place.evidenceLabel ||
    (lang === "sv"
      ? "Oberoende mat- och fikaställe i Stockholm."
      : "Independent food & coffee venue in Stockholm.");

  const categoryAreaText = `${place.area} · ${kindFilterLabel(place.kind, lang)}`;

  return (
    <aside
      className="mobile-place-slide-up"
      aria-label={lang === "sv" ? `Snabbvy för ${place.name}` : `Quick view for ${place.name}`}
    >
      <div
        className="mobile-slide-up-drag-bar"
        onClick={onClose}
        title={lang === "sv" ? "Dra ner eller klicka för att stänga" : "Swipe down or click to close"}
      >
        <span className="mobile-slide-up-handle" />
      </div>

      <div
        className="mobile-slide-up-content"
        onClick={() => onOpenDetails(place)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onOpenDetails(place);
          }
        }}
      >
        {/* Left: Thumbnail image */}
        <div className="mobile-slide-up-thumb-wrap">
          <img
            src={photoUrl || DUMMY_PLACE_IMAGE_URL}
            alt={place.name}
            className={`mobile-slide-up-thumb ${!photoUrl ? "is-dummy" : ""}`}
            loading="eager"
            onError={(e) => {
              e.currentTarget.src = DUMMY_PLACE_IMAGE_URL;
              e.currentTarget.classList.add("is-dummy");
            }}
          />
        </div>

        {/* Right: Place details */}
        <div className="mobile-slide-up-info">
          <div className="mobile-slide-up-header-row">
            <h3 className="mobile-slide-up-title">{place.name}</h3>
            <button
              type="button"
              className="mobile-slide-up-close-btn"
              onClick={(e) => {
                e.stopPropagation();
                onClose?.();
              }}
              aria-label={lang === "sv" ? "Stäng" : "Close"}
              title={lang === "sv" ? "Stäng" : "Close"}
            >
              <X size={18} weight="bold" />
            </button>
          </div>

          <p className="mobile-slide-up-meta">{categoryAreaText}</p>
          <p className="mobile-slide-up-note">{noteText}</p>

          <button
            type="button"
            className="mobile-slide-up-why-trigger"
            onClick={(e) => {
              e.stopPropagation();
              setShowWhyReason((prev) => !prev);
            }}
            aria-expanded={showWhyReason}
          >
            <span>{lang === "sv" ? "Varför visas detta?" : "Why this recommendation?"}</span>
            {showWhyReason ? <CaretUp size={12} weight="bold" /> : <CaretDown size={12} weight="bold" />}
          </button>
        </div>
      </div>

      {showWhyReason ? (
        <div className="mobile-slide-up-why-details" onClick={(e) => e.stopPropagation()}>
          <div className="mobile-slide-up-why-row">
            <Sparkle size={14} weight="fill" style={{ color: "#2563EB" }} />
            <span>
              <strong>{Math.round(place.scores.recommendation)}%</strong> {lang === "sv" ? "rekommendationsmatch" : "match score"} ·{" "}
              <em>{place.evidence.confidence} {lang === "sv" ? "konfidens" : "confidence"}</em>
            </span>
          </div>
          {place.discoveryReasons && place.discoveryReasons.length > 0 ? (
            <ul className="mobile-slide-up-reasons-list">
              {place.discoveryReasons.slice(0, 2).map((reason, idx) => (
                <li key={idx}>
                  <Check size={12} weight="bold" style={{ color: "#16a34a" }} />
                  <span>{reason}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {/* Blue Action Button: Visa stället → */}
      <button
        type="button"
        className="mobile-slide-up-primary-btn"
        onClick={(e) => {
          e.stopPropagation();
          onOpenDetails(place);
        }}
      >
        <span>{lang === "sv" ? "Visa stället" : "View place"}</span>
        <ArrowRight size={18} weight="bold" />
      </button>

      {/* Footer Toggle Row */}
      <button
        type="button"
        className="mobile-slide-up-footer-toggle"
        onClick={() => onToggleListView?.()}
      >
        <span>{lang === "sv" ? "Exempelresultat" : "Sample results"}</span>
        <CaretDown size={14} weight="bold" />
      </button>
    </aside>
  );
}
