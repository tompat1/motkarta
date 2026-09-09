import { useEffect, useRef } from "react";
import { Check, X, Shuffle, Info, ShieldCheck } from "@phosphor-icons/react";
import {
  modeLabel,
  sortModeLabel,
  translations,
  visibleModes,
  sortModes,
  type Mode,
  type SortMode,
  type Language,
} from "../app/shared";

export type RankSheetType = "visa" | "sortera" | "formula" | null;

interface MobileRankControlSheetProps {
  sheetType: RankSheetType;
  onClose: () => void;
  mode: Mode;
  onSelectMode: (mode: Mode) => void;
  sortMode: SortMode;
  onSelectSortMode: (sortMode: SortMode) => void;
  onShuffle: () => void;
  lang: Language;
}

export function MobileRankControlSheet({
  sheetType,
  onClose,
  mode,
  onSelectMode,
  sortMode,
  onSelectSortMode,
  onShuffle,
  lang,
}: MobileRankControlSheetProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!sheetType) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      previousFocus?.focus();
    };
  }, [sheetType, onClose]);

  if (!sheetType) return null;
  const t = translations[lang];

  return (
    <div className="filter-sheet-overlay" onClick={onClose}>
      <div
        className="filter-sheet-content mobile-rank-sheet-content"
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="rank-sheet-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="filter-sheet-handle-container" aria-hidden="true">
          <div className="filter-sheet-handle" />
        </div>

        <div className="filter-sheet-header">
          <div>
            <h2 id="rank-sheet-title" className="mobile-rank-sheet-title">
              {sheetType === "visa"
                ? lang === "sv"
                  ? "VISA URVAL"
                  : "SELECT SCOPE"
                : sheetType === "sortera"
                  ? lang === "sv"
                    ? "SORTERA ORDNING"
                    : "SORT ORDER"
                  : lang === "sv"
                    ? "HUR RANKAS STÄLLEN?"
                    : "HOW RANKING WORKS"}
            </h2>
            <small className="mobile-rank-sheet-sub">
              {sheetType === "visa"
                ? lang === "sv"
                  ? "Ändrar vilka ställen som visas"
                  : "Changes which places are included"
                : sheetType === "sortera"
                  ? lang === "sv"
                    ? "Samma urval, ny ordning"
                    : "Same selection, new ordering"
                  : lang === "sv"
                    ? "Oberoende & öppen beräkning"
                    : "Independent & open calculation"}
            </small>
          </div>
          <button
            type="button"
            className="filter-sheet-close"
            onClick={onClose}
            aria-label={lang === "sv" ? "Stäng panel" : "Close panel"}
          >
            <X size={20} weight="bold" />
          </button>
        </div>

        <div className="filter-sheet-scrollable-body">
          {sheetType === "visa" && (
            <div className="mobile-rank-options-list" role="radiogroup" aria-label="Visa urval">
              {visibleModes.map((item) => {
                const isSelected = mode === item;
                return (
                  <button
                    key={item}
                    type="button"
                    className={`mobile-rank-option-item ${isSelected ? "is-selected" : ""}`}
                    role="radio"
                    aria-checked={isSelected}
                    onClick={() => {
                      onSelectMode(item);
                      onClose();
                    }}
                  >
                    <div className="mobile-rank-option-text">
                      <span className="mobile-rank-option-label">{modeLabel(item, lang)}</span>
                    </div>
                    {isSelected ? <Check size={18} weight="bold" className="mobile-rank-check" /> : null}
                  </button>
                );
              })}
            </div>
          )}

          {sheetType === "sortera" && (
            <div className="mobile-rank-options-list" role="radiogroup" aria-label="Sortera ordning">
              {sortModes.map((item) => {
                const isSelected = sortMode === item;
                return (
                  <button
                    key={item}
                    type="button"
                    className={`mobile-rank-option-item ${isSelected ? "is-selected" : ""}`}
                    role="radio"
                    aria-checked={isSelected}
                    onClick={() => {
                      onSelectSortMode(item);
                      onClose();
                    }}
                  >
                    <div className="mobile-rank-option-text">
                      <span className="mobile-rank-option-label">{sortModeLabel(item, lang)}</span>
                    </div>
                    {isSelected ? <Check size={18} weight="bold" className="mobile-rank-check" /> : null}
                  </button>
                );
              })}

              {sortMode === "Surprise me" && (
                <div style={{ marginTop: "12px", paddingTop: "12px", borderTop: "1px solid var(--color-mist)" }}>
                  <button
                    type="button"
                    onClick={() => {
                      onShuffle();
                      onClose();
                    }}
                    className="mobile-shuffle-btn"
                  >
                    <Shuffle size={16} weight="bold" />
                    <span>{t.shuffle}</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {sheetType === "formula" && (
            <div className="mobile-formula-container">
              <div className="mobile-formula-card">
                <div className="mobile-formula-header">
                  <Info size={16} weight="bold" style={{ color: "var(--color-water)" }} />
                  <span>{lang === "sv" ? "FORMEL & VIKTNING" : "FORMULA & WEIGHTS"}</span>
                </div>
                <p className="mobile-formula-text">
                  {mode === "Hidden gems"
                    ? t.formulaHiddenGems
                    : mode === "Popular now"
                      ? t.formulaPopularNow
                      : mode === "Quality first"
                        ? t.formulaQualityFirst
                        : mode === "Expert selected"
                          ? t.formulaExpertSelected
                          : mode === "Most verified"
                            ? t.formulaMostVerified
                            : t.formulaDefault}
                </p>
              </div>

              <div className="mobile-principles-card">
                <div className="mobile-formula-header">
                  <ShieldCheck size={16} weight="bold" style={{ color: "var(--color-water)" }} />
                  <span>{lang === "sv" ? "OBEROENDE PRINCIPER" : "INDEPENDENT PRINCIPLES"}</span>
                </div>
                <ul className="mobile-principles-list">
                  <li>
                    <Check size={14} weight="bold" style={{ color: "var(--color-water)" }} />
                    <span>{t.principle1}</span>
                  </li>
                  <li>
                    <Check size={14} weight="bold" style={{ color: "var(--color-water)" }} />
                    <span>{t.principle2}</span>
                  </li>
                  <li>
                    <Check size={14} weight="bold" style={{ color: "var(--color-water)" }} />
                    <span>{t.principle3}</span>
                  </li>
                </ul>
              </div>
            </div>
          )}
        </div>

        <div className="filter-sheet-footer">
          <button type="button" className="filter-apply-btn" onClick={onClose}>
            <span>{lang === "sv" ? "Klar" : "Done"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
