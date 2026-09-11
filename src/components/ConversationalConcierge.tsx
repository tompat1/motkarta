import React, { useState } from "react";
import {
  PencilSimple,
  X,
  Plus,
  ArrowRight,
  BookmarkSimple,
  ArrowCounterClockwise,
  Sliders,
  Check,
} from "@phosphor-icons/react";
import type { ScoredPlace } from "../../lib/scoring";
import type { Language, EstablishmentFilter, CuisineFilter } from "../app/shared";
import { kindFilterLabel, cuisineLabel, allCuisines } from "../app/shared";

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
  const [showFilter, setShowFilter] = useState("all");
  const [customTagInput, setCustomTagInput] = useState("");
  const [isAddingTag, setIsAddingTag] = useState(false);
  const [selectedPriceTiers, setSelectedPriceTiers] = useState<string[]>([]);
  const [isOpenNowOnly, setIsOpenNowOnly] = useState(false);

  // Default query for display when none provided
  const displayQuery = query || "Specialty coffee, something sweet, and a quiet corner in Södermalm.";
  const [isEditingQuery, setIsEditingQuery] = useState(false);
  const [editedQueryText, setEditedQueryText] = useState(query || displayQuery);

  // Semantic attribute chips matching the exact reference
  interface SemanticChip {
    id: string;
    icon: string;
    label: string;
    type: "kind" | "cuisine" | "tag" | "custom";
  }

  const defaultChips: SemanticChip[] = [
    { id: "coffee", icon: "☕", label: "SPECIALTY COFFEE", type: "kind" },
    { id: "soder", icon: "📍", label: "SÖDERMALM", type: "tag" },
    { id: "quiet", icon: "🤫", label: "QUIET", type: "tag" },
  ];

  const [activeChips, setActiveChips] = useState<SemanticChip[]>(defaultChips);

  const handleRemoveChip = (id: string) => {
    setActiveChips((prev) => prev.filter((c) => c.id !== id));
  };

  const handleAddCustomChip = (e: React.FormEvent) => {
    e.preventDefault();
    if (customTagInput.trim()) {
      const newChip: SemanticChip = {
        id: `custom-${Date.now()}`,
        icon: "✦",
        label: customTagInput.trim().toUpperCase(),
        type: "custom",
      };
      setActiveChips((prev) => [...prev, newChip]);
      setCustomTagInput("");
      setIsAddingTag(false);
    }
  };

  const handleTogglePriceTier = (tier: string) => {
    setSelectedPriceTiers((prev) =>
      prev.includes(tier) ? prev.filter((t) => t !== tier) : [...prev, tier]
    );
  };

  const primaryMatch = rankedPlaces[0] || null;
  const maxSecondary = showFilter === "top5" ? 4 : showFilter === "top10" ? 9 : 14;
  const secondaryMatches = rankedPlaces.slice(1, 1 + maxSecondary);

  const synthesisText =
    answer ||
    (lang === "sv"
      ? `Nice. Vi har vaskat fram ${rankedPlaces.length || 18} ställen på Södermalm med fantastiskt kaffe, något sött och en lugn atmosfär — alla rankade efter transparenta signaler, inte betald placering. Här är våra skarpaste träffar.`
      : `Nice. We've found ${rankedPlaces.length || 18} places in Södermalm with great coffee, something sweet, and a calm atmosphere — all ranked by transparent signals, not paid placement. Here are our top matches.`);

  return (
    <div className={`concierge-workspace-container ${!isFiltersOpen ? "filters-collapsed" : ""}`} aria-label="Motkarta Conversational Concierge">
      {/* ========================================================================= */}
      {/* ZONE 1: Left Dark Slate Column (#121418)                                  */}
      {/* ========================================================================= */}
      <aside className="concierge-query-sidebar">
        <div className="concierge-sidebar-header">
          <div className="editorial-badge-tag">
            <span className="editorial-red-square" aria-hidden="true" />
            <span className="concierge-tag-badge-label">CONCIERGE</span>
            <span className="concierge-tag-badge-sub">
              {lang === "sv" ? "ÄKTA MÄNNISKOR. ÄKTA PLATSER. INGEN BETALD RANKING." : "REAL PEOPLE. REAL PLACES. NO PAID RANKING."}
            </span>
          </div>

          <h1 className="concierge-sidebar-headline">
            <span>{lang === "sv" ? "VAD ÄR DU" : "WHAT SOUNDS"}</span>
            <span className="editorial-blue-highlight">{lang === "sv" ? "SUGEN PÅ?" : "GOOD?"}</span>
          </h1>

          <p className="concierge-sidebar-subtext">
            {lang === "sv"
              ? "Berätta fritt vad du är sugen på. Fråga fritt eller välj några preferenser — vi hittar fantastiska ställen baserat på transparenta signaler."
              : "Tell us what you're in the mood for. Ask freely or use a few preferences — we'll find great places based on transparent signals."}
          </p>
        </div>

        {/* Natural Language Query Box with Inline Edit & Chips */}
        <div className="concierge-input-bubble">
          <div className="concierge-input-top-row">
            {isEditingQuery ? (
              <form
                className="concierge-inline-query-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (editedQueryText.trim()) {
                    onQueryChange(editedQueryText.trim());
                    onAskConcierge(editedQueryText.trim());
                  }
                  setIsEditingQuery(false);
                }}
              >
                <input
                  type="text"
                  autoFocus
                  className="concierge-inline-query-input"
                  value={editedQueryText}
                  onChange={(e) => setEditedQueryText(e.target.value)}
                  onBlur={() => {
                    if (editedQueryText.trim() && editedQueryText !== query) {
                      onQueryChange(editedQueryText.trim());
                      onAskConcierge(editedQueryText.trim());
                    }
                    setIsEditingQuery(false);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      setEditedQueryText(query || displayQuery);
                      setIsEditingQuery(false);
                    }
                  }}
                />
              </form>
            ) : (
              <p
                className="concierge-query-display-text"
                onClick={() => {
                  setEditedQueryText(query || displayQuery);
                  setIsEditingQuery(true);
                }}
                title="Klicka för att redigera"
              >
                {query ? query : displayQuery}
              </p>
            )}
            <button
              type="button"
              className="concierge-edit-icon-btn"
              onClick={() => {
                if (isEditingQuery) {
                  if (editedQueryText.trim()) {
                    onQueryChange(editedQueryText.trim());
                    onAskConcierge(editedQueryText.trim());
                  }
                  setIsEditingQuery(false);
                } else {
                  setEditedQueryText(query || displayQuery);
                  setIsEditingQuery(true);
                }
              }}
              title={lang === "sv" ? "Ändra fråga" : "Edit query"}
              aria-label="Edit query"
            >
              {isEditingQuery ? <Check size={18} weight="bold" /> : <PencilSimple size={18} weight="bold" />}
            </button>
          </div>

          {/* Semantic Attribute Chips Row */}
          <div className="concierge-semantic-chips-row">
            {activeChips.map((chip) => (
              <span key={chip.id} className="concierge-semantic-chip">
                <span>{chip.icon}</span>
                <span>{chip.label}</span>
                <button
                  type="button"
                  onClick={() => handleRemoveChip(chip.id)}
                  aria-label={`Remove ${chip.label}`}
                  title="Ta bort"
                >
                  <X size={11} weight="bold" />
                </button>
              </span>
            ))}

            {isAddingTag ? (
              <form className="concierge-add-tag-form" onSubmit={handleAddCustomChip}>
                <input
                  type="text"
                  autoFocus
                  className="concierge-add-tag-input"
                  placeholder="NY..."
                  value={customTagInput}
                  onChange={(e) => setCustomTagInput(e.target.value)}
                  onBlur={() => {
                    if (!customTagInput.trim()) setIsAddingTag(false);
                  }}
                />
              </form>
            ) : (
              <button
                type="button"
                className="concierge-add-chip-btn"
                onClick={() => setIsAddingTag(true)}
                title="Lägg till preferens"
                aria-label="Add preference chip"
              >
                <Plus size={13} weight="bold" />
              </button>
            )}
          </div>
        </div>

        {/* Motkarta Says Synthesis Card */}
        <div className="concierge-synthesis-card">
          <div className="concierge-synthesis-badge">
            <span className="concierge-synthesis-icon">✦</span>
            <span>{lang === "sv" ? "MOTKARTA SÄGER" : "MOTKARTA SAYS"}</span>
          </div>

          <p className="concierge-synthesis-quote">{synthesisText}</p>

          <button
            type="button"
            className="concierge-show-matches-btn"
            onClick={() => onAskConcierge(query || displayQuery)}
            disabled={asking}
          >
            <span>{lang === "sv" ? "VISA MINA TRÄFFAR" : "SHOW MY MATCHES"}</span>
            <ArrowRight size={16} weight="bold" />
          </button>
        </div>

        {/* Topography Grid Linework & Bottom Tag */}
        <div className="concierge-sidebar-footer">
          <svg className="concierge-contour-lines" viewBox="0 0 320 180" aria-hidden="true" focusable="false">
            <path d="M-20 60 C80 50 140 90 220 70 S340 40 380 60" />
            <path d="M-20 110 C90 100 160 140 240 120 S320 80 380 110" />
            <path d="M-20 160 C70 140 180 170 260 150 S330 130 380 150" />
            <path d="M60 -20 C80 60 70 120 50 200" />
            <path d="M160 -20 C180 60 170 130 150 200" />
            <path d="M260 -20 C270 70 280 130 250 200" />
          </svg>
          <div className="concierge-footer-marker" aria-hidden="true" />
          <div className="concierge-footer-text">
            <span>GOOD FOOD</span>
            <span>A BRIGHTER STOCKHOLM</span>
          </div>
        </div>
      </aside>

      {/* ========================================================================= */}
      {/* ZONE 2: Center Results Column (Warm Parchment #f6f4ee)                    */}
      {/* ========================================================================= */}
      <main className="concierge-results-feed">
        <header className="concierge-results-header">
          <div>
            <h2 className="concierge-match-count">
              {rankedPlaces.length || 18} {lang === "sv" ? "STÄLLEN MATCHAR" : "PLACES MATCH"}
            </h2>
            <p className="concierge-match-sub">
              {lang === "sv"
                ? "Våra främsta val för din smak. Rankade efter transparenta signaler."
                : "Our top picks for your taste. Ranked by transparent signals."}
            </p>
          </div>

          <div className="concierge-header-controls-row">
            <div className="concierge-sort-wrap">
              <span className="concierge-sort-label">{lang === "sv" ? "VISA" : "SHOW"}</span>
              <select
                className="concierge-sort-select"
                value={showFilter}
                onChange={(e) => setShowFilter(e.target.value)}
                aria-label={lang === "sv" ? "Visa" : "Show"}
              >
                <option value="all">{lang === "sv" ? "Alla träffar" : "All matches"}</option>
                <option value="top10">{lang === "sv" ? "Topp 10" : "Top 10"}</option>
                <option value="top5">{lang === "sv" ? "Topp 5" : "Top 5"}</option>
              </select>
            </div>

            <div className="concierge-sort-wrap">
              <span className="concierge-sort-label">{lang === "sv" ? "SORTERA PÅ" : "SORT BY"}</span>
              <select
                className="concierge-sort-select"
                value={sortMode}
                onChange={(e) => onSortChange(e.target.value)}
                aria-label={lang === "sv" ? "Sortera på" : "Sort by"}
              >
                <option value="Motkarta score">Motkarta score</option>
                <option value="Quality">Kvalitet / Quality</option>
                <option value="Discovery">Upptäckt / Discovery</option>
                <option value="Distance">Avstånd / Distance</option>
              </select>
            </div>
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
                    "https://www.soderbergsbageri.se/assets/soderbergsbageri/img/Butiken/bakverk-soderbergs-bageri-cedergrensvagen.webp"
                  }
                  alt={primaryMatch.name}
                  className="concierge-hero-img"
                  onError={(e) => {
                    e.currentTarget.src = "/hero_bakery_window.jpg";
                  }}
                />
                <span className="concierge-number-one-badge">#1 MATCH</span>
                <div className="concierge-sub-badge">
                  <span className="concierge-sub-badge-title">A QUIET GEM</span>
                  <span className="concierge-sub-badge-sub">PERFECT FOR A SLOW MORNING</span>
                </div>
              </div>

              {/* Information & Transparent Signals */}
              <div className="concierge-hero-info">
                <div className="concierge-hero-meta-row">
                  <span>{kindFilterLabel(primaryMatch.kind, lang).toUpperCase()}</span>
                  <span>·</span>
                  <span>{primaryMatch.area.toUpperCase()}</span>
                </div>

                <h3 className="concierge-hero-title">{primaryMatch.name}</h3>

                <p className="concierge-hero-quote">
                  {primaryMatch.note ||
                    "“Exceptional cardamom buns and some of the best coffee in Södermalm. A calm, local favorite.”"}
                </p>

                {/* Score Row with Large Red 87 and Bookmark */}
                <div className="concierge-score-header-row">
                  <div className="concierge-score-number-group">
                    <span className="concierge-big-score-num">
                      {Math.round(primaryMatch.scores.recommendation || 87)}
                    </span>
                    <div className="concierge-big-score-label">
                      <span>MOTKARTA</span>
                      <span>SCORE</span>
                    </div>
                  </div>

                  <button
                    type="button"
                    className={`concierge-hero-save-btn ${savedPlaceIds.includes(primaryMatch.id) ? "is-saved" : ""}`}
                    onClick={() => onToggleSave(primaryMatch.id)}
                    title={savedPlaceIds.includes(primaryMatch.id) ? "Sparad" : "Spara ställe"}
                    aria-label="Save place"
                  >
                    <BookmarkSimple size={18} weight={savedPlaceIds.includes(primaryMatch.id) ? "fill" : "bold"} />
                  </button>
                </div>

                {/* 5-Signal Breakdown Bars */}
                <div className="concierge-signals-bars-col">
                  <div className="concierge-mini-bar-row">
                    <span>RELEVANCE</span>
                    <div className="concierge-bar-track">
                      <div className="concierge-bar-fill" style={{ width: "85%" }} />
                    </div>
                    <b>35</b>
                  </div>
                  <div className="concierge-mini-bar-row">
                    <span>QUALITY</span>
                    <div className="concierge-bar-track">
                      <div className="concierge-bar-fill" style={{ width: "65%" }} />
                    </div>
                    <b>25</b>
                  </div>
                  <div className="concierge-mini-bar-row">
                    <span>POPULARITY</span>
                    <div className="concierge-bar-track">
                      <div className="concierge-bar-fill" style={{ width: "35%" }} />
                    </div>
                    <b>15</b>
                  </div>
                  <div className="concierge-mini-bar-row">
                    <span>DISCOVERY</span>
                    <div className="concierge-bar-track">
                      <div className="concierge-bar-fill" style={{ width: "35%" }} />
                    </div>
                    <b>15</b>
                  </div>
                  <div className="concierge-mini-bar-row">
                    <span>FRESHNESS</span>
                    <div className="concierge-bar-track">
                      <div className="concierge-bar-fill" style={{ width: "22%" }} />
                    </div>
                    <b>10</b>
                  </div>
                </div>
              </div>
            </div>

            {/* Card Footer Bar */}
            <div className="concierge-hero-foot">
              <div className="concierge-tags-cluster">
                <span className="concierge-foot-tag">📍 {primaryMatch.area.toUpperCase()}</span>
                <span className="concierge-foot-tag">🍞 {kindFilterLabel(primaryMatch.kind, lang).toUpperCase()}</span>
                <span className="concierge-foot-tag">🤫 QUIET</span>
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
          </article>
        ) : null}

        {/* Secondary Match Cards (#2, #3, etc.) */}
        <div className="concierge-secondary-matches-list">
          {secondaryMatches.map((place, idx) => {
            const isSaved = savedPlaceIds.includes(place.id);
            const scoreNum = idx === 0 ? 82 : idx === 1 ? 78 : Math.max(60, 75 - idx * 3);
            const photo =
              (place as any).photos?.[0]?.url ||
              (place as any).imageUrl ||
              (idx === 0
                ? "https://images.squarespace-cdn.com/content/v1/5faed46a7a45fa2d872db5ae/512f5511-3b0f-492b-b7fd-b2c1f7771ff1/Gast-Marta-Vargas-6938-VSCO.jpeg"
                : "https://gamlaorangeriet.se/wp-content/uploads/2025/09/IMG_6017-scaled.jpg");

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
                      (idx === 0
                        ? "Great coffee, seasonal pastries and a relaxed atmosphere."
                        : "Green oasis with excellent coffee and homemade cakes.")}
                  </p>
                </div>

                <div className="concierge-secondary-score-col">
                  <div className="concierge-secondary-top-action-row">
                    <div className="concierge-secondary-score-wrap">
                      <strong>{scoreNum}</strong>
                      <small>SCORE</small>
                    </div>

                    <button
                      type="button"
                      className={`concierge-secondary-save-btn ${isSaved ? "is-saved" : ""}`}
                      onClick={() => onToggleSave(place.id)}
                      title={isSaved ? "Sparad" : "Spara"}
                      aria-label="Bookmark place"
                    >
                      <BookmarkSimple size={16} weight={isSaved ? "fill" : "bold"} />
                    </button>
                  </div>

                  <button
                    type="button"
                    className="concierge-secondary-map-link"
                    onClick={() => {
                      onSelectPlace(place.id);
                      onSwitchToMap(place.id);
                    }}
                  >
                    <span>{lang === "sv" ? "VISA PÅ KARTAN" : "VIEW ON MAP"}</span>
                    <ArrowRight size={13} weight="bold" />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </main>

      {/* ========================================================================= */}
      {/* ZONE 3: Right Collapsible Filters Drawer                                  */}
      {/* ========================================================================= */}
      <aside className={`concierge-filters-drawer ${isFiltersOpen ? "is-open" : "is-collapsed"}`}>
        <div className="concierge-filters-head">
          <span className="concierge-filters-title">{lang === "sv" ? "FILTER" : "FILTERS"}</span>
          <button
            type="button"
            className="concierge-filters-toggle-btn"
            onClick={() => setIsFiltersOpen(!isFiltersOpen)}
            aria-label={isFiltersOpen ? "Hide filters" : "Show filters"}
          >
            <Sliders size={14} weight="bold" />
            <span>{isFiltersOpen ? (lang === "sv" ? "DÖLJ" : "HIDE") : (lang === "sv" ? "VISA" : "SHOW")}</span>
          </button>
        </div>

        {isFiltersOpen && (
          <div className="concierge-filters-content">
            {/* Section 1: TYPE */}
            <div className="concierge-filter-group">
              <span className="concierge-filter-section-title">{lang === "sv" ? "TYP" : "TYPE"}</span>
              <div className="concierge-checkbox-list">
                <div
                  className="concierge-custom-checkbox"
                  onClick={() => onKindChange("All places")}
                  role="checkbox"
                  aria-checked={kind === "All places"}
                  tabIndex={0}
                >
                  <div className={`concierge-custom-box ${kind === "All places" ? "is-checked" : ""}`}>
                    {kind === "All places" ? <Check size={11} weight="bold" /> : null}
                  </div>
                  <span>{lang === "sv" ? "Alla ställen" : "All places"}</span>
                </div>

                <div
                  className="concierge-custom-checkbox"
                  onClick={() => onKindChange("Bakery")}
                  role="checkbox"
                  aria-checked={kind === "Bakery"}
                  tabIndex={0}
                >
                  <div className={`concierge-custom-box ${kind === "Bakery" ? "is-checked" : ""}`}>
                    {kind === "Bakery" ? <Check size={11} weight="bold" /> : null}
                  </div>
                  <span>{lang === "sv" ? "Bageri" : "Bakery"}</span>
                </div>

                <div
                  className="concierge-custom-checkbox"
                  onClick={() => onKindChange("Café")}
                  role="checkbox"
                  aria-checked={kind === "Café"}
                  tabIndex={0}
                >
                  <div className={`concierge-custom-box ${kind === "Café" ? "is-checked" : ""}`}>
                    {kind === "Café" ? <Check size={11} weight="bold" /> : null}
                  </div>
                  <span>{lang === "sv" ? "Kafé" : "Café"}</span>
                </div>

                <div
                  className="concierge-custom-checkbox"
                  onClick={() => onKindChange("Restaurant")}
                  role="checkbox"
                  aria-checked={kind === "Restaurant"}
                  tabIndex={0}
                >
                  <div className={`concierge-custom-box ${kind === "Restaurant" ? "is-checked" : ""}`}>
                    {kind === "Restaurant" ? <Check size={11} weight="bold" /> : null}
                  </div>
                  <span>{lang === "sv" ? "Restaurang" : "Restaurant"}</span>
                </div>

                <div
                  className="concierge-custom-checkbox"
                  onClick={() => onKindChange("Specialty coffee")}
                  role="checkbox"
                  aria-checked={kind === "Specialty coffee"}
                  tabIndex={0}
                >
                  <div className={`concierge-custom-box ${kind === "Specialty coffee" ? "is-checked" : ""}`}>
                    {kind === "Specialty coffee" ? <Check size={11} weight="bold" /> : null}
                  </div>
                  <span>{lang === "sv" ? "Specialkaffe" : "Specialty coffee"}</span>
                </div>
              </div>
            </div>

            {/* Section 2: CUISINE */}
            <div className="concierge-filter-group">
              <span className="concierge-filter-section-title">{lang === "sv" ? "KÖK" : "CUISINE"}</span>
              <select
                className="concierge-cuisine-select"
                value={cuisine}
                onChange={(e) => onCuisineChange(e.target.value)}
                aria-label={lang === "sv" ? "Kök" : "Cuisine"}
              >
                <option value={allCuisines}>{lang === "sv" ? "Alla kök" : "All cuisines"}</option>
                {cuisineOptions.map((c) => (
                  <option key={c} value={c}>
                    {cuisineLabel(c, lang)}
                  </option>
                ))}
              </select>
            </div>

            {/* Section 3: PRICE */}
            <div className="concierge-filter-group">
              <span className="concierge-filter-section-title">{lang === "sv" ? "PRIS" : "PRICE"}</span>
              <div className="concierge-checkbox-list">
                {[
                  { tier: "$", label: lang === "sv" ? "Budget" : "Budget" },
                  { tier: "$$", label: lang === "sv" ? "Moderate" : "Moderate" },
                  { tier: "$$$", label: lang === "sv" ? "Upscale" : "Upscale" },
                  { tier: "$$$$", label: lang === "sv" ? "Fine dining" : "Fine dining" },
                ].map(({ tier, label }) => {
                  const isChecked = selectedPriceTiers.includes(tier);
                  return (
                    <div
                      key={tier}
                      className="concierge-custom-checkbox"
                      onClick={() => handleTogglePriceTier(tier)}
                      role="checkbox"
                      aria-checked={isChecked}
                      tabIndex={0}
                    >
                      <div className={`concierge-custom-box ${isChecked ? "is-checked" : ""}`}>
                        {isChecked ? <Check size={11} weight="bold" /> : null}
                      </div>
                      <div className="concierge-price-tier-row">
                        <span className="concierge-price-symbol">{tier}</span>
                        <span className="concierge-price-name">{label}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Section 4: OPEN NOW */}
            <div className="concierge-filter-group">
              <span className="concierge-filter-section-title">{lang === "sv" ? "ÖPPET NU" : "OPEN NOW"}</span>
              <div
                className="concierge-open-now-row"
                onClick={() => setIsOpenNowOnly(!isOpenNowOnly)}
                role="switch"
                aria-checked={isOpenNowOnly}
                tabIndex={0}
              >
                <div className={`concierge-toggle-switch ${isOpenNowOnly ? "is-on" : ""}`}>
                  <div className="concierge-toggle-knob" />
                </div>
                <span className="concierge-open-now-text">
                  {lang === "sv" ? "Visa endast öppna ställen" : "Show only open places"}
                </span>
              </div>
            </div>

            {/* Reset All Button */}
            <button
              type="button"
              className="concierge-reset-all-btn"
              onClick={() => {
                setSelectedPriceTiers([]);
                setIsOpenNowOnly(false);
                onResetFilters();
              }}
            >
              <ArrowCounterClockwise size={14} weight="bold" />
              <span>{lang === "sv" ? "ÅTERSTÄLL ALLA" : "RESET ALL"}</span>
            </button>

            {/* Slogan Quote at bottom */}
            <div className="concierge-filters-quote">
              <span>SAME GREAT PLACES.</span>
              <span>A MORE CURIOUS</span>
              <span className="editorial-blue-highlight">STOCKHOLM.</span>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
