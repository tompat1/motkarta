import React, { useCallback, useEffect, useRef, useState } from "react";
import type { PlaceInput } from "../../lib/scoring";
import {
  fetchPlacePhotos,
  fetchPlaceReviews,
  type PlacePhoto,
  type PlaceReview,
} from "../../lib/lazy-media";
import type { Language } from "../app/shared";
import {
  CaretLeft,
  CaretRight,
  ChatTeardropText,
  ChatText,
  CircleNotch,
  Image,
  ThumbsDown,
  ThumbsUp,
  Sparkle,
} from "@phosphor-icons/react";
import { PlaceFeedbackModal } from "./PlaceFeedbackModal";
import { getStoredPlaceFeedback, type FeedbackData } from "../../lib/place-feedback";

const DUMMY_PLACE_IMAGE_URL = "/motkarta_drop_divided_black_red.svg";

function ImageLightboxModal({
  photos,
  initialIndex = 0,
  lang = "sv",
  onClose,
}: {
  photos: PlacePhoto[] | null;
  initialIndex?: number;
  lang?: Language;
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
    <div
      className="lightbox-overlay place-lightbox-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={lang === "sv" ? "Platsbildsförstoring" : "Place photo lightbox"}
    >
      <div
        className="lightbox-content place-lightbox-content"
        onClick={(e) => e.stopPropagation()}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <button
          type="button"
          className="lightbox-close-btn place-lightbox-close-btn"
          onClick={onClose}
          aria-label={lang === "sv" ? "Stäng bildvisare" : "Close photo viewer"}
        >
          ✕
        </button>

        {total > 1 ? (
          <>
            <button
              type="button"
              className="lightbox-nav-btn lightbox-prev-btn"
              onClick={handlePrev}
              aria-label={lang === "sv" ? "Föregående bild" : "Previous photo"}
            >
              <CaretLeft size={20} weight="bold" />
            </button>
            <button
              type="button"
              className="lightbox-nav-btn lightbox-next-btn"
              onClick={handleNext}
              aria-label={lang === "sv" ? "Nästa bild" : "Next photo"}
            >
              <CaretRight size={20} weight="bold" />
            </button>
          </>
        ) : null}

        <img
          src={currentPhoto.url}
          alt={currentPhoto.caption}
          className="lightbox-img place-lightbox-img"
          onError={(event) => {
            event.currentTarget.src = DUMMY_PLACE_IMAGE_URL;
            event.currentTarget.classList.add("lightbox-img-dummy");
          }}
        />

        <div className="lightbox-caption-bar place-lightbox-caption-bar">
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

export function LazyPlaceMediaDrawer({
  place,
  lang = "sv",
  excludePhotoId,
  excludePhotoUrl,
  excludeFirstPhoto,
}: {
  place: PlaceInput;
  lang?: Language;
  excludePhotoId?: string | null;
  excludePhotoUrl?: string | null;
  excludeFirstPhoto?: boolean;
}) {
  const [activeTab, setActiveTab] = useState<"photos" | "reviews">("photos");
  const [photos, setPhotos] = useState<PlacePhoto[] | null>(null);
  const [reviews, setReviews] = useState<PlaceReview[] | null>(null);
  const [placeFeedback, setPlaceFeedback] = useState<FeedbackData[]>([]);
  const [isFeedbackModalOpen, setIsFeedbackModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const refreshFeedback = useCallback(() => {
    if (place) {
      setPlaceFeedback(getStoredPlaceFeedback(place.id, place.name));
    }
  }, [place]);

  useEffect(() => {
    refreshFeedback();

    const handleUpdate = () => {
      refreshFeedback();
    };

    window.addEventListener("motkarta-feedback-submitted", handleUpdate);
    return () => {
      window.removeEventListener("motkarta-feedback-submitted", handleUpdate);
    };
  }, [refreshFeedback]);

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

  const displayPhotos = photos
    ? photos.filter((img, idx) => {
        if (excludePhotoId && img.id === excludePhotoId) return false;
        if (excludePhotoUrl && (img.url === excludePhotoUrl || img.thumbnailUrl === excludePhotoUrl)) return false;
        if (excludeFirstPhoto && idx === 0) return false;
        return true;
      })
    : null;

  return (
    <div className="lazy-media-drawer">
      {lightboxIndex !== null && displayPhotos ? (
        <ImageLightboxModal
          photos={displayPhotos}
          initialIndex={lightboxIndex}
          lang={lang}
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
          {lang === "sv" ? "Bilder" : "Photos"} ({displayPhotos ? displayPhotos.length : "..."})
        </button>
        <button
          type="button"
          className={`lazy-tab-btn ${activeTab === "reviews" ? "active" : ""}`}
          onClick={() => setActiveTab("reviews")}
        >
          <ChatTeardropText size={14} weight="bold" />
          {lang === "sv" ? "Recensioner" : "Reviews"} (
          {reviews !== null
            ? reviews.length + placeFeedback.length
            : placeFeedback.length > 0
            ? placeFeedback.length
            : "..."}
          )
        </button>
      </div>

      {loading ? (
        <div className="media-loading-skeleton">
          <CircleNotch size={16} className="animate-spin" />
          <span>{lang === "sv" ? "Laddar media för stället..." : "Loading media for place..."}</span>
        </div>
      ) : activeTab === "photos" ? (
        <div className="photo-grid">
          {displayPhotos && displayPhotos.length > 0 ? (
            displayPhotos.map((img, idx) => (
              <div
                key={img.id}
                className="photo-card"
                title={`${img.caption} (Klicka för fullskala)`}
                onClick={() => setLightboxIndex(idx)}
              >
                <img
                  src={img.thumbnailUrl}
                  alt={img.caption}
                  loading="lazy"
                  onError={(event) => {
                    event.currentTarget.src = DUMMY_PLACE_IMAGE_URL;
                    event.currentTarget.classList.add("photo-card-img-dummy");
                  }}
                />
                <span className="photo-caption">{img.caption}</span>
              </div>
            ))
          ) : photos && photos.length > 0 ? (
            <div
              className="photo-card photo-card-dummy"
              aria-label={lang === "sv" ? "Huvudbild visas ovan" : "Main image shown above"}
            >
              <img src={DUMMY_PLACE_IMAGE_URL} alt="" loading="lazy" aria-hidden="true" />
              <span className="photo-caption">{lang === "sv" ? "HUVUDBILD OVAN" : "MAIN IMAGE ABOVE"}</span>
            </div>
          ) : (
            <div className="photo-card photo-card-dummy" aria-label={lang === "sv" ? "Ingen platsbild ännu" : "No place photo yet"}>
              <img src={DUMMY_PLACE_IMAGE_URL} alt="" loading="lazy" aria-hidden="true" />
              <span className="photo-caption">MOTKARTA</span>
            </div>
          )}
        </div>
      ) : (
        <div className="review-list place-reviews-container">
          {/* Action button to leave feedback on this specific place */}
          <div className="place-feedback-card-action">
            <button
              type="button"
              className="place-leave-feedback-btn"
              onClick={() => setIsFeedbackModalOpen(true)}
              title={
                lang === "sv"
                  ? "Skicka feedback och lär RAG-modellen om detta ställe"
                  : "Send feedback and teach the RAG model about this place"
              }
            >
              <ChatText size={15} weight="bold" />
              <span>
                {lang === "sv" ? "Tyck till om stället (Lär oss)" : "Give feedback on place (Teach us)"}
              </span>
            </button>
          </div>

          {/* Place-specific visitor feedback section */}
          {placeFeedback.length > 0 ? (
            <div className="place-feedback-section">
              <div className="place-feedback-section-header">
                <span className="place-feedback-section-title">
                  {lang === "sv" ? "Besökarfeedback & RAG-signaler" : "Visitor Feedback & RAG Signals"}
                </span>
                <span className="place-feedback-count-badge">{placeFeedback.length}</span>
              </div>

              {placeFeedback.map((fb, idx) => (
                <article key={`pfb-${idx}-${fb.timestampMs}`} className="review-card place-feedback-item-card">
                  <div className="review-card-head">
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <span className={`feedback-sentiment-pill ${fb.isPositive ? "is-positive" : "is-negative"}`}>
                        {fb.isPositive ? <ThumbsUp size={12} weight="fill" /> : <ThumbsDown size={12} weight="fill" />}
                        {fb.isPositive
                          ? (lang === "sv" ? "Rekommenderas" : "Recommended")
                          : (lang === "sv" ? "Synpunkt" : "Visitor note")}
                      </span>
                      <span className="review-author" style={{ fontSize: "12px" }}>
                        {lang === "sv" ? "Lokal besökare" : "Local visitor"}
                      </span>
                    </div>
                    <span
                      className="review-source-tag"
                      style={{
                        background: "rgba(16, 185, 129, 0.12)",
                        color: "#047857",
                        borderColor: "rgba(16, 185, 129, 0.25)",
                      }}
                    >
                      {lang === "sv" ? "Kopplad till stället" : "Connected feedback"}
                    </span>
                  </div>

                  {fb.selectedReasons && fb.selectedReasons.length > 0 ? (
                    <div className="feedback-reason-chips-row">
                      {fb.selectedReasons.map((reason) => (
                        <span key={reason} className="feedback-reason-pill">
                          ✓ {reason}
                        </span>
                      ))}
                    </div>
                  ) : null}

                  {fb.comment ? (
                    <p
                      className="review-content"
                      style={{ marginTop: "4px", fontStyle: "italic", color: "var(--color-ink)" }}
                    >
                      "{fb.comment}"
                    </p>
                  ) : null}

                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      fontSize: "11px",
                      color: "var(--color-stone)",
                      marginTop: "2px",
                    }}
                  >
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "4px",
                        color: "#2563eb",
                        fontWeight: 600,
                      }}
                    >
                      <Sparkle size={12} weight="fill" />
                      {lang === "sv" ? "Tränar rekommendationer" : "Trains recommendations"}
                    </span>
                    <span>
                      {new Date(fb.timestampMs).toLocaleDateString(lang === "sv" ? "sv-SE" : "en-US")}
                    </span>
                  </div>
                </article>
              ))}
            </div>
          ) : null}

          {/* Editorial & Community reviews */}
          {reviews?.map((rev) => (
            <article key={rev.id} className="review-card">
              <div className="review-card-head">
                <span className="review-author">{rev.author}</span>
                <span className="review-source-tag">{rev.source}</span>
              </div>
              <p className="review-content">"{rev.content}"</p>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: "11px",
                  color: "var(--color-stone)",
                }}
              >
                <span>★ {rev.rating.toFixed(1)} / 5.0</span>
                <span>{rev.date}</span>
              </div>
            </article>
          ))}

          {(!reviews || reviews.length === 0) && placeFeedback.length === 0 ? (
            <div
              style={{
                textAlign: "center",
                padding: "16px 8px",
                color: "var(--color-stone)",
                fontSize: "12px",
              }}
            >
              {lang === "sv"
                ? "Inga recensioner eller feedback ännu. Klicka ovan för att dela dina synpunkter och lära modellen!"
                : "No reviews or feedback yet. Click above to share your feedback and teach the model!"}
            </div>
          ) : null}
        </div>
      )}

      {/* PlaceFeedbackModal mounted right inside drawer for this specific place */}
      <PlaceFeedbackModal
        isOpen={isFeedbackModalOpen}
        targetId={place.id}
        targetName={place.name}
        initialType="up"
        lang={lang}
        onClose={() => setIsFeedbackModalOpen(false)}
        onSubmitFeedback={() => {
          refreshFeedback();
        }}
      />
    </div>
  );
}
