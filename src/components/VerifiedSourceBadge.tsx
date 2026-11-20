import React, { useEffect, useRef, useState } from "react";
import {
  Star,
  ForkKnife,
  Medal,
  Newspaper,
  Coffee,
  PawPrint,
  Sparkle,
  Compass,
  MapPin,
  ArrowSquareOut,
  X,
} from "@phosphor-icons/react";
import type { VerifiedSourceInfo } from "../app/verified-sources";
import type { Language } from "../app/shared";

function BurgerIcon({ size = 13 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      <path d="M20.5 10.5C20.5 6.36 16.69 3 12 3S3.5 6.36 3.5 10.5c0 .28.02.55.05.82C3.19 11.66 3 12.31 3 13c0 1.66 1.34 3 3 3h12c1.66 0 3-1.34 3-3 0-.69-.19-1.34-.55-1.68.03-.27.05-.54.05-.82zM4.5 18c0 1.66 1.34 3 3 3h9c1.66 0 3-1.34 3-3v-.5h-15v.5z" />
    </svg>
  );
}

export function renderSourceIcon(type: VerifiedSourceInfo["iconType"], size = 13) {
  switch (type) {
    case "burger":
      return <BurgerIcon size={size} />;
    case "star":
      return <Star size={size} weight="fill" />;
    case "fork-knife":
      return <ForkKnife size={size} weight="bold" />;
    case "award":
      return <Medal size={size} weight="fill" />;
    case "newspaper":
      return <Newspaper size={size} weight="bold" />;
    case "coffee":
      return <Coffee size={size} weight="fill" />;
    case "dog":
      return <PawPrint size={size} weight="fill" />;
    case "compass":
      return <Compass size={size} weight="bold" />;
    case "map-pin":
      return <MapPin size={size} weight="fill" />;
    case "sparkle":
    default:
      return <Sparkle size={size} weight="fill" />;
  }
}

interface VerifiedSourceBadgeProps {
  source: VerifiedSourceInfo;
  lang?: Language;
  variant?: "pill" | "card" | "detail";
  onClick?: (source: VerifiedSourceInfo, event: React.MouseEvent<HTMLButtonElement>) => void;
  isSelected?: boolean;
}

export function VerifiedSourceBadge({
  source,
  lang = "sv",
  variant = "pill",
  onClick,
  isSelected = false,
}: VerifiedSourceBadgeProps) {
  const description = lang === "sv" ? source.descriptionSv : source.descriptionEn;

  if (variant === "detail") {
    return (
      <div
        className={`verified-source-detail-card verified-source-${source.id}`}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "10px",
          background: source.bgColor,
          border: `1px solid ${source.borderColor}`,
          color: source.color,
          padding: "8px 12px",
          borderRadius: "10px",
          marginTop: "6px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0 }}>
          <span style={{ display: "flex", alignItems: "center" }}>
            {renderSourceIcon(source.iconType, 16)}
          </span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: "13px", lineHeight: "1.2" }}>
              {source.label}
            </div>
            <div
              style={{
                fontSize: "11px",
                opacity: 0.9,
                marginTop: "2px",
                lineHeight: "1.3",
                color: "#1e293b",
              }}
            >
              {description}
            </div>
          </div>
        </div>

        {source.url ? (
          <a
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              fontSize: "11px",
              fontWeight: 600,
              color: source.color,
              textDecoration: "underline",
              flexShrink: 0,
            }}
            title={lang === "sv" ? `Läs recension hos ${source.name}` : `Read review on ${source.name}`}
          >
            <span>{lang === "sv" ? "Källa" : "Source"}</span>
            <ArrowSquareOut size={12} weight="bold" />
          </a>
        ) : null}
      </div>
    );
  }

  // Pill badge for list cards and slide-up preview
  const pillStyle: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: "4px",
    background: isSelected ? source.color : source.bgColor,
    color: isSelected ? "#ffffff" : source.color,
    border: `1px solid ${isSelected ? source.color : source.borderColor}`,
    padding: "3px 8px",
    borderRadius: "999px",
    fontSize: "11px",
    fontWeight: 700,
    lineHeight: "1",
    letterSpacing: "0.01em",
    whiteSpace: "nowrap",
    boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
    cursor: onClick ? "pointer" : undefined,
  };

  if (onClick) {
    return (
      <button
        type="button"
        className={`verified-source-pill verified-source-${source.id} is-clickable${isSelected ? " is-selected" : ""}`}
        title={description}
        aria-expanded={isSelected}
        onClick={(event) => onClick(source, event)}
        style={pillStyle}
      >
        {renderSourceIcon(source.iconType, 12)}
        <span>{source.shortLabel}</span>
      </button>
    );
  }

  return (
    <span
      className={`verified-source-pill verified-source-${source.id}`}
      title={description}
      style={pillStyle}
    >
      {renderSourceIcon(source.iconType, 12)}
      <span>{source.shortLabel}</span>
    </span>
  );
}

interface VerifiedSourceBadgeListProps {
  sources: VerifiedSourceInfo[];
  lang?: Language;
  maxVisible?: number;
  variant?: "pill" | "card" | "detail";
  interactive?: boolean;
  onFilterBySource?: (source: VerifiedSourceInfo) => void;
  sourceCounts?: Record<string, number>;
}

export function VerifiedSourceBadgeList({
  sources,
  lang = "sv",
  maxVisible = 2,
  variant = "pill",
  interactive = true,
  onFilterBySource,
  sourceCounts,
}: VerifiedSourceBadgeListProps) {
  const [expanded, setExpanded] = useState(false);
  const [activePopoverId, setActivePopoverId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!activePopoverId) return;
    const handleOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setActivePopoverId(null);
      }
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setActivePopoverId(null);
    };
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("keydown", handleKey);
    };
  }, [activePopoverId]);

  if (!sources || sources.length === 0) return null;

  if (variant === "detail") {
    return (
      <div className="verified-source-detail-group" style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        {sources.map((s) => (
          <VerifiedSourceBadge key={s.id} source={s} lang={lang} variant="detail" />
        ))}
      </div>
    );
  }

  const hasMore = sources.length > maxVisible;
  const visibleSources = expanded ? sources : sources.slice(0, maxVisible);
  const remainingCount = sources.length - maxVisible;
  const activePopoverSource = activePopoverId
    ? sources.find((s) => s.id === activePopoverId) ?? null
    : null;
  const enablePopover = interactive && Boolean(onFilterBySource);

  return (
    <div
      ref={containerRef}
      className={`verified-source-badges-row${expanded ? " is-expanded" : ""}`}
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: "5px",
        position: "relative",
      }}
    >
      {visibleSources.map((s) => (
        <VerifiedSourceBadge
          key={s.id}
          source={s}
          lang={lang}
          variant="pill"
          isSelected={activePopoverId === s.id}
          onClick={
            enablePopover
              ? (clicked, event) => {
                  event.stopPropagation();
                  setActivePopoverId((prev) => (prev === clicked.id ? null : clicked.id));
                }
              : undefined
          }
        />
      ))}
      {hasMore ? (
        interactive ? (
          <button
            type="button"
            className="verified-source-more-badge"
            aria-expanded={expanded}
            onClick={(event) => {
              event.stopPropagation();
              setExpanded((prev) => !prev);
            }}
            style={{
              display: "inline-flex",
              alignItems: "center",
              background: expanded ? "#111111" : "rgba(255, 255, 255, 0.92)",
              color: expanded ? "#faf9f5" : "#1e293b",
              border: expanded ? "1px solid #111111" : "1px solid rgba(0, 0, 0, 0.16)",
              padding: "2px 7px",
              borderRadius: "999px",
              fontSize: "10px",
              fontWeight: 700,
              lineHeight: "1.2",
              cursor: "pointer",
              flexShrink: 0,
            }}
            title={
              expanded
                ? lang === "sv"
                  ? "Visa färre källor"
                  : "Show fewer sources"
                : lang === "sv"
                  ? `Visa alla ${sources.length} källor (+${remainingCount} till)`
                  : `Show all ${sources.length} sources (+${remainingCount} more)`
            }
          >
            {expanded ? (lang === "sv" ? "Visa färre" : "Less") : `+${remainingCount}`}
          </button>
        ) : (
          <span
            className="verified-source-more-badge"
            style={{
              display: "inline-flex",
              alignItems: "center",
              background: "rgba(255, 255, 255, 0.92)",
              color: "#1e293b",
              border: "1px solid rgba(0, 0, 0, 0.16)",
              padding: "2px 7px",
              borderRadius: "999px",
              fontSize: "10px",
              fontWeight: 700,
              lineHeight: "1.2",
              flexShrink: 0,
            }}
          >
            +{remainingCount}
          </span>
        )
      ) : null}

      {activePopoverSource && onFilterBySource ? (
        <div
          className="verified-source-popover"
          role="dialog"
          aria-label={activePopoverSource.name}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="verified-source-popover-head">
            <span className="verified-source-popover-title" style={{ color: activePopoverSource.color }}>
              {renderSourceIcon(activePopoverSource.iconType, 14)}
              <strong>{activePopoverSource.name}</strong>
            </span>
            <button
              type="button"
              className="verified-source-popover-close"
              onClick={() => setActivePopoverId(null)}
              aria-label={lang === "sv" ? "Stäng" : "Close"}
            >
              <X size={13} weight="bold" aria-hidden="true" />
            </button>
          </div>
          <p className="verified-source-popover-desc">
            {lang === "sv" ? activePopoverSource.descriptionSv : activePopoverSource.descriptionEn}
          </p>
          <div className="verified-source-popover-actions">
            <button
              type="button"
              className="verified-source-popover-filter-btn"
              onClick={() => {
                onFilterBySource(activePopoverSource);
                setActivePopoverId(null);
              }}
            >
              {(() => {
                const count = sourceCounts?.[activePopoverSource.id];
                if (typeof count === "number" && count > 0) {
                  return lang === "sv"
                    ? `Visa alla ${count} ställen på kartan`
                    : `Show all ${count} places on map`;
                }
                return lang === "sv"
                  ? `Filtrera kartan på ${activePopoverSource.shortLabel}`
                  : `Filter map by ${activePopoverSource.shortLabel}`;
              })()}
            </button>
            {activePopoverSource.url ? (
              <a
                href={activePopoverSource.url}
                target="_blank"
                rel="noopener noreferrer"
                className="verified-source-popover-link"
              >
                <span>{lang === "sv" ? "Källa" : "Source"}</span>
                <ArrowSquareOut size={12} weight="bold" aria-hidden="true" />
              </a>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
