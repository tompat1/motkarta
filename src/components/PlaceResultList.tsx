import { useRef } from "react";
import { Star } from "@phosphor-icons/react";
import type { ScoredPlace } from "../../lib/scoring";
import type { Language, Mode } from "../app/shared";
import {
  DESKTOP_LIST_ROW_HEIGHT,
  LIST_WINDOW_OVERSCAN,
} from "../app/map-bounds";
import { useWindowedList } from "../app/use-windowed-list";
import {
  distanceFromPoint,
  formatDistance,
  hasCoordinates,
  kindFilterLabel,
  modeScore,
  rounded,
} from "../app/shared";

type PlaceResultListProps = {
  places: ScoredPlace[];
  activePlace: ScoredPlace | null;
  savedPlaceIds: number[];
  userLocation?: { latitude: number; longitude: number } | null;
  mode: Mode;
  lang: Language;
  hasSearchQuery: boolean;
  searchQuery: string;
  noResultsTitle: string;
  noResultsText: string;
  totalScoreLabel: string;
  onSelectPlace: (place: ScoredPlace, index: number) => void;
  onToggleSave: (id: number) => void;
};

export function PlaceResultList({
  places,
  activePlace,
  savedPlaceIds,
  userLocation,
  mode,
  lang,
  hasSearchQuery,
  searchQuery,
  noResultsTitle,
  noResultsText,
  totalScoreLabel,
  onSelectPlace,
  onToggleSave,
}: PlaceResultListProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const { visibleItems, startIndex, totalHeight, offsetY } = useWindowedList({
    items: places,
    scrollRef,
    estimateSize: DESKTOP_LIST_ROW_HEIGHT,
    overscan: LIST_WINDOW_OVERSCAN,
  });

  if (hasSearchQuery && places.length === 0) {
    return (
      <div className="results-list-scroll" ref={scrollRef}>
        <div className="list">
          <div className="search-empty-state" aria-live="polite">
            <strong>{noResultsTitle}</strong>
            <span>
              {noResultsText} "{searchQuery.trim()}".
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="results-list-scroll" ref={scrollRef}>
      <div className="list list-virtual" style={{ height: totalHeight }}>
        <div className="list-virtual-window" style={{ transform: `translateY(${offsetY}px)` }}>
          {visibleItems.map((place, visibleIndex) => {
            const index = startIndex + visibleIndex;
            const isActive = activePlace?.id === place.id;

            return (
              <div
                key={place.id}
                className={isActive ? "place active-place" : "place"}
                style={{ minHeight: DESKTOP_LIST_ROW_HEIGHT }}
                onClick={() => onSelectPlace(place, index)}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelectPlace(place, index);
                  }
                }}
              >
                <span className="rank">{String(index + 1).padStart(2, "0")}</span>
                <span className="place-main">
                  <small>
                    {kindFilterLabel(place.kind, lang)} · {place.area}
                    {userLocation && hasCoordinates(place)
                      ? ` · 📍 ${formatDistance(distanceFromPoint(place, userLocation), lang)}`
                      : ""}
                  </small>
                  <strong>{place.name}</strong>
                  <span>{place.tags.slice(0, 2).join(" · ")}</span>
                </span>
                <span className="total">
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onToggleSave(place.id);
                      }}
                      style={{
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        padding: "2px",
                        display: "inline-flex",
                      }}
                      title={
                        savedPlaceIds.includes(place.id)
                          ? lang === "sv"
                            ? "Ta bort från sparade"
                            : "Remove from saved"
                          : lang === "sv"
                            ? "Spara ställe"
                            : "Save place"
                      }
                    >
                      <Star
                        size={15}
                        weight={savedPlaceIds.includes(place.id) ? "fill" : "regular"}
                        style={{
                          color: savedPlaceIds.includes(place.id) ? "#F59E0B" : "var(--color-mist)",
                        }}
                      />
                    </button>
                    <b>{rounded(modeScore(place, mode))}</b>
                  </div>
                  <small>{totalScoreLabel}</small>
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
