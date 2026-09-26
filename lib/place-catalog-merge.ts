import { normalize } from "./concierge/facts.ts";
import type { PlaceInput } from "./scoring.ts";

type CatalogPlace = PlaceInput & {
  candidateSourceType?: string | null;
  evidenceSources?: Array<{ type?: string }>;
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

/** Merge live D1 venues that are not yet in the static OSM export (manual admin entries, etc.). */
export function mergeSupplementalCatalogPlaces(
  baseCatalog: PlaceInput[],
  supplemental: PlaceInput[],
): PlaceInput[] {
  if (!supplemental.length) {
    return baseCatalog;
  }

  const merged = [...baseCatalog];
  for (const place of supplemental) {
    const catalogPlace = place as CatalogPlace;
    if (!isManualAdminCatalogPlace(catalogPlace)) {
      continue;
    }
    if (catalogPlace.validationLabel === "closed_wrong_category") {
      continue;
    }
    if (merged.some((existing) => isCatalogDuplicate(existing, catalogPlace))) {
      continue;
    }
    merged.push(place);
  }

  return merged;
}
