import React from "react";
import {
  Heart,
  Clock,
  Check,
  ArrowCounterClockwise,
} from "@phosphor-icons/react";
import type { EstablishmentFilter, Language } from "../app/shared";
import { FILTER_SECTIONS } from "../../lib/mobile-filters";

export { FILTER_SECTIONS };

export interface MobileFilterState {
  savedOnly: boolean;
  openOnly: boolean;
  kind: EstablishmentFilter;
  cuisine: string;
  selectedTags: string[];
  priceLevel?: number;
}

interface MobileFilterBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  filters: MobileFilterState;
  onUpdateFilters: (filters: MobileFilterState) => void;
  onResetFilters: () => void;
  matchingCount: number;
  lang: Language;
}


export function MobileFilterBottomSheet({
  isOpen,
  onClose,
  filters,
  onUpdateFilters,
  onResetFilters,
  matchingCount,
  lang,
}: MobileFilterBottomSheetProps) {
  if (!isOpen) return null;

  const toggleTag = (tag: string) => {
    const exists = filters.selectedTags.includes(tag);
    const updated = exists
      ? filters.selectedTags.filter((t) => t !== tag)
      : [...filters.selectedTags, tag];
    onUpdateFilters({ ...filters, selectedTags: updated });
  };

  const isTagActive = (tag: string) => filters.selectedTags.includes(tag);

  const hasActiveFilters =
    filters.savedOnly ||
    filters.openOnly ||
    filters.kind !== "All places" ||
    (filters.cuisine !== "Alla kök" && filters.cuisine !== "All cuisines") ||
    filters.selectedTags.length > 0;

  return (
    <div className="filter-sheet-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label={lang === "sv" ? "Filter" : "Filters"}>
      <div
        className="filter-sheet-content"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Pull Handle Bar */}
        <div className="filter-sheet-handle-container">
          <div className="filter-sheet-handle" />
        </div>

        {/* Top Quick Actions Row */}
        <div className="filter-sheet-quick-row">
          <button
            type="button"
            className={`filter-pill-large ${filters.savedOnly ? "active-blue" : ""}`}
            onClick={() => onUpdateFilters({ ...filters, savedOnly: !filters.savedOnly })}
          >
            <Heart
              size={18}
              weight={filters.savedOnly ? "fill" : "bold"}
              style={{ color: filters.savedOnly ? "#ffffff" : "var(--color-ink)" }}
            />
            <span>{lang === "sv" ? "Sparade" : "Favourites"}</span>
          </button>

          <button
            type="button"
            className={`filter-pill-large ${filters.openOnly ? "active-blue" : ""}`}
            onClick={() => onUpdateFilters({ ...filters, openOnly: !filters.openOnly })}
          >
            <Clock
              size={18}
              weight={filters.openOnly ? "fill" : "bold"}
              style={{ color: filters.openOnly ? "#ffffff" : "var(--color-ink)" }}
            />
            <span>{lang === "sv" ? "Öppet nu" : "Open Cafes"}</span>
          </button>
        </div>

        {/* Filter Sections */}
        <div className="filter-sheet-scrollable-body">
          {FILTER_SECTIONS.map((section) => (
            <div key={section.id} className="filter-sheet-section">
              <h3 className="filter-sheet-section-title">
                {lang === "sv" ? section.titleSv : section.titleEn}
              </h3>
              <div className="filter-sheet-grid">
                {section.items.map((item) => {
                  const active = isTagActive(item.tag);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={`filter-pill-button ${active ? "is-selected" : ""}`}
                      onClick={() => toggleTag(item.tag)}
                    >
                      {active ? (
                        <Check size={14} weight="bold" className="filter-pill-check" />
                      ) : null}
                      <span>{lang === "sv" ? item.labelSv : item.labelEn}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Bottom Actions */}
        <div className="filter-sheet-footer">
          <button
            type="button"
            className="filter-reset-link-btn"
            onClick={onResetFilters}
            disabled={!hasActiveFilters}
          >
            <ArrowCounterClockwise size={14} weight="bold" />
            <span>{lang === "sv" ? "Återställ alla filter" : "Reset All Filters"}</span>
          </button>

          <button
            type="button"
            className="filter-apply-btn"
            onClick={onClose}
          >
            <span>
              {lang === "sv" ? `Visa ${matchingCount} ställen` : `Show ${matchingCount} places`}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
