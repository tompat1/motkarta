import React, { useEffect, useState } from "react";
import {
  MapPin,
  Star,
  BookmarkSimple,
  Heart,
  Sparkle,
  Compass,
  ThumbsUp,
  ThumbsDown,
} from "@phosphor-icons/react";
import type { ScoredPlace } from "../../lib/scoring";
import type { Language } from "../app/shared";
import { fetchPlacePhotos, type PlacePhoto } from "../../lib/lazy-media";
import { formatDistance, distanceFromPoint, hasCoordinates } from "../app/shared";
import { PlaceFeedbackModal } from "./PlaceFeedbackModal";

const DUMMY_PLACE_IMAGE_URL = "/motkarta_drop_divided_black_red.svg";

interface MobilePlaceCardListProps {
  places: ScoredPlace[];
  activePlace: ScoredPlace | null;
  savedPlaceIds: number[];
  userLocation?: { latitude: number; longitude: number } | null;
  lang: Language;
  onSelectPlace: (place: ScoredPlace) => void;
  onToggleSave: (id: number) => void;
}

export function MobilePlaceCardList({
  places,
  activePlace,
  savedPlaceIds,
  userLocation,
  lang,
  onSelectPlace,
  onToggleSave,
}: MobilePlaceCardListProps) {
  const [photoMap, setPhotoMap] = useState<Record<number, string>>({});
  const [feedbackTarget, setFeedbackTarget] = useState<{ id: number; name: string; type: "up" | "down" } | null>(null);

  useEffect(() => {
    let isMounted = true;
    const placesToFetch = places.slice(0, 25);
    placesToFetch.forEach((p) => {
      if (!photoMap[p.id]) {
        void fetchPlacePhotos(p).then((photos) => {
          if (isMounted && photos.length > 0 && photos[0]?.url) {
            setPhotoMap((prev) => ({ ...prev, [p.id]: photos[0].url }));
          }
        });
      }
    });
    return () => {
      isMounted = false;
    };
  }, [places]);

  if (places.length === 0) {
    return (
      <div className="mobile-list-empty-state">
        <Sparkle size={32} weight="bold" style={{ color: "var(--color-water)" }} />
        <h3>{lang === "sv" ? "Inga ställen matchar dina filter" : "No places match your filters"}</h3>
        <p>{lang === "sv" ? "Prova att justera eller återställa dina valda filter." : "Try adjusting or clearing your chosen filters."}</p>
      </div>
    );
  }

  return (
    <div className="mobile-place-card-list">
      {places.map((place) => {
        const isSaved = savedPlaceIds.includes(place.id);
        const isActive = activePlace?.id === place.id;
        const photoUrl = photoMap[place.id] || null;

        const distanceMeters =
          userLocation && hasCoordinates(place)
            ? distanceFromPoint(place, userLocation)
            : null;

        const addressText = place.address
          ? `Stockholm, ${place.address}`
          : `Stockholm, ${place.area}`;

        return (
          <article
            key={place.id}
            className={`mobile-photo-card ${isActive ? "is-active-card" : ""}`}
            onClick={() => onSelectPlace(place)}
          >
            <div
              className={`mobile-photo-card-bg ${!photoUrl ? "mobile-photo-card-no-photo" : ""}`}
              style={photoUrl ? { backgroundImage: `url(${photoUrl})` } : undefined}
            >
              {!photoUrl ? (
                <img
                  src={DUMMY_PLACE_IMAGE_URL}
                  alt=""
                  className="mobile-photo-card-dummy-logo"
                  aria-hidden="true"
                />
              ) : null}
              <div className="mobile-photo-card-gradient" />

              {/* Action Buttons Top Right */}
              <div style={{ position: "absolute", top: "12px", right: "12px", display: "flex", alignItems: "center", gap: "8px", zIndex: 5 }}>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setFeedbackTarget({ id: place.id, name: place.name, type: "up" });
                  }}
                  style={{
                    background: "rgba(255, 255, 255, 0.9)",
                    border: "none",
                    borderRadius: "50%",
                    width: "36px",
                    height: "36px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    boxShadow: "0 2px 6px rgba(0,0,0,0.15)",
                  }}
                  title={lang === "sv" ? "Hjälpsam / Bra ställe" : "Helpful / Good place"}
                >
                  <ThumbsUp size={18} weight="bold" style={{ color: "#166534" }} />
                </button>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setFeedbackTarget({ id: place.id, name: place.name, type: "down" });
                  }}
                  style={{
                    background: "rgba(255, 255, 255, 0.9)",
                    border: "none",
                    borderRadius: "50%",
                    width: "36px",
                    height: "36px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    boxShadow: "0 2px 6px rgba(0,0,0,0.15)",
                  }}
                  title={lang === "sv" ? "Inte bra / Felaktig info" : "Not good / Wrong info"}
                >
                  <ThumbsDown size={18} weight="bold" style={{ color: "#991b1b" }} />
                </button>

                <button
                  type="button"
                  className={`mobile-card-save-btn ${isSaved ? "is-saved" : ""}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleSave(place.id);
                  }}
                  aria-label={isSaved ? "Saved" : "Save"}
                  style={{ position: "relative", top: 0, right: 0 }}
                >
                  <BookmarkSimple
                    size={20}
                    weight={isSaved ? "fill" : "bold"}
                    style={{ color: isSaved ? "#2563EB" : "#ffffff" }}
                  />
                </button>
              </div>

              {/* Card Meta & Title */}
              <div className="mobile-photo-card-content">
                <h2 className="mobile-photo-card-title">{place.name}</h2>
                <div className="mobile-photo-card-meta">
                  <MapPin size={14} weight="fill" className="meta-pin-icon" />
                  <span>
                    {distanceMeters !== null
                      ? `${formatDistance(distanceMeters, lang)} • ${addressText}`
                      : addressText}
                  </span>
                </div>
              </div>
            </div>
          </article>
        );
      })}

      <PlaceFeedbackModal
        isOpen={Boolean(feedbackTarget)}
        targetId={feedbackTarget?.id ?? 0}
        targetName={feedbackTarget?.name ?? ""}
        initialType={feedbackTarget?.type ?? "up"}
        lang={lang}
        onClose={() => setFeedbackTarget(null)}
      />
    </div>
  );
}
