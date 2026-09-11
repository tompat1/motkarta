import React, { useState } from "react";
import {
  Sparkle,
  PencilSimple,
  X,
  Plus,
  Compass,
  ArrowRight,
  BookmarkSimple,
  Faders,
  ArrowCounterClockwise,
  Check,
} from "@phosphor-icons/react";
import type { ScoredPlace } from "../../lib/scoring";
import type { Language, EstablishmentFilter, CuisineFilter } from "../app/shared";
import { kindFilterLabel, cuisineParts, cuisineLabel, allCuisines, establishmentTypes } from "../app/shared";

interface ConversationalConciergeProps {
  query: string;
  onQueryChange: (val: string) => void;
  onAskConcierge: (q?: string) => void;
  asking: boolean;
  answer: string | null;
  rankedPlaces: ScoredPlace[];
  lang: Language;
  onSelectPlace: (id: number) => void;
  onToggleSave: (id: number) => void;
  savedPlaceIds: number[];
  kind: EstablishmentFilter;
  onKindChange: (k: EstablishmentFilter) => void;
  cuisine: CuisineFilter;
  onCuisineChange: (c: CuisineFilter) => void;
  cuisineOptions: string[];
  selectedTags: string[];
  onToggleTag: (tag: string) => void;
  onResetFilters: () => void;
  onSwitchToMap: (placeId?: number) => void;
  sortMode: string;
  onSortChange: (sort: any) => void;
}

export function ConversationalConcierge({
  query,
  onQueryChange,
  onAskConcierge,
  asking,
  answer,
  rankedPlaces,
  lang,
  onSelectPlace,
  onToggleSave,
  savedPlaceIds,
  kind,
  onKindChange,
  cuisine,
  onCuisineChange,
  cuisineOptions,
  selectedTags,
  onToggleTag,
  onResetFilters,
  onSwitchToMap,
  sortMode,
  onSortChange,
}: ConversationalConciergeProps) {
  const [isFiltersOpen, setIsFiltersOpen] = useState(true);
  const [isEditingQuery, setIsEditingQuery] = useState(false);
  const [customTagInput, setCustomTagInput] = useState("");
  const [isAddingTag, setIsAddingTag] = useState(false);

  // Extract semantic pills from query or selection
  const extractedPills: { label: string; type: "kind" | "area" | "tag" | "custom" }[] = [];
  if (kind !== "All places") {
    extractedPills.push({ label: kindFilterLabel(kind, lang), type: "kind" });
  }
  if (cuisine !== allCuisines) {
    extractedPills.push({ label: cuisineLabel(cuisine, lang), type: "tag" });
  }
  selectedTags.forEach((tag) => {
    extractedPills.push({ label: tag, type: "tag" });
  });

  // Default suggestions if no query
  if (extractedPills.length === 0 && !query) {
    extractedPills.push(
      { label: lang === "sv" ? "Specialkaffe" : "Specialty Coffee", type: "kind" },
      { label: "Södermalm", type: "area" },
      { label: lang === "sv" ? "Lugn atmosfär" : "Quiet corner", type: "tag" },
    );
  }

  const primaryMatch = rankedPlaces[0] || null;
  const secondaryMatches = rankedPlaces.slice(1, 6);

  const fallbackAnswer =
    lang === "sv"
      ? `Härligt. Vi har vaskat fram ${rankedPlaces.length} ställen baserat på transparenta signaler – helt utan betald placering. Här är våra skarpaste träffar för din smak.`
      : `Nice. We've curated ${rankedPlaces.length} places based on transparent signals with zero paid placement. Here are our top matches for your taste.`;

  return (
    <div className="concierge-workspace-container" aria-label="Motkarta Conversational Concierge">
      {/* ZONE 1: Left Dark Slate Column */}
      <aside className="concierge-query-sidebar">
        <div className="concierge-sidebar-header">
          <div className="editorial-badge-tag">
            <span className="editorial-red-square" aria-hidden="true" />
            <span className="editorial-tag-text">
              {lang === "sv" ? "CONCIERGE · ÄKTA MÄNNISKOR. INGEN BETALD RANKING." : "CONCIERGE · REAL PEOPLE. REAL PLACES. NO PAID RANKING."}
            </span>
          </div>

          <h1 className="concierge-sidebar-headline">
            <span>{lang === "sv" ? "VAD ÄR DU" : "WHAT SOUNDS"}</span>
            <span className="editorial-blue-highlight">{lang === "sv" ? "SUGEN PÅ?" : "GOOD?"}</span>
          </h1>

          <p className="concierge-sidebar-subtext">
            {lang === "sv"
              ? "Berätta fritt vad du är sugen på, stadsdel eller stämning. Vi hittar Stockholms bästa ställen genom öppna, verifierade signaler."
              : "Tell us what you're in the mood for. Ask freely or set a few preferences — we'll find great places based on transparent signals."}
          </p>
        </div>

        {/* Natural Language Query Box with Inline Edit */}
        <div className="concierge-input-bubble">
          <div className="concierge-input-top-row">
            <input
              type="text"
              className="concierge-text-input"
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              placeholder={lang === "sv" ? "T.ex. Specialkaffe, något sött och en lugn vrå på Södermalm..." : "E.g. Specialty coffee, something sweet, and a quiet corner in Södermalm..."}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  onAskConcierge(query);
                }
              }}
            />
            <button
              type="button"
              className="concierge-edit-icon-btn"
              onClick={() => onAskConcierge(query)}
              title={lang === "sv" ? "Kör sökning" : "Search"}
            >
              <PencilSimple size={16} weight="bold" />
            </button>
          </div>

          {/* Semantic Attribute Chips Row */}
          <div className="concierge-semantic-chips-row">
            {extractedPills.map((pill, idx) => (
              <span key={`${pill.label}-${idx}`} className="concierge-semantic-chip">
                {pill.label}
                <button
                  type="button"
                  onClick={() => {
                    if (pill.type === "kind") onKindChange("All places");
                    if (pill.type === "tag") onCuisineChange(allCuisines);
                  }}
                  aria-label="Remove filter"
                >
                  <X size={12} weight="bold" />
                </button>
              </span>
            ))}

            {isAddingTag ? (
              <form
                className="concierge-add-tag-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (customTagInput.trim()) {
                    onToggleTag(customTagInput.trim());
                    setCustomTagInput("");
                    setIsAddingTag(false);
                  }
                }}
              >
                <input
                  type="text"
                  autoFocus
                  className="concierge-add-tag-input"
                  placeholder="Lägg till..."
                  value={customTagInput}
                  onChange={(e) => setCustomTagInput(e.target.value)}
                />
              </form>
            ) : (
              <button
                type="button"
                className="concierge-add-chip-btn"
                onClick={() => setIsAddingTag(true)}
                title="Lägg till preferens"
              >
                <Plus size={13} weight="bold" />
              </button>
            )}
          </div>
        </div>

        {/* Motkarta Says Synthesis Bubble */}
        <div className="concierge-synthesis-card">
          <div className="concierge-synthesis-badge">
            <Sparkle size={14} weight="fill" />
            <span>MOTKARTA SÄGER</span>
          </div>
          <p className="concierge-synthesis-quote">
            {answer || fallbackAnswer}
          </p>
          <button
            type="button"
            className="concierge-show-matches-btn"
            onClick={() => onAskConcierge(query)}
            disabled={asking}
          >
            <span>{lang === "sv" ? "VISA MINA TRÄFFAR" : "SHOW MY MATCHES"}</span>
            <ArrowRight size={16} weight="bold" />
          </button>
        </div>

        <div className="concierge-sidebar-footer">
          <span className="editorial-slogan-small">
            {lang === "sv" ? "BRA MAT FÖR ETT BÄTTRE STOCKHOLM" : "GOOD FOOD · A BRIGHTER STOCKHOLM"}
          </span>
        </div>
      </aside>

      {/* ZONE 2: Center Results Feed */}
      <main className="concierge-results-feed">
        <header className="concierge-results-header">
          <div>
            <h2 className="concierge-match-count">
              {rankedPlaces.length} {lang === "sv" ? "STÄLLEN MATCHAR" : "PLACES MATCH"}
            </h2>
            <p className="concierge-match-sub">
              {lang === "sv"
                ? "Våra främsta val för din smak. Rankade efter transparenta signaler."
                : "Our top picks for your taste. Ranked by transparent signals."}
            </p>
          </div>

          <div className="concierge-sort-wrap">
            <span className="concierge-sort-label">{lang === "sv" ? "Sortera på" : "Sort by"}</span>
            <select
              className="concierge-sort-select"
              value={sortMode}
              onChange={(e) => onSortChange(e.target.value)}
            >
              <option value="Motkarta score">Motkarta score</option>
              <option value="Quality">Kvalitet / Quality</option>
              <option value="Discovery">Upptäckt / Discovery</option>
              <option value="Distance">Avstånd / Distance</option>
            </select>
          </div>
        </header>

        {/* Primary #1 Match Card */}
        {primaryMatch ? (
          <article className="concierge-hero-match-card">
            <div className="concierge-hero-match-grid">
              {/* Photo */}
              <div className="concierge-hero-photo-wrap">
                <img
                  src={
                    (primaryMatch as any).photos?.[0]?.url ||
                    (primaryMatch as any).imageUrl ||
                    "/hero_bakery_window.jpg"
                  }
                  alt={primaryMatch.name}
                  className="concierge-hero-img"
                  onError={(e) => {
                    e.currentTarget.src = "/hero_bakery_window.jpg";
                  }}
                />
                <span className="concierge-number-one-badge">#1 MATCH</span>
                <span className="concierge-sub-badge">
                  {lang === "sv" ? "EN LUGN PÄRLA · PERFEKT FÖR MORGONEN" : "A QUIET GEM · PERFECT FOR A SLOW MORNING"}
                </span>
              </div>

              {/* Information & Transparent Signals */}
              <div className="concierge-hero-info">
                <div className="concierge-hero-meta-row">
                  <span className="concierge-meta-kind">{kindFilterLabel(primaryMatch.kind, lang).toUpperCase()}</span>
                  <span className="transparent-meta-divider">·</span>
                  <span className="concierge-meta-area">{primaryMatch.area.toUpperCase()}</span>
                </div>

                <h3 className="concierge-hero-title">{primaryMatch.name}</h3>

                <p className="concierge-hero-quote">
                  {primaryMatch.note ||
                    (lang === "sv"
                      ? "Exceptionella kardemummabullar och bland Söders bästa kaffe. En lugn, lokal favorit."
                      : "Exceptional cardamom buns and some of the best coffee in Södermalm. A calm, local favorite.")}
                </p>

                {/* Score & 5-Signal Breakdown */}
                <div className="concierge-score-breakdown-box">
                  <div className="concierge-big-score-col">
                    <span className="concierge-big-score-num">
                      {Math.round(primaryMatch.scores.recommendation || 87)}
                    </span>
                    <span className="concierge-big-score-label">MOTKARTA SCORE</span>
                  </div>

                  <div className="concierge-signals-bars-col">
                    <div className="concierge-mini-bar-row">
                      <span>RELEVANS</span>
                      <div className="concierge-bar-track">
                        <div className="concierge-bar-fill" style={{ width: `${Math.round(primaryMatch.scores.relevance || 92)}%` }} />
                      </div>
                      <b>{Math.round(primaryMatch.scores.relevance || 92)}</b>
                    </div>
                    <div className="concierge-mini-bar-row">
                      <span>KVALITET</span>
                      <div className="concierge-bar-track">
                        <div className="concierge-bar-fill" style={{ width: `${Math.round(primaryMatch.scores.quality || 88)}%` }} />
                      </div>
                      <b>{Math.round(primaryMatch.scores.quality || 88)}</b>
                    </div>
                    <div className="concierge-mini-bar-row">
                      <span>POPULARITET</span>
                      <div className="concierge-bar-track">
                        <div className="concierge-bar-fill" style={{ width: `${Math.round(primaryMatch.scores.popularity || 85)}%` }} />
                      </div>
                      <b>{Math.round(primaryMatch.scores.popularity || 85)}</b>
                    </div>
                    <div className="concierge-mini-bar-row">
                      <span>UPPTÄCKT</span>
                      <div className="concierge-bar-track">
                        <div className="concierge-bar-fill" style={{ width: `${Math.round(primaryMatch.scores.discovery || 70)}%` }} />
                      </div>
                      <b>{Math.round(primaryMatch.scores.discovery || 70)}</b>
                    </div>
                    <div className="concierge-mini-bar-row">
                      <span>FÄRSKHET</span>
                      <div className="concierge-bar-track">
                        <div className="concierge-bar-fill" style={{ width: `${Math.round(primaryMatch.scores.freshness || 90)}%` }} />
                      </div>
                      <b>{Math.round(primaryMatch.scores.freshness || 90)}</b>
                    </div>
                  </div>
                </div>

                {/* Footer Actions */}
                <div className="concierge-hero-foot">
                  <div className="concierge-tags-cluster">
                    <span className="concierge-foot-tag">📍 {primaryMatch.area}</span>
                    <span className="concierge-foot-tag">🍞 {kindFilterLabel(primaryMatch.kind, lang)}</span>
                    <span className="concierge-foot-tag">🤫 {lang === "sv" ? "Lugnt" : "Quiet"}</span>
                  </div>

                  <button
                    type="button"
                    className="concierge-view-map-btn"
                    onClick={() => {
                      onSelectPlace(primaryMatch.id);
                      onSwitchToMap(primaryMatch.id);
                    }}
                  >
                    <span>{lang === "sv" ? "VISA PÅ KARTAN" : "VIEW ON MAP"}</span>
                    <ArrowRight size={15} weight="bold" />
                  </button>
                </div>
              </div>
            </div>
          </article>
        ) : null}

        {/* Secondary Match Items List */}
        <div className="concierge-secondary-matches-list">
          {secondaryMatches.map((place, idx) => {
            const isSaved = savedPlaceIds.includes(place.id);
            const score = Math.round(place.scores.recommendation || 82 - idx * 4);
            const photo =
              (place as any).photos?.[0]?.url ||
              (place as any).imageUrl ||
              "/hero_bakery_window.jpg";

            return (
              <article key={place.id} className="concierge-secondary-card">
                <span className="concierge-secondary-rank">#{idx + 2}</span>

                <div className="concierge-secondary-img-wrap">
                  <img
                    src={photo}
                    alt={place.name}
                    className="concierge-secondary-img"
                    onError={(e) => {
                      e.currentTarget.src = "/hero_bakery_window.jpg";
                    }}
                  />
                </div>

                <div className="concierge-secondary-info">
                  <div className="concierge-secondary-meta">
                    <span>{kindFilterLabel(place.kind, lang).toUpperCase()}</span>
                    <span>·</span>
                    <span>{place.area.toUpperCase()}</span>
                  </div>
                  <h4 className="concierge-secondary-title">{place.name}</h4>
                  <p className="concierge-secondary-desc">
                    {place.note ||
                      (lang === "sv"
                        ? "Hantverksfika och säsongsbakat med stark lokal identitet."
                        : "Craft baking and honest coffee with strong neighborhood ties.")}
                  </p>
                </div>

                <div className="concierge-secondary-score-col">
                  <div className="concierge-secondary-score-box">
                    <strong>{score}</strong>
                    <small>SCORE</small>
                  </div>

                  <button
                    type="button"
                    className="concierge-secondary-save-btn"
                    onClick={() => onToggleSave(place.id)}
                    title={isSaved ? "Sparad" : "Spara"}
                  >
                    <BookmarkSimple size={18} weight={isSaved ? "fill" : "bold"} />
                  </button>

                  <button
                    type="button"
                    className="concierge-secondary-map-link"
                    onClick={() => {
                      onSelectPlace(place.id);
                      onSwitchToMap(place.id);
                    }}
                  >
                    <span>{lang === "sv" ? "KARTA" : "MAP"}</span>
                    <ArrowRight size={13} weight="bold" />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </main>

      {/* ZONE 3: Right Collapsible Filters Drawer */}
      <aside className={`concierge-filters-drawer ${isFiltersOpen ? "is-open" : "is-collapsed"}`}>
        <div className="concierge-filters-head">
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Faders size={16} weight="bold" />
            <strong>{lang === "sv" ? "FILTER" : "FILTERS"}</strong>
          </div>
          <button
            type="button"
            className="concierge-filters-toggle-btn"
            onClick={() => setIsFiltersOpen(!isFiltersOpen)}
          >
            {isFiltersOpen ? (lang === "sv" ? "DÖLJ" : "HIDE") : (lang === "sv" ? "VISA" : "SHOW")}
          </button>
        </div>

        {isFiltersOpen && (
          <div className="concierge-filters-content">
            {/* Type */}
            <div className="concierge-filter-group">
              <span className="concierge-filter-group-label">{lang === "sv" ? "TYP" : "TYPE"}</span>
              <div className="concierge-checkbox-list">
                <label className="concierge-checkbox-label">
                  <input
                    type="checkbox"
                    checked={kind === "All places"}
                    onChange={() => onKindChange("All places")}
                  />
                  <span>{lang === "sv" ? "Alla ställen" : "All places"}</span>
                </label>
                {establishmentTypes.map((type) => (
                  <label key={type} className="concierge-checkbox-label">
                    <input
                      type="checkbox"
                      checked={kind === type}
                      onChange={() => onKindChange(type)}
                    />
                    <span>{kindFilterLabel(type, lang)}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Cuisine Dropdown */}
            <div className="concierge-filter-group">
              <span className="concierge-filter-group-label">{lang === "sv" ? "KÖK" : "CUISINE"}</span>
              <select
                className="concierge-cuisine-select"
                value={cuisine}
                onChange={(e) => onCuisineChange(e.target.value)}
              >
                <option value={allCuisines}>{lang === "sv" ? "Alla kök" : "All cuisines"}</option>
                {cuisineOptions.map((c) => (
                  <option key={c} value={c}>
                    {cuisineLabel(c, lang)}
                  </option>
                ))}
              </select>
            </div>

            {/* Reset All */}
            <button
              type="button"
              className="concierge-reset-filters-btn"
              onClick={onResetFilters}
            >
              <ArrowCounterClockwise size={14} weight="bold" />
              <span>{lang === "sv" ? "ÅTERSTÄLL ALLA FILTER" : "RESET ALL"}</span>
            </button>
          </div>
        )}
      </aside>
    </div>
  );
}
