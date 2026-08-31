import React, { useEffect, useState } from "react";
import {
  MapPin,
  Star,
  BookmarkSimple,
  Heart,
  Sparkle,
  Compass,
} from "@phosphor-icons/react";
import type { ScoredPlace } from "../../lib/scoring";
import type { Language } from "../App";
import { fetchPlacePhotos, type PlacePhoto } from "../../lib/lazy-media";
import { formatDistance, distanceFromPoint, hasCoordinates } from "../App";

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
        const photoUrl =
          photoMap[place.id] ||
          (place.kind === "Specialty coffee"
            ? "https://images.unsplash.com/photo-1554118811-1e0d58224f24?auto=format&fit=crop&w=1200&q=80"
            : place.cuisine === "pizza"
              ? "https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=1200&q=80"
              : place.kind === "Bakery"
                ? "https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=1200&q=80"
                : "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=1200&q=80");

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
              className="mobile-photo-card-bg"
              style={{ backgroundImage: `url(${photoUrl})` }}
            >
              <div className="mobile-photo-card-gradient" />

              {/* Bookmark Button */}
              <button
                type="button"
                className={`mobile-card-save-btn ${isSaved ? "is-saved" : ""}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleSave(place.id);
                }}
                aria-label={isSaved ? "Saved" : "Save"}
              >
                <BookmarkSimple
                  size={20}
                  weight={isSaved ? "fill" : "bold"}
                  style={{ color: isSaved ? "#2563EB" : "#ffffff" }}
                />
              </button>

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
    </div>
  );
}
