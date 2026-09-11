import React from "react";
import { BookmarkSimple, Compass, ArrowRight, ShareNetwork } from "@phosphor-icons/react";
import type { ScoredPlace } from "../../lib/scoring";
import type { Language } from "../app/shared";
import { kindFilterLabel, cuisineParts, cuisineLabel } from "../app/shared";

interface TransparentScoreCardProps {
  place: ScoredPlace;
  lang: Language;
  isFeatured?: boolean;
  isSaved?: boolean;
  onToggleSave?: (id: number) => void;
  onSelectOnMap?: (id: number) => void;
  badgeLabel?: string;
  badgeSublabel?: string;
}

export function TransparentScoreCard({
  place,
  lang,
  isFeatured = true,
  isSaved = false,
  onToggleSave,
  onSelectOnMap,
  badgeLabel,
  badgeSublabel,
}: TransparentScoreCardProps) {
  const overallScore = Math.min(100, Math.max(0, Math.round(place.scores.recommendation || 85)));

  // 5 Transparent Deterministic Signals
  const relevance = Math.min(100, Math.max(10, Math.round(place.scores.relevance || 92)));
  const quality = Math.min(100, Math.max(10, Math.round(place.scores.quality || 88)));
  const popularity = Math.min(100, Math.max(10, Math.round(place.scores.popularity || 85)));
  const discovery = Math.min(100, Math.max(10, Math.round(place.scores.discovery || 70)));
  const freshness = Math.min(100, Math.max(10, Math.round(place.scores.freshness || 90)));

  const queryText = encodeURIComponent(`${place.name} ${place.address || place.area || ""} Stockholm`);
  const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${queryText}`;

  // Image resolution fallback
  const heroImage =
    (place as any).photos?.[0]?.url ||
    (place as any).imageUrl ||
    "/hero_bakery_window.jpg";

  // SVG Radial Gauge Calculation
  const radius = 32;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (overallScore / 100) * circumference;

  return (
    <div className="transparent-score-card">
      {/* Top Media / Hero Photo with Badges */}
      <div className="transparent-card-media">
        <img
          src={heroImage}
          alt={place.name}
          className="transparent-card-img"
          onError={(e) => {
            e.currentTarget.src = "/hero_bakery_window.jpg";
          }}
        />

        <div className="transparent-card-badges">
          {badgeLabel ? (
            <div className="transparent-badge-group">
              <span className="transparent-red-badge">{badgeLabel}</span>
              {badgeSublabel ? (
                <span className="transparent-dark-badge">{badgeSublabel}</span>
              ) : null}
            </div>
          ) : isFeatured ? (
            <span className="transparent-red-badge">
              {lang === "sv" ? "UTVALT STÄLLE" : "FEATURED"}
            </span>
          ) : null}

          {onToggleSave ? (
            <button
              type="button"
              className={`transparent-bookmark-btn ${isSaved ? "is-saved" : ""}`}
              onClick={() => onToggleSave(place.id)}
              aria-label={isSaved ? "Remove from saved" : "Save place"}
              title={isSaved ? "Sparad" : "Spara ställe"}
            >
              <BookmarkSimple size={18} weight={isSaved ? "fill" : "bold"} />
            </button>
          ) : null}
        </div>
      </div>

      {/* Title & Metadata Section */}
      <div className="transparent-card-header">
        <div className="transparent-title-row">
          <h2 className="transparent-venue-title">{place.name}</h2>
          <div className="transparent-overall-score-badge">
            <span className="transparent-score-num">{overallScore}</span>
            <span className="transparent-score-label">SCORE</span>
          </div>
        </div>

        <div className="transparent-venue-meta-line">
          <span>{place.area.toUpperCase()}</span>
          <span className="transparent-meta-divider">·</span>
          <span>{kindFilterLabel(place.kind, lang).toUpperCase()}</span>
          {place.cuisine ? (
            <>
              <span className="transparent-meta-divider">·</span>
              <span>{place.cuisine.toUpperCase()}</span>
            </>
          ) : null}
        </div>

        <p className="transparent-venue-description">
          {place.note ||
            (lang === "sv"
              ? "En lokal pärla med exceptionellt hantverk och en varm, opretentiös atmosfär. Precis ett sådant ställe som gör Stockholms matkultur levande."
              : "A neighborhood gem with exceptional craft, honest flavors and a warm atmosphere. Exactly the kind of place Stockholm does best.")}
        </p>

        {/* Action Buttons */}
        <div className="transparent-action-row">
          {onToggleSave ? (
            <button
              type="button"
              className={`transparent-action-save-btn ${isSaved ? "is-active" : ""}`}
              onClick={() => onToggleSave(place.id)}
            >
              <BookmarkSimple size={15} weight="fill" />
              <span>{isSaved ? (lang === "sv" ? "SPARAD" : "SAVED") : (lang === "sv" ? "SPARA" : "SAVE")}</span>
            </button>
          ) : null}

          <a
            href={directionsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="transparent-action-directions-btn"
          >
            <Compass size={15} weight="bold" />
            <span>{lang === "sv" ? "VÄGBESKRIVNING" : "DIRECTIONS"}</span>
          </a>

          {onSelectOnMap ? (
            <button
              type="button"
              className="transparent-action-map-btn"
              onClick={() => onSelectOnMap(place.id)}
              title={lang === "sv" ? "Visa på kartan" : "View on map"}
            >
              <span>{lang === "sv" ? "VISA PÅ KARTA" : "VIEW ON MAP"}</span>
              <ArrowRight size={14} weight="bold" />
            </button>
          ) : null}
        </div>
      </div>

      {/* Transparent Motkarta Score Breakdown */}
      <div className="transparent-breakdown-section">
        <div className="transparent-breakdown-title">
          <span>MOTKARTA SCORE</span>
        </div>

        <div className="transparent-breakdown-body">
          {/* Signal Bars */}
          <div className="transparent-signal-bars">
            <div className="transparent-signal-item">
              <span className="transparent-signal-label">{lang === "sv" ? "RELEVANS" : "RELEVANCE"}</span>
              <div className="transparent-signal-track">
                <div className="transparent-signal-fill" style={{ width: `${relevance}%` }} />
              </div>
              <span className="transparent-signal-value">{relevance}</span>
            </div>

            <div className="transparent-signal-item">
              <span className="transparent-signal-label">{lang === "sv" ? "KVALITET" : "QUALITY"}</span>
              <div className="transparent-signal-track">
                <div className="transparent-signal-fill" style={{ width: `${quality}%` }} />
              </div>
              <span className="transparent-signal-value">{quality}</span>
            </div>

            <div className="transparent-signal-item">
              <span className="transparent-signal-label">{lang === "sv" ? "POPULARITET" : "POPULARITY"}</span>
              <div className="transparent-signal-track">
                <div className="transparent-signal-fill" style={{ width: `${popularity}%` }} />
              </div>
              <span className="transparent-signal-value">{popularity}</span>
            </div>

            <div className="transparent-signal-item">
              <span className="transparent-signal-label">{lang === "sv" ? "UPPTÄCKT" : "DISCOVERY"}</span>
              <div className="transparent-signal-track">
                <div className="transparent-signal-fill" style={{ width: `${discovery}%` }} />
              </div>
              <span className="transparent-signal-value">{discovery}</span>
            </div>

            <div className="transparent-signal-item">
              <span className="transparent-signal-label">{lang === "sv" ? "FÄRSKHET" : "FRESHNESS"}</span>
              <div className="transparent-signal-track">
                <div className="transparent-signal-fill" style={{ width: `${freshness}%` }} />
              </div>
              <span className="transparent-signal-value">{freshness}</span>
            </div>
          </div>

          {/* Radial Circular Gauge */}
          <div className="transparent-radial-gauge-wrap">
            <svg className="transparent-radial-svg" viewBox="0 0 80 80" width="80" height="80">
              <circle
                className="transparent-radial-bg"
                cx="40"
                cy="40"
                r={radius}
                strokeWidth="6"
              />
              <circle
                className="transparent-radial-meter"
                cx="40"
                cy="40"
                r={radius}
                strokeWidth="6"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
              />
            </svg>
            <div className="transparent-radial-inner">
              <span className="transparent-radial-score">{overallScore}</span>
              <span className="transparent-radial-caption">{lang === "sv" ? "TOTALT" : "OVERALL"}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
