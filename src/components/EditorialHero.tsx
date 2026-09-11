import React, { useState } from "react";
import { ArrowRight, Compass, Sparkle, MagnifyingGlass, Coffee, Bread, MapPin, Eye } from "@phosphor-icons/react";
import type { Language } from "../app/shared";
import type { PlaceInput } from "../../lib/scoring";

interface EditorialHeroProps {
  lang: Language;
  totalPlaces: number;
  onAskMotkarta: (prompt: string) => void;
  onExploreMap: () => void;
  onSelectPlace: (placeId: number) => void;
  featuredPlaces: readonly {
    id: number;
    kind: string;
    area: string;
    name: string;
    imageUrl: string;
    credit: string;
  }[];
}

export function EditorialHero({
  lang,
  totalPlaces,
  onAskMotkarta,
  onExploreMap,
  onSelectPlace,
  featuredPlaces,
}: EditorialHeroProps) {
  const [cravingInput, setCravingInput] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (cravingInput.trim()) {
      onAskMotkarta(cravingInput.trim());
    } else {
      onExploreMap();
    }
  };

  const starterSuggestions = lang === "sv"
    ? ["specialty coffee på Södermalm", "bästa surdegsbageriet", "mysig vinbar i Vasastan"]
    : ["specialty coffee in Södermalm", "best artisan bakery", "cozy wine bar in Vasastan"];

  // Fallback to known Gast and Söderbergs bageri IDs
  const gast = featuredPlaces.find((p) => p.name.toLowerCase().includes("gast")) || featuredPlaces[0];
  const soderbergs = featuredPlaces.find((p) => p.name.toLowerCase().includes("söderberg") || p.name.toLowerCase().includes("soderberg")) || featuredPlaces[1] || featuredPlaces[0];

  return (
    <section className="editorial-hero-container" aria-label="Motkarta Editorial Hero">
      <div className="editorial-hero-grid">
        {/* Left Editorial Copy & Action Pane */}
        <div className="editorial-hero-copy">
          <div className="editorial-badge-tag">
            <span className="editorial-red-square" aria-hidden="true" />
            <span className="editorial-tag-text">
              {lang === "sv" ? "BRA MAT FINNS BORTOM ALGORITMERNA" : "GOOD FOOD LIVES OFF THE BEATEN PATH"}
            </span>
          </div>

          <h1 className="editorial-hero-headline">
            <span>{lang === "sv" ? "HITTA STÄLLENA" : "FIND THE PLACES"}</span>
            <span className="editorial-blue-highlight">
              {lang === "sv" ? "ALGORITMEN MISSADE." : "THE ALGORITHM MISSED."}
            </span>
          </h1>

          <p className="editorial-hero-subtext">
            {lang === "sv"
              ? "En transparent Stockholmskarta för restauranger, bagerier, kaféer och specialkaffe. Ingen betald ranking. Bara genuin mat och anledningarna till varför den spelar roll."
              : "A transparent Stockholm map for restaurants, bakeries, cafés and specialty coffee. No paid ranking. Just great food, and the reasons it matters."}
          </p>

          <form className="editorial-craving-form" onSubmit={handleSubmit}>
            <div className="editorial-craving-input-wrap">
              <MagnifyingGlass size={20} weight="bold" className="editorial-craving-icon" />
              <input
                type="text"
                className="editorial-craving-input"
                placeholder={lang === "sv" ? "Vad är du sugen på?" : "What are you craving?"}
                value={cravingInput}
                onChange={(e) => setCravingInput(e.target.value)}
                aria-label={lang === "sv" ? "Vad är du sugen på?" : "What are you craving?"}
              />
            </div>
            <button type="submit" className="editorial-ask-btn">
              <Sparkle size={16} weight="fill" />
              <span>{lang === "sv" ? "FRÅGA MOTKARTA" : "ASK MOTKARTA"}</span>
              <ArrowRight size={16} weight="bold" />
            </button>
          </form>

          <div className="editorial-starter-chips">
            <span className="editorial-starter-label">
              {lang === "sv" ? "PROVA TILL EXEMPEL" : "TRY SOMETHING LIKE"}
            </span>
            <div className="editorial-starter-row">
              {starterSuggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  className="editorial-starter-chip"
                  onClick={() => {
                    setCravingInput(suggestion);
                    onAskMotkarta(suggestion);
                  }}
                >
                  “{suggestion}”
                </button>
              ))}
            </div>
          </div>

          <div className="editorial-hero-nav-link">
            <button type="button" className="editorial-explore-map-btn" onClick={onExploreMap}>
              <Compass size={18} weight="bold" />
              <span>{lang === "sv" ? "UTFORSKA KARTAN" : "EXPLORE THE MAP"}</span>
              <ArrowRight size={16} weight="bold" />
            </button>
          </div>
        </div>

        {/* Right Photography-Led Frame with Interactive Venue Callouts */}
        <div className="editorial-hero-visual">
          <div className="editorial-visual-frame">
            <img
              src="/hero_bakery_window.jpg"
              alt="Artisan Stockholm bakery window with BRÖD KAFFE FOLK"
              className="editorial-hero-photo"
              onError={(e) => {
                // Fallback to Söderbergs or Gast image if custom photo unavailable
                if (soderbergs?.imageUrl) e.currentTarget.src = soderbergs.imageUrl;
              }}
            />

            {/* Overlaid Badges & Ambient Typographic Accents */}
            <div className="editorial-visual-top-bar">
              <div className="editorial-location-accent">
                <span>{lang === "sv" ? "ÄKTA STÄLLEN" : "REAL PLACES"}</span>
                <span>{lang === "sv" ? "ETT LJUSARE STOCKHOLM" : "A BRIGHTER STOCKHOLM"}</span>
              </div>
              <div className="editorial-count-badge">
                <span className="editorial-red-square" aria-hidden="true" />
                <span>
                  {(totalPlaces || 2993).toLocaleString(lang === "sv" ? "sv-SE" : "en-US")}{" "}
                  {lang === "sv" ? "OBEROBENDE STÄLLEN" : "INDEPENDENT PLACES"}
                </span>
                <span className="editorial-badge-sub">
                  {lang === "sv" ? "INGEN BETALD RANKING" : "NO PAID RANKING"}
                </span>
              </div>
            </div>

            {/* SVG Connecting Map Route Line */}
            <svg className="editorial-route-overlay" viewBox="0 0 600 450" preserveAspectRatio="none" aria-hidden="true">
              <path
                d="M 120 160 C 220 150, 320 220, 440 280"
                className="editorial-route-path"
              />
            </svg>

            {/* Pin 1: Gast */}
            {gast ? (
              <div
                className="editorial-venue-card editorial-venue-card-1"
                onClick={() => onSelectPlace(gast.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === "Enter" && onSelectPlace(gast.id)}
                title={lang === "sv" ? `Visa ${gast.name} på kartan` : `View ${gast.name} on map`}
              >
                <div className="editorial-venue-pin">
                  <MapPin size={16} weight="fill" />
                </div>
                <div className="editorial-venue-info">
                  <div className="editorial-venue-title-row">
                    <strong>{gast.name}</strong>
                  </div>
                  <div className="editorial-venue-meta">
                    <span>{gast.area}</span> · <span>{gast.kind}</span>
                  </div>
                  <p className="editorial-venue-desc">
                    {lang === "sv"
                      ? "Omtänksamt kaffe, säsongsbakat och en favorit på Kungsholmen."
                      : "Thoughtful coffee, seasonal baking and a neighborhood favorite."}
                  </p>
                </div>
              </div>
            ) : null}

            {/* Pin 2: Söderbergs Bageri */}
            {soderbergs ? (
              <div
                className="editorial-venue-card editorial-venue-card-2"
                onClick={() => onSelectPlace(soderbergs.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === "Enter" && onSelectPlace(soderbergs.id)}
                title={lang === "sv" ? `Visa ${soderbergs.name} på kartan` : `View ${soderbergs.name} on map`}
              >
                <div className="editorial-venue-pin">
                  <MapPin size={16} weight="fill" />
                </div>
                <div className="editorial-venue-info">
                  <div className="editorial-venue-title-row">
                    <strong>{soderbergs.name}</strong>
                  </div>
                  <div className="editorial-venue-meta">
                    <span>{soderbergs.area}</span> · <span>{soderbergs.kind}</span>
                  </div>
                  <p className="editorial-venue-desc">
                    {lang === "sv"
                      ? "Äkta surdeg, kardemummabullar och ett varmare Stockholm."
                      : "Proper sourdough, cardamom buns and a warmer Stockholm."}
                  </p>
                </div>
              </div>
            ) : null}

            <div className="editorial-visual-bottom-bar">
              <span className="editorial-slogan-small">
                {lang === "sv" ? "MAT FÖR FOLK NÄRMARE" : "FOOD BRINGS PEOPLE CLOSER"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Ticker / Transparent Trust Bar */}
      <div className="editorial-hero-ticker">
        <div className="editorial-ticker-col editorial-ticker-left">
          <Eye size={18} weight="bold" className="editorial-ticker-icon" />
          <div className="editorial-ticker-text">
            <strong>
              {lang === "sv" ? "VARJE REKOMMENDATION VISAR SINA SIGNALER." : "EVERY RECOMMENDATION SHOWS ITS SIGNALS."}
            </strong>
            <small>
              {lang === "sv"
                ? "KÖK, STADSDEL, REDAKTÖRSNOTERINGAR OCH VAD SOM GÖR DET SPECIELLT."
                : "CUISINE, NEIGHBORHOOD, EDITOR NOTES, AND WHAT MAKES IT SPECIAL."}
            </small>
          </div>
        </div>

        <div className="editorial-ticker-col editorial-ticker-right">
          <div className="editorial-ticker-text">
            <strong>
              {lang === "sv" ? "ETT GODARE, MER MÄNSKLIGT STOCKHOLM." : "A MORE DELICIOUS, MORE HUMAN STOCKHOLM."}
            </strong>
            <small>
              {lang === "sv"
                ? "OBEROBENDE UPPTÄCKT FÖR EN LJUSARE STAD."
                : "INDEPENDENT DISCOVERY FOR A BRIGHTER CITY."}
            </small>
          </div>
        </div>
      </div>
    </section>
  );
}
