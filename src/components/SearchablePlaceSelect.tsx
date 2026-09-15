import React, { useState, useRef, useEffect, useMemo } from "react";
import type { PlaceInput } from "../../lib/scoring";
import type { Language } from "../app/shared";
import { CaretDown, Check, MagnifyingGlass, X } from "@phosphor-icons/react";

export interface SearchablePlaceSelectProps {
  places: PlaceInput[];
  selectedPlaceId: number;
  onSelectPlace: (placeId: number) => void;
  lang?: Language;
  label?: string;
  required?: boolean;
}

export function SearchablePlaceSelect({
  places,
  selectedPlaceId,
  onSelectPlace,
  lang = "sv",
  label,
  required = false,
}: SearchablePlaceSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const selectedPlace = useMemo(
    () => places.find((p) => p.id === selectedPlaceId) ?? places[0] ?? null,
    [places, selectedPlaceId],
  );

  const displaySelectedName = selectedPlace
    ? `${selectedPlace.name} (${selectedPlace.area || "Stockholm"})`
    : "";

  // Filter and prioritize places based on search query
  const filteredPlaces = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) {
      if (!selectedPlace) return places.slice(0, 60);
      const others = places.filter((p) => p.id !== selectedPlace.id);
      return [selectedPlace, ...others.slice(0, 59)];
    }

    const matches = places.filter((p) => {
      const nameMatch = p.name.toLowerCase().includes(q);
      const areaMatch = p.area?.toLowerCase().includes(q);
      const kindMatch = p.kind?.toLowerCase().includes(q);
      const cuisineMatch = typeof p.cuisine === "string" && p.cuisine.toLowerCase().includes(q);
      return nameMatch || areaMatch || kindMatch || cuisineMatch;
    });

    // Relevance ranking: exact name > name starts with > Swedish locale alphabetical
    matches.sort((a, b) => {
      const aName = a.name.toLowerCase();
      const bName = b.name.toLowerCase();
      if (aName === q && bName !== q) return -1;
      if (bName === q && aName !== q) return 1;

      const aStarts = aName.startsWith(q);
      const bStarts = bName.startsWith(q);
      if (aStarts && !bStarts) return -1;
      if (bStarts && !aStarts) return 1;

      return aName.localeCompare(bName, "sv");
    });

    return matches.slice(0, 60);
  }, [places, searchQuery, selectedPlace]);

  // Click outside to close
  useEffect(() => {
    function handleClickOutside(event: MouseEvent | TouchEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearchQuery("");
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, []);

  const handleSelect = (placeId: number) => {
    onSelectPlace(placeId);
    setSearchQuery("");
    setIsOpen(false);
    setHighlightedIndex(-1);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen) {
      if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        setIsOpen(true);
      }
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev < filteredPlaces.length - 1 ? prev + 1 : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : filteredPlaces.length - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (highlightedIndex >= 0 && highlightedIndex < filteredPlaces.length) {
        handleSelect(filteredPlaces[highlightedIndex].id);
      } else if (filteredPlaces.length > 0) {
        handleSelect(filteredPlaces[0].id);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      setIsOpen(false);
      setSearchQuery("");
    }
  };

  // Scroll highlighted item into view
  useEffect(() => {
    if (highlightedIndex >= 0 && listRef.current) {
      const items = listRef.current.querySelectorAll(".searchable-place-option");
      const target = items[highlightedIndex] as HTMLElement | undefined;
      if (target) {
        target.scrollIntoView({ block: "nearest" });
      }
    }
  }, [highlightedIndex]);

  const handleContainerBlur = (e: React.FocusEvent) => {
    if (!containerRef.current?.contains(e.relatedTarget as Node)) {
      setIsOpen(false);
      setSearchQuery("");
    }
  };

  return (
    <div
      className="superpower-form-group searchable-place-form-group"
      ref={containerRef}
      onBlur={handleContainerBlur}
      data-testid="searchable-place-group"
    >
      {label ? (
        <label htmlFor="searchable-place-input">
          {label} {required ? "*" : ""}
        </label>
      ) : null}

      <div className="searchable-place-select">
        <div
          className={`searchable-place-input-wrapper ${isOpen ? "is-focused" : ""}`}
          onClick={() => {
            if (!isOpen) {
              setIsOpen(true);
            }
            inputRef.current?.focus();
          }}
        >
          <div className="searchable-place-icon">
            <MagnifyingGlass size={16} weight="bold" />
          </div>

          <input
            id="searchable-place-input"
            data-testid="searchable-place-input"
            ref={inputRef}
            type="text"
            className="searchable-place-input"
            value={isOpen ? searchQuery : displaySelectedName}
            placeholder={
              isOpen
                ? (lang === "sv" ? "Sök bland 3 190+ ställen..." : "Search 3,190+ places...")
                : (lang === "sv" ? "Välj ställe..." : "Select place...")
            }
            onChange={(e) => {
              setSearchQuery(e.target.value);
              if (!isOpen) setIsOpen(true);
              setHighlightedIndex(0);
            }}
            onFocus={() => {
              setIsOpen(true);
              setSearchQuery("");
            }}
            onKeyDown={handleKeyDown}
            aria-expanded={isOpen}
            aria-haspopup="listbox"
            aria-autocomplete="list"
            role="combobox"
          />

          {isOpen && searchQuery ? (
            <button
              type="button"
              className="searchable-place-clear-btn"
              data-testid="searchable-place-clear"
              onClick={(e) => {
                e.stopPropagation();
                setSearchQuery("");
                inputRef.current?.focus();
              }}
              title={lang === "sv" ? "Rensa sökning" : "Clear search"}
              aria-label={lang === "sv" ? "Rensa sökning" : "Clear search"}
            >
              <X size={14} weight="bold" />
            </button>
          ) : (
            <button
              type="button"
              className="searchable-place-toggle-btn"
              data-testid="searchable-place-toggle"
              onClick={(e) => {
                e.stopPropagation();
                setIsOpen((prev) => {
                  const next = !prev;
                  if (next) {
                    setTimeout(() => inputRef.current?.focus(), 0);
                  }
                  return next;
                });
              }}
              aria-label={lang === "sv" ? "Öppna lista med ställen" : "Toggle place dropdown"}
            >
              <CaretDown
                size={16}
                weight="bold"
                style={{
                  transform: isOpen ? "rotate(180deg)" : "none",
                  transition: "transform 0.15s ease",
                }}
              />
            </button>
          )}
        </div>

        {isOpen ? (
          <ul
            className="searchable-place-dropdown"
            data-testid="searchable-place-dropdown"
            ref={listRef}
            role="listbox"
          >
            {filteredPlaces.length > 0 ? (
              filteredPlaces.map((place, index) => {
                const isSelected = place.id === selectedPlaceId;
                const isHighlighted = index === highlightedIndex;
                const metaParts = [place.area, place.kind, place.cuisine].filter(Boolean);

                return (
                  <li
                    key={place.id}
                    role="option"
                    aria-selected={isSelected}
                    data-testid={`searchable-place-option-${place.id}`}
                    className={`searchable-place-option ${isSelected ? "is-selected" : ""} ${
                      isHighlighted ? "is-highlighted" : ""
                    }`}
                    onClick={() => handleSelect(place.id)}
                    onMouseEnter={() => setHighlightedIndex(index)}
                  >
                    <div className="searchable-place-option-main">
                      <span className="searchable-place-option-name">{place.name}</span>
                      <span className="searchable-place-option-meta">
                        {metaParts.join(" · ")}
                      </span>
                    </div>

                    {isSelected ? (
                      <Check size={16} weight="bold" className="searchable-place-check-icon" />
                    ) : null}
                  </li>
                );
              })
            ) : (
              <li className="searchable-place-empty">
                {lang === "sv"
                  ? `Inga ställen matchar "${searchQuery}"`
                  : `No places match "${searchQuery}"`}
              </li>
            )}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
