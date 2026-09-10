import React, { useEffect, useState } from "react";
import {
  ArrowLeft,
  BookmarkSimple,
  House,
  UsersThree,
  Prohibit,
  MapPin,
  Star,
  ShieldCheck,
  Compass,
  ArrowSquareOut,
  NavigationArrow,
  Check,
  PawPrint,
  ThumbsUp,
  ThumbsDown,
  Sparkle,
  Clock,
  CurrencyCircleDollar,
} from "@phosphor-icons/react";
import type { ScoredPlace } from "../../lib/scoring";
import type { Language } from "../app/shared";
import { fetchPlacePhotos, type PlacePhoto } from "../../lib/lazy-media";
import { formatDistance, distanceFromPoint } from "../app/shared";
import { PlaceFeedbackModal } from "./PlaceFeedbackModal";

const DUMMY_PLACE_IMAGE_URL = "/motkarta_drop_divided_black_red.svg";

interface PlaceDetailSheetProps {
  place: ScoredPlace;
  isOpen: boolean;
  isSaved: boolean;
  userRating: number;
  userLocation?: { latitude: number; longitude: number } | null;
  lang: Language;
  onClose: () => void;
  onToggleSave: (id: number) => void;
  onRatePlace: (id: number, rating: number) => void;
  onViewOnMap: (place: ScoredPlace) => void;
  onGetDirections?: (place: ScoredPlace) => void;
}

export function PlaceDetailSheet({
  place,
  isOpen,
  isSaved,
  userRating,
  userLocation,
  lang,
  onClose,
  onToggleSave,
  onRatePlace,
  onViewOnMap,
  onGetDirections,
}: PlaceDetailSheetProps) {
  const [photos, setPhotos] = useState<PlacePhoto[]>([]);
  const [activePhotoIndex, setActivePhotoIndex] = useState(0);
  const [feedbackType, setFeedbackType] = useState<"up" | "down" | null>(null);
  const [isNominateModalOpen, setIsNominateModalOpen] = useState(false);
  const [isUserNominated, setIsUserNominated] = useState(false);

  useEffect(() => {
    if (!place) return;
    try {
      const raw = localStorage.getItem("motkarta_user_nominated_gems");
      if (raw) {
        const list = JSON.parse(raw);
        const found = Array.isArray(list) && list.some((item: { targetId: number | string }) => item.targetId === place.id);
        setIsUserNominated(found);
      } else {
        setIsUserNominated(false);
      }
    } catch {
      setIsUserNominated(false);
    }
  }, [place?.id]);

  useEffect(() => {
    let isMounted = true;
    if (place) {
      void fetchPlacePhotos(place).then((fetched) => {
        if (isMounted) {
          setPhotos(fetched);
          setActivePhotoIndex(0);
        }
      });
    }
    return () => {
      isMounted = false;
    };
  }, [place]);

  if (!isOpen || !place) return null;

  // Subtitle tags: AREA • CUISINE / KIND • INDEPENDENT
  const primaryTag = place.cuisine ? place.cuisine.toUpperCase() : place.kind.toUpperCase();
  const subtitle = `${(place.area || "Stockholm").toUpperCase()} • ${primaryTag} • ${lang === "sv" ? "OBEROENDE" : "INDEPENDENT"}`;

  const distanceMeters =
    userLocation && place.latitude && place.longitude
      ? distanceFromPoint(place, userLocation)
      : null;
  const activePhoto = photos[activePhotoIndex] ?? null;

  return (
    <div className="place-detail-sheet-overlay" role="dialog" aria-modal="true" aria-label={place.name}>
      <article className="place-detail-sheet">
        {/* Top App Bar */}
        <header className="place-detail-topbar">
          <button
            type="button"
            className="place-detail-back-btn"
            onClick={onClose}
            aria-label={lang === "sv" ? "Tillbaka" : "Back"}
          >
            <ArrowLeft size={22} weight="bold" />
          </button>

          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <button
              type="button"
              onClick={() => setFeedbackType("up")}
              style={{
                background: "var(--color-paper, #f8fafc)",
                border: "1px solid var(--color-mist, #e2e8f0)",
                borderRadius: "50%",
                width: "40px",
                height: "40px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
              }}
              title={lang === "sv" ? "Hjälpsam / Bra ställe" : "Helpful / Good place"}
            >
              <ThumbsUp size={20} weight="bold" style={{ color: "#166534" }} />
            </button>

            <button
              type="button"
              onClick={() => setFeedbackType("down")}
              style={{
                background: "var(--color-paper, #f8fafc)",
                border: "1px solid var(--color-mist, #e2e8f0)",
                borderRadius: "50%",
                width: "40px",
                height: "40px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
              }}
              title={lang === "sv" ? "Inte bra / Felaktig info" : "Not good / Wrong info"}
            >
              <ThumbsDown size={20} weight="bold" style={{ color: "#991b1b" }} />
            </button>

            <button
              type="button"
              className={`place-detail-bookmark-btn ${isSaved ? "is-saved" : ""}`}
              onClick={() => onToggleSave(place.id)}
              aria-label={isSaved ? (lang === "sv" ? "Ta bort bokmärke" : "Remove bookmark") : (lang === "sv" ? "Spara ställe" : "Save place")}
            >
              <BookmarkSimple
                size={24}
                weight={isSaved ? "fill" : "bold"}
                style={{ color: isSaved ? "var(--color-water)" : "var(--color-ink)" }}
              />
            </button>
          </div>
        </header>

        {/* Scrollable Editorial Content */}
        <div className="place-detail-body">
          {/* Main Title & Subtitle */}
          <div className="place-detail-identity">
            <h1 className="place-detail-title">{place.name}</h1>
            <p className="place-detail-subtitle">{subtitle}</p>

            {/* Hidden Gem Status Badge / Community Nomination */}
            <div style={{ marginTop: "10px", display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "center" }}>
              {place.is_hidden_gem ? (
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    background: "#fef3c7",
                    color: "#92400e",
                    border: "1px solid #fde68a",
                    padding: "4px 10px",
                    borderRadius: "999px",
                    fontSize: "12px",
                    fontWeight: 700,
                  }}
                  title={lang === "sv" ? "Officiellt verifierad dold pärla enligt Motkartas 5 beviskrav" : "Officially verified hidden gem passing Motkarta's 5 evidence gates"}
                >
                  <Sparkle size={14} weight="fill" style={{ color: "#d97706" }} />
                  {lang === "sv" ? "Verifierad dold pärla" : "Verified hidden gem"}
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsNominateModalOpen(true)}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    background: isUserNominated ? "#fef3c7" : "var(--color-paper, #f8fafc)",
                    color: isUserNominated ? "#92400e" : "var(--color-ink, #0f172a)",
                    border: isUserNominated ? "1px solid #fde68a" : "1px solid var(--color-mist, #e2e8f0)",
                    padding: "5px 12px",
                    borderRadius: "999px",
                    fontSize: "12px",
                    fontWeight: 600,
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                  title={lang === "sv" ? "Tipsa redaktionen om att denna plats är en dold pärla" : "Nominate this place as a hidden gem"}
                >
                  <Sparkle size={14} weight={isUserNominated ? "fill" : "bold"} style={{ color: isUserNominated ? "#d97706" : "var(--color-water, #2563eb)" }} />
                  {isUserNominated
                    ? (lang === "sv" ? "Nominerad av dig" : "Nominated by you")
                    : (lang === "sv" ? "Tipsa som dold pärla" : "Nominate as hidden gem")}
                </button>
              )}

              {/* Price Tier Badge */}
              {(() => {
                const sek = place.priceSEK;
                let lvl = place.priceLevel && place.priceLevel > 0 ? place.priceLevel : null;
                if (!lvl && sek) {
                  const numMatch = sek.match(/\d+/);
                  if (numMatch) {
                    const num = parseInt(numMatch[0], 10);
                    if (num < 150) lvl = 1;
                    else if (num <= 350) lvl = 2;
                    else if (num <= 750) lvl = 3;
                    else lvl = 4;
                  }
                }
                if (!lvl && !sek) return null;
                const tier = lvl || 2;
                return (
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "5px",
                      background: "var(--color-paper, #f8fafc)",
                      color: "var(--color-ink, #0f172a)",
                      border: "1px solid var(--color-mist, #e2e8f0)",
                      padding: "4px 10px",
                      borderRadius: "999px",
                      fontSize: "12px",
                      fontWeight: 600,
                    }}
                    title={lang === "sv" ? `Prisnivå ${"$".repeat(tier)} (${sek ? `${sek} kr` : ""})` : `Price tier ${"$".repeat(tier)} (${sek ? `${sek} SEK` : ""})`}
                  >
                    <CurrencyCircleDollar size={15} weight="bold" style={{ color: "var(--color-water, #2563eb)" }} />
                    <strong>{"$".repeat(tier)}</strong>
                    {sek ? <span style={{ color: "var(--color-slate, #64748b)" }}>· {sek} SEK</span> : null}
                  </span>
                );
              })()}
            </div>
          </div>

          <hr className="place-detail-divider" />

          <div className={`place-detail-photo-container ${!activePhoto ? "place-detail-photo-container-dummy" : ""}`}>
            <img
              src={activePhoto?.url ?? DUMMY_PLACE_IMAGE_URL}
              alt={activePhoto?.caption || place.name}
              className={`place-detail-hero-photo ${!activePhoto ? "place-detail-hero-photo-dummy" : ""}`}
              loading="eager"
              onError={(event) => {
                event.currentTarget.src = DUMMY_PLACE_IMAGE_URL;
                event.currentTarget.classList.add("place-detail-hero-photo-dummy");
              }}
            />
            {photos.length > 1 ? (
              <div className="place-detail-photo-dots">
                {photos.map((_: PlacePhoto, idx: number) => (
                  <button
                    key={idx}
                    type="button"
                    className={`photo-dot ${idx === activePhotoIndex ? "is-active" : ""}`}
                    onClick={() => setActivePhotoIndex(idx)}
                    aria-label={`Photo ${idx + 1}`}
                  />
                ))}
              </div>
            ) : null}
            {activePhoto?.credit ? (
              <span className="place-detail-photo-credit">
                📷 {activePhoto.credit}
              </span>
            ) : null}
          </div>

          {/* "Varför den syns här" (Why it appears here) Section */}
          <section className="place-detail-section">
            <h2 className="place-detail-section-heading">
              {lang === "sv" ? "Varför den syns här" : "Why it's featured here"}
            </h2>

            <ul className="place-detail-reasons-list">
              <li className="place-detail-reason-item">
                <div className="reason-icon-wrapper">
                  <House size={26} weight="regular" className="reason-icon-blue" />
                </div>
                <div className="reason-text">
                  <strong>{lang === "sv" ? "Lokalt ägd" : "Locally owned"}</strong>
                  <p>{lang === "sv" ? "Drivs av oberoende grundare utan centraliserade franchisekedjor." : "Operated by independent owners without chain or franchise ownership."}</p>
                </div>
              </li>

              <li className="place-detail-reason-item">
                <div className="reason-icon-wrapper">
                  <UsersThree size={26} weight="regular" className="reason-icon-blue" />
                </div>
                <div className="reason-text">
                  <strong>{lang === "sv" ? "Återkommande gäster" : "Returning regulars"}</strong>
                  <p>{lang === "sv" ? "Hög andel lojala stammisar och genuint lokalt engagemang." : "High share of returning local regulars and authentic community love."}</p>
                </div>
              </li>

              <li className="place-detail-reason-item">
                <div className="reason-icon-wrapper">
                  <Prohibit size={26} weight="regular" className="reason-icon-red" />
                </div>
                <div className="reason-text">
                  <strong>{lang === "sv" ? "Ingen betald placering" : "Zero paid placement"}</strong>
                  <p>{lang === "sv" ? "Listad enbart genom transparent hantverk och kvalitetsbevis." : "Ranked purely on objective quality evidence and culinary craft."}</p>
                </div>
              </li>
            </ul>
          </section>

          <hr className="place-detail-divider" />

          {/* Place Note & Story */}
          {place.note ? (
            <section className="place-detail-section">
              <p className="place-detail-description">{place.note}</p>
            </section>
          ) : null}

          {/* Address & Distance */}
          <div className="place-detail-meta-box">
            <div className="meta-row">
              <MapPin size={18} weight="bold" style={{ color: "var(--color-water)", flexShrink: 0 }} />
              <span>{place.address ? `${place.address}, ${place.area}` : `${place.area}, Stockholm`}</span>
            </div>
            {place.openingHours ? (
              <div className="meta-row" style={{ alignItems: "flex-start" }}>
                <Clock size={18} weight="bold" style={{ color: "var(--color-water)", flexShrink: 0, marginTop: "2px" }} />
                <div>
                  <div style={{ fontWeight: 600, fontSize: "13px" }}>
                    {lang === "sv" ? "Öppettider" : "Opening Hours"}
                  </div>
                  <div style={{ fontSize: "12px", color: "var(--color-slate, #475569)", marginTop: "2px", lineHeight: "1.4" }}>
                    {place.openingHours}
                  </div>
                </div>
              </div>
            ) : null}
            {distanceMeters !== null ? (
              <div className="meta-row">
                <NavigationArrow size={18} weight="bold" style={{ color: "var(--color-signal)", flexShrink: 0 }} />
                <span>{lang === "sv" ? "Avstånd från dig:" : "Distance from you:"} <b>{formatDistance(distanceMeters, lang)}</b></span>
              </div>
            ) : null}
            {place.website ? (
              <div className="meta-row">
                <ArrowSquareOut size={18} weight="bold" style={{ color: "var(--color-water)", flexShrink: 0 }} />
                <a href={place.website} target="_blank" rel="noopener noreferrer" className="place-detail-web-link">
                  {place.website.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}
                </a>
              </div>
            ) : null}
          </div>

          {/* Tags */}
          {place.tags?.length > 0 ? (
            <div className="place-detail-tags">
              {place.tags.map((tag) => {
                const isDogTag = tag.toLowerCase().includes("dog") || tag.toLowerCase().includes("hund") || tag.toLowerCase() === "tasstipset";
                return (
                  <span
                    key={tag}
                    className={`place-detail-tag-chip ${isDogTag ? "is-dog-friendly-chip" : ""}`}
                    style={isDogTag ? { display: "inline-flex", alignItems: "center", gap: "4px" } : undefined}
                  >
                    {isDogTag ? <PawPrint size={13} weight="bold" /> : null}
                    {tag}
                  </span>
                );
              })}
            </div>
          ) : null}

          {/* User Star Rating Widget */}
          <div className="place-detail-rating-widget">
            <span className="rating-label">
              {lang === "sv" ? "Ditt omdöme:" : "Your rating:"}
            </span>
            <div className="star-group">
              {[1, 2, 3, 4, 5].map((star) => {
                const filled = userRating >= star;
                return (
                  <button
                    key={star}
                    type="button"
                    className="star-btn"
                    onClick={() => onRatePlace(place.id, star)}
                    title={`Rate ${star}/5`}
                  >
                    <Star
                      size={24}
                      weight={filled ? "fill" : "regular"}
                      style={{ color: filled ? "#F59E0B" : "var(--color-mist)" }}
                    />
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Sticky Primary CTA Action */}
        <footer className="place-detail-footer">
          <button
            type="button"
            className="place-detail-primary-cta"
            onClick={() => onViewOnMap(place)}
          >
            <span>{lang === "sv" ? "VISA PÅ KARTAN" : "VIEW ON MAP"}</span>
          </button>
        </footer>
      </article>

      <PlaceFeedbackModal
        isOpen={Boolean(feedbackType)}
        targetId={place.id}
        targetName={place.name}
        initialType={feedbackType ?? "up"}
        lang={lang}
        onClose={() => setFeedbackType(null)}
      />

      <PlaceFeedbackModal
        isOpen={isNominateModalOpen}
        targetId={place.id}
        targetName={place.name}
        mode="nominate_gem"
        lang={lang}
        onClose={() => setIsNominateModalOpen(false)}
        onSubmitFeedback={() => setIsUserNominated(true)}
      />
    </div>
  );
}
