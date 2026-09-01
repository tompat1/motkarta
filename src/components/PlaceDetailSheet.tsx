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
} from "@phosphor-icons/react";
import type { ScoredPlace } from "../../lib/scoring";
import type { Language } from "../App";
import { fetchPlacePhotos, type PlacePhoto } from "../../lib/lazy-media";
import { formatDistance, distanceFromPoint } from "../App";

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
        </header>

        {/* Scrollable Editorial Content */}
        <div className="place-detail-body">
          {/* Main Title & Subtitle */}
          <div className="place-detail-identity">
            <h1 className="place-detail-title">{place.name}</h1>
            <p className="place-detail-subtitle">{subtitle}</p>
          </div>

          <hr className="place-detail-divider" />

          {/* Photo Gallery (if available) */}
          {photos.length > 0 ? (
            <div className="place-detail-photo-container">
              <img
                src={photos[activePhotoIndex]?.url}
                alt={photos[activePhotoIndex]?.caption || place.name}
                className="place-detail-hero-photo"
                loading="eager"
              />
              {photos.length > 1 ? (
                <div className="place-detail-photo-dots">
                  {photos.map((_, idx) => (
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
              {photos[activePhotoIndex]?.credit ? (
                <span className="place-detail-photo-credit">
                  📷 {photos[activePhotoIndex]?.credit}
                </span>
              ) : null}
            </div>
          ) : null}

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
    </div>
  );
}
