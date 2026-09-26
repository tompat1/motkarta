import { normalize } from "./concierge/facts.ts";
import type { PlaceInput } from "./scoring.ts";
import { samePlaceIdentity } from "./place-visibility.ts";

export type CatalogPlace = PlaceInput & {
  candidateSourceType?: string | null;
  evidenceSources?: Array<{ type?: string }>;
  duplicateResolution?: string | null;
};

export function isManualAdminCatalogPlace(place: CatalogPlace): boolean {
  if (place.candidateSourceType === "admin_entry") {
    return true;
  }
  return (place.evidenceSources ?? []).some((source) => source.type === "admin_entry");
}

export function isCatalogDuplicate(existing: CatalogPlace, candidate: CatalogPlace): boolean {
  if (existing.id === candidate.id) {
    return true;
  }
  const existingOsm = existing.osmIdentity;
  const candidateOsm = candidate.osmIdentity;
  if (existingOsm && candidateOsm && existingOsm === candidateOsm) {
    return true;
  }
  const nameArea = `${normalize(existing.name)}::${normalize(existing.area || "")}`;
  const otherNameArea = `${normalize(candidate.name)}::${normalize(candidate.area || "")}`;
  return Boolean(nameArea && otherNameArea && nameArea === otherNameArea);
}

export function overlayPlaceFromLive(staticPlace: PlaceInput, livePlace: PlaceInput): PlaceInput {
  return {
    ...livePlace,
    id: staticPlace.id,
    idNamespace: staticPlace.idNamespace ?? livePlace.idNamespace,
  };
}

function findMatchingLivePlace(
  staticPlace: PlaceInput,
  liveCatalog: PlaceInput[],
  consumedLiveIds: Set<number>,
): PlaceInput | undefined {
  for (const livePlace of liveCatalog) {
    if (consumedLiveIds.has(livePlace.id)) {
      continue;
    }
    if (staticPlace.id === livePlace.id || samePlaceIdentity(staticPlace, livePlace)) {
      return livePlace;
    }
  }
  return undefined;
}

export function shouldAppendLiveOnlyPlace(place: CatalogPlace): boolean {
  if (place.validationLabel === "closed_wrong_category" || place.duplicateResolution === "merged") {
    return false;
  }
  if (isManualAdminCatalogPlace(place)) {
    return true;
  }
  if (place.lifecycleState === "verified" || place.lifecycleState === "featured") {
    return true;
  }
  if (place.lifecycleState === "candidate") {
    if (place.validationLabel) {
      return true;
    }
    const sourceType = place.candidateSourceType;
    if (sourceType && sourceType !== "osm" && sourceType !== "osm_baseline") {
      return true;
    }
  }
  return false;
}

/** Prefer live D1 editorial data for matching venues, then append publishable D1-only rows. */
export function overlayCatalogWithLivePlaces(
  staticCatalog: PlaceInput[],
  liveCatalog: PlaceInput[],
): PlaceInput[] {
  if (!liveCatalog.length) {
    return staticCatalog;
  }

  const consumedLiveIds = new Set<number>();
  const overlaid = staticCatalog.map((staticPlace) => {
    const livePlace = findMatchingLivePlace(staticPlace, liveCatalog, consumedLiveIds);
    if (!livePlace) {
      return staticPlace;
    }
    consumedLiveIds.add(livePlace.id);
    return overlayPlaceFromLive(staticPlace, livePlace);
  });

  for (const livePlace of liveCatalog) {
    if (consumedLiveIds.has(livePlace.id)) {
      continue;
    }
    const catalogPlace = livePlace as CatalogPlace;
    if (!shouldAppendLiveOnlyPlace(catalogPlace)) {
      continue;
    }
    if (overlaid.some((existing) => isCatalogDuplicate(existing, catalogPlace))) {
      continue;
    }
    overlaid.push(livePlace);
  }

  return overlaid;
}

/** @deprecated Use overlayCatalogWithLivePlaces */
export function mergeSupplementalCatalogPlaces(
  baseCatalog: PlaceInput[],
  supplemental: PlaceInput[],
): PlaceInput[] {
  return overlayCatalogWithLivePlaces(baseCatalog, supplemental);
}
