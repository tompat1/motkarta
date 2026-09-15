import type { PlaceInput, ScoredPlace } from "../../lib/scoring";
import type { EstablishmentFilter } from "./shared";

export function normalizeSearchKey(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

export function findDuplicatePlace<T extends PlaceInput>(
  name: string,
  area: string = "",
  places: T[],
): T | null {
  const cleanName = name.trim().toLowerCase();
  if (!cleanName) return null;

  const normTargetName = normalizeSearchKey(cleanName);
  if (!normTargetName) return null;

  const cleanArea = area.trim().toLowerCase();
  const normTargetArea = normalizeSearchKey(cleanArea);

  for (const p of places) {
    const pName = p.name.trim().toLowerCase();
    const pNormName = normalizeSearchKey(pName);

    // 1. Exact case-insensitive match
    if (pName === cleanName) return p;

    // 2. Normalized alphanumeric match (ignores accents, symbols, spaces: "Café Pascal" == "cafe pascal")
    if (pNormName === normTargetName) return p;

    // 3. OSM aliases match
    if (p.osmAliases && Array.isArray(p.osmAliases)) {
      for (const alias of p.osmAliases) {
        if (alias.trim().toLowerCase() === cleanName || normalizeSearchKey(alias) === normTargetName) {
          return p;
        }
      }
    }

    // 4. If area is provided and matches, match substring (e.g. "Belgobaren" in "City" matching "Belgobaren City")
    const pNormArea = p.area ? normalizeSearchKey(p.area) : "";
    if (normTargetArea && pNormArea && (pNormArea.includes(normTargetArea) || normTargetArea.includes(pNormArea))) {
      if (normTargetName.length >= 4 && (pNormName.includes(normTargetName) || normTargetName.includes(pNormName))) {
        return p;
      }
    }

    // 5. Target name contains existing place name + area (e.g. "Café Pascal Vasastan" matching "Café Pascal" in "Vasastan")
    if (pNormArea && pNormName.length >= 4 && normTargetName.includes(pNormName) && normTargetName.includes(pNormArea)) {
      return p;
    }
  }

  return null;
}

export function matchesEstablishmentFilter(
  place: ScoredPlace,
  kind: EstablishmentFilter,
  savedPlaceIds: number[],
) {
  if (kind === "All places") {
    return true;
  }
  if (kind === "Curated") {
    return isCuratedPlace(place);
  }
  if (kind === "Saved") {
    return savedPlaceIds.includes(place.id);
  }
  if (kind === "Latest") {
    return isLatestAddedPlace(place);
  }
  return place.kind === kind;
}

export function isLatestAddedPlace(place: Pick<ScoredPlace, "lastUpdated">) {
  return Boolean(place.lastUpdated);
}

export function isCuratedPlace(place: ScoredPlace) {
  const evidenceLabel = (place.evidenceLabel ?? "").toLowerCase();
  const sourceName = (place.sourceName ?? "").toLowerCase();
  return (
    place.evidence.specialistGuide === 1 ||
    place.evidence.independentEditorial === 1 ||
    evidenceLabel.includes("guide") ||
    evidenceLabel.includes("specialist") ||
    evidenceLabel.includes("visit stockholm") ||
    evidenceLabel.includes("visitstockholm") ||
    evidenceLabel.includes("officiella stadsguiden") ||
    sourceName.includes("husa") ||
    sourceName.includes("visit stockholm") ||
    sourceName.includes("visitstockholm") ||
    sourceName.includes("officiella stadsguiden")
  );
}
