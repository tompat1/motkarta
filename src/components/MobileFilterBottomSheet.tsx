import { useEffect, useRef } from "react";
import { Check, X, ArrowCounterClockwise } from "@phosphor-icons/react";
import { allCuisines, cuisineLabel, translations, type Language } from "../app/shared";

interface MobileFilterBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  cuisine: string;
  cuisineOptions: string[];
  onSelectCuisine: (cuisine: string) => void;
  hasActiveFilters: boolean;
  onResetFilters: () => void;
  matchingCount: number;
  lang: Language;
}

export function MobileFilterBottomSheet({
  isOpen, onClose, cuisine, cuisineOptions, onSelectCuisine,
  hasActiveFilters, onResetFilters, matchingCount, lang,
}: MobileFilterBottomSheetProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!isOpen) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeRef.current();
      if (event.key !== "Tab") return;
      const buttons = dialogRef.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)");
      if (!buttons?.length) return;
      const first = buttons[0];
      const last = buttons[buttons.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      previousFocus?.focus();
    };
  }, [isOpen]);

  if (!isOpen) return null;
  const t = translations[lang];

  return (
    <div className="filter-sheet-overlay" onClick={onClose}>
      <div className="filter-sheet-content" ref={dialogRef} tabIndex={-1}
        role="dialog" aria-modal="true" aria-labelledby="filter-sheet-title"
        onClick={(event) => event.stopPropagation()}>
        <div className="filter-sheet-handle-container" aria-hidden="true">
          <div className="filter-sheet-handle" />
        </div>
        <div className="filter-sheet-header">
          <h2 id="filter-sheet-title">{t.cuisineFilterLabel}</h2>
          <button type="button" className="filter-sheet-close" onClick={onClose}
            aria-label={lang === "sv" ? "Stäng filter" : "Close filters"}>
            <X size={20} weight="bold" />
          </button>
        </div>
        <div className="filter-sheet-scrollable-body">
          <div className="filter-sheet-grid" role="group" aria-label={t.cuisineFilterLabel}>
            {[allCuisines, ...cuisineOptions].map((item) => (
              <button key={item} type="button"
                className={`filter-pill-button ${cuisine === item ? "is-selected" : ""}`}
                aria-pressed={cuisine === item} onClick={() => onSelectCuisine(item)}>
                {cuisine === item ? <Check size={14} weight="bold" className="filter-pill-check" /> : null}
                <span>{item === allCuisines ? t.allCuisines : cuisineLabel(item, lang)}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="filter-sheet-footer">
          <button type="button" className="filter-reset-link-btn" onClick={onResetFilters} disabled={!hasActiveFilters}>
            <ArrowCounterClockwise size={14} weight="bold" />
            <span>{lang === "sv" ? "Återställ alla filter" : "Reset all filters"}</span>
          </button>
          <button type="button" className="filter-apply-btn" onClick={onClose}>
            <span aria-live="polite">{lang === "sv" ? `Visa ${matchingCount} ställen` : `Show ${matchingCount} places`}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
