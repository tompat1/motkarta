import React, { useCallback, useEffect, useRef, useState } from "react";
import type { PlaceInput } from "../../lib/scoring";
import {
  fetchPlacePhotos,
  fetchPlaceReviews,
  type PlacePhoto,
  type PlaceReview,
} from "../../lib/lazy-media";
import type { Language } from "../app/shared";
import { CaretLeft, CaretRight, ChatTeardropText, CircleNotch, Image } from "@phosphor-icons/react";

function ImageLightboxModal({
  photos,
  initialIndex = 0,
  onClose,
}: {
  photos: PlacePhoto[] | null;
  initialIndex?: number;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(initialIndex);

  useEffect(() => {
    setIndex(initialIndex);
  }, [initialIndex]);

  const total = photos?.length ?? 0;
  const currentPhoto = photos && total > 0 ? photos[index] : null;

  const handlePrev = useCallback(() => {
    if (total <= 1) return;
    setIndex((prev) => (prev - 1 + total) % total);
  }, [total]);

  const handleNext = useCallback(() => {
    if (total <= 1) return;
    setIndex((prev) => (prev + 1) % total);
  }, [total]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowLeft") {
        handlePrev();
      } else if (e.key === "ArrowRight") {
        handleNext();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleNext, handlePrev, onClose]);

  // Touch swipe handling for mobile & tablet
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStartRef.current || e.changedTouches.length === 0) return;
    const dx = e.changedTouches[0].clientX - touchStartRef.current.x;
    const dy = e.changedTouches[0].clientY - touchStartRef.current.y;
    touchStartRef.current = null;

    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {
      if (dx < 0) {
        handleNext();
      } else {
        handlePrev();
      }
    } else if (dy > 80 && Math.abs(dy) > Math.abs(dx)) {
      onClose();
    }
  };

  if (!currentPhoto) return null;

  return (
    <div className="lightbox-overlay" onClick={onClose}>
      <button type="button" className="lightbox-close-btn" onClick={onClose} aria-label="Close lightbox">
        ✕
      </button>

      <div
        className="lightbox-content"
        onClick={(e) => e.stopPropagation()}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {total > 1 ? (
          <>
            <button
              type="button"
              className="lightbox-nav-btn lightbox-prev-btn"
              onClick={handlePrev}
              aria-label="Previous photo"
            >
              <CaretLeft size={22} weight="bold" />
            </button>
            <button
              type="button"
              className="lightbox-nav-btn lightbox-next-btn"
              onClick={handleNext}
              aria-label="Next photo"
            >
              <CaretRight size={22} weight="bold" />
            </button>
          </>
        ) : null}

        <img src={currentPhoto.url} alt={currentPhoto.caption} className="lightbox-img" />

        <div className="lightbox-caption-bar">
          <div className="lightbox-caption-text">
            <b>{currentPhoto.caption}</b>
            {total > 1 ? <span className="lightbox-counter">({index + 1} / {total})</span> : null}
          </div>
          {currentPhoto.credit ? <small className="lightbox-credit">{currentPhoto.credit}</small> : null}
        </div>
      </div>
    </div>
  );
}

export function LazyPlaceMediaDrawer({ place, lang = "sv" }: { place: PlaceInput; lang?: Language }) {
  const [activeTab, setActiveTab] = useState<"photos" | "reviews">("photos");
  const [photos, setPhotos] = useState<PlacePhoto[] | null>(null);
  const [reviews, setReviews] = useState<PlaceReview[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  useEffect(() => {
    let isCurrent = true;
    setLoading(true);
    setPhotos(null);
    setReviews(null);

    async function loadData() {
      const [fetchedPhotos, fetchedReviews] = await Promise.all([
        fetchPlacePhotos(place),
        fetchPlaceReviews(place),
      ]);
      if (isCurrent) {
        setPhotos(fetchedPhotos);
        setReviews(fetchedReviews);
        setLoading(false);
      }
    }

    void loadData();
    return () => {
      isCurrent = false;
    };
  }, [place]);

  return (
    <div className="lazy-media-drawer">
      {lightboxIndex !== null ? (
        <ImageLightboxModal
          photos={photos}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      ) : null}
      <div className="lazy-media-tabs">
        <button
          type="button"
          className={`lazy-tab-btn ${activeTab === "photos" ? "active" : ""}`}
          onClick={() => setActiveTab("photos")}
        >
          <Image size={14} weight="bold" />
          {lang === "sv" ? "Bilder" : "Photos"} ({photos?.length ?? "..."})
        </button>
        <button
          type="button"
          className={`lazy-tab-btn ${activeTab === "reviews" ? "active" : ""}`}
          onClick={() => setActiveTab("reviews")}
        >
          <ChatTeardropText size={14} weight="bold" />
          {lang === "sv" ? "Recensioner" : "Reviews"} ({reviews?.length ?? "..."})
        </button>
      </div>

      {loading ? (
        <div className="media-loading-skeleton">
          <CircleNotch size={16} className="animate-spin" />
          <span>{lang === "sv" ? "Laddar media för stället..." : "Loading media for place..."}</span>
        </div>
      ) : activeTab === "photos" ? (
        <div className="photo-grid">
          {photos?.map((img, idx) => (
            <div
              key={img.id}
              className="photo-card"
              title={`${img.caption} (Klicka för fullskala)`}
              onClick={() => setLightboxIndex(idx)}
            >
              <img src={img.thumbnailUrl} alt={img.caption} loading="lazy" />
              <span className="photo-caption">{img.caption}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="review-list">
          {reviews?.map((rev) => (
            <article key={rev.id} className="review-card">
              <div className="review-card-head">
                <span className="review-author">{rev.author}</span>
                <span className="review-source-tag">{rev.source}</span>
              </div>
              <p className="review-content">"{rev.content}"</p>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "var(--color-stone)" }}>
                <span>★ {rev.rating.toFixed(1)} / 5.0</span>
                <span>{rev.date}</span>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
