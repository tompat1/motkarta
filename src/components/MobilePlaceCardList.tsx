import React, { useEffect, useRef, useState } from "react";
import { LIST_SCROLL_BATCH_SIZE } from "../app/map-bounds";
import {
  MapPin,
  Star,
  BookmarkSimple,
  Heart,
  Sparkle,
  Compass,
  ThumbsUp,
  ThumbsDown,
  Clock,
  CurrencyCircleDollar,
  WifiHigh,
} from "@phosphor-icons/react";
import type { ScoredPlace } from "../../lib/scoring";
import type { Language } from "../app/shared";
import { DUMMY_PLACE_IMAGE_URL, fetchPlacePhotos } from "../../lib/lazy-media";
import { formatDistance, distanceFromPoint, hasCoordinates } from "../app/shared";
import { PlaceFeedbackModal } from "./PlaceFeedbackModal";
import { openingHoursFact, priceFact, wifiFact } from "../app/place-card-facts";

import { firstAvailablePhoto } from "../../lib/photo-loading";

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
  const [photoMap, setPhotoMap] = useState<Record<number, string | null>>({});
  const listRef = useRef<HTMLDivElement>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const loadedPhotos = useRef(new Map<number, string | null>());
  const [feedbackTarget, setFeedbackTarget] = useState<{ id: number; name: string; type: "up" | "down" } | null>(null);
  const [visibleCount, setVisibleCount] = useState(LIST_SCROLL_BATCH_SIZE);

  useEffect(() => {
    setVisibleCount(LIST_SCROLL_BATCH_SIZE);
  }, [places]);

  const visiblePlaces = places.slice(0, visibleCount);
  const hasMorePlaces = visibleCount < places.length;

  useEffect(() => {
    if (!hasMorePlaces) {
      return;
    }

    const sentinel = loadMoreRef.current;
    if (!sentinel || typeof IntersectionObserver === "undefined") {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) {
          return;
        }
        setVisibleCount((current) => Math.min(current + LIST_SCROLL_BATCH_SIZE, places.length));
      },
      { rootMargin: "500px" },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMorePlaces, places.length, visibleCount]);

  useEffect(() => {
    const controller = new AbortController();
    const byId = new Map(visiblePlaces.map((place) => [String(place.id), place]));
    const load = async (element: Element) => {
      const place = byId.get(element.getAttribute("data-place-id") ?? "");
      if (!place || loadedPhotos.current.has(place.id)) return;
      const photos = await fetchPlacePhotos(place);
      const photo = await firstAvailablePhoto(photos, controller.signal);
      if (!controller.signal.aborted) {
        loadedPhotos.current.set(place.id, photo?.url ?? null);
        setPhotoMap((previous) => ({ ...previous, [place.id]: photo?.url ?? null }));
      }
    };
    const cards = listRef.current?.querySelectorAll("[data-place-id]") ?? [];
    if (typeof IntersectionObserver === "undefined") {
      cards.forEach((card) => { void load(card); });
      return () => controller.abort();
    }
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        observer.unobserve(entry.target);
        void load(entry.target);
      });
    }, { rootMargin: "300px" });
    cards.forEach((card) => observer.observe(card));
    return () => {
      observer.disconnect();
      controller.abort();
    };
  }, [visiblePlaces]);

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
    <div className="mobile-place-card-list" ref={listRef}>
      {visiblePlaces.map((place) => {
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
            data-place-id={place.id}
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
                <div className="mobile-photo-card-facts" aria-label={lang === "sv" ? "Platsfakta" : "Place facts"}>
                  {(() => {
                    const hours = openingHoursFact(place, lang);
                    const price = priceFact(place, lang);
                    const wifi = wifiFact(place, lang);
                    return (
                      <>
                        <span className={hours.isPlaceholder ? "is-placeholder" : ""} title={hours.title}>
                          <Clock size={13} weight="bold" aria-hidden="true" />
                          <span>{hours.label}</span>
                        </span>
                        <span className={price.isPlaceholder ? "is-placeholder" : ""} title={price.title}>
                          <CurrencyCircleDollar size={13} weight="bold" aria-hidden="true" />
                          <span>{price.label}</span>
                        </span>
                        <span className={wifi.isPlaceholder ? "is-placeholder" : ""} title={wifi.title}>
                          <WifiHigh size={13} weight="bold" aria-hidden="true" />
                          <span>{wifi.label}</span>
                        </span>
                      </>
                    );
                  })()}
                </div>
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

      {hasMorePlaces ? (
        <div
          ref={loadMoreRef}
          className="mobile-list-load-sentinel"
          aria-hidden="true"
        />
      ) : null}

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
