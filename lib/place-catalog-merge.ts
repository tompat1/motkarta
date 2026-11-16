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

function mergedOverlayCuisine(staticPlace: PlaceInput, livePlace: PlaceInput) {
  const liveCuisine = (livePlace.cuisine ?? "").trim();
  if (liveCuisine) {
    return liveCuisine;
  }
  const staticCuisine = (staticPlace.cuisine ?? "").trim();
  return staticCuisine || undefined;
}

function mergedOverlayTags(staticPlace: PlaceInput, livePlace: PlaceInput): string[] {
  const liveTags = Array.isArray(livePlace.tags) ? livePlace.tags : [];
  const staticTags = Array.isArray(staticPlace.tags) ? staticPlace.tags : [];
  if (!staticTags.length) return liveTags;
  if (!liveTags.length) return staticTags;
  return Array.from(new Set([...liveTags, ...staticTags]));
}

function mergedOverlaySpecialty(staticPlace: PlaceInput, livePlace: PlaceInput): PlaceInput["specialty"] {
  if (livePlace.specialty?.specialtyVerified) {
    return livePlace.specialty;
  }
  if (staticPlace.specialty?.specialtyVerified) {
    return staticPlace.specialty;
  }
  return livePlace.specialty ?? staticPlace.specialty;
}

export function mergedOverlayEvidence(
  staticEv?: PlaceInput["evidence"],
  liveEv?: PlaceInput["evidence"],
): PlaceInput["evidence"] | undefined {
  if (!staticEv) return liveEv;
  if (!liveEv) return staticEv;
  const confLevels: Record<string, number> = { High: 3, Medium: 2, Low: 1 };
  const staticConf = confLevels[staticEv.confidence] ?? 1;
  const liveConf = confLevels[liveEv.confidence] ?? 1;
  const confidence = liveConf >= staticConf ? liveEv.confidence : staticEv.confidence;

  return {
    specialistGuide: Math.max(staticEv.specialistGuide ?? 0, liveEv.specialistGuide ?? 0),
    independentEditorial: Math.max(staticEv.independentEditorial ?? 0, liveEv.independentEditorial ?? 0),
    verifiedUserRating: Math.max(staticEv.verifiedUserRating ?? 0, liveEv.verifiedUserRating ?? 0),
    repeatVisits: Math.max(staticEv.repeatVisits ?? 0, liveEv.repeatVisits ?? 0),
    recentReviews: Math.max(staticEv.recentReviews ?? 0, liveEv.recentReviews ?? 0),
    credibleReviewers: Math.max(staticEv.credibleReviewers ?? 0, liveEv.credibleReviewers ?? 0),
    inspectionStatus: Math.max(staticEv.inspectionStatus ?? 0, liveEv.inspectionStatus ?? 0),
    verifiedAttributes: Math.max(staticEv.verifiedAttributes ?? 0, liveEv.verifiedAttributes ?? 0),
    dataFreshness: Math.max(staticEv.dataFreshness ?? 0, liveEv.dataFreshness ?? 0),
    confidence,
  };
}

export function mergedOverlayEvidenceLabel(staticLabel?: string, liveLabel?: string): string | undefined {
  const live = (liveLabel ?? "").trim();
  const staticL = (staticLabel ?? "").trim();
  if (live && live !== "No source evidence yet") {
    return live;
  }
  return staticL || live || undefined;
}

export function overlayPlaceFromLive(staticPlace: PlaceInput, livePlace: PlaceInput): PlaceInput {
  const staticCatalog = staticPlace as CatalogPlace;
  const liveCatalog = livePlace as CatalogPlace;
  const liveAddress = (livePlace.address ?? "").trim();
  const staticAddress = (staticPlace.address ?? "").trim();
  const liveEvidenceSources = Array.isArray(liveCatalog.evidenceSources) && liveCatalog.evidenceSources.length > 0
    ? liveCatalog.evidenceSources
    : staticCatalog.evidenceSources;
  const evidence = mergedOverlayEvidence(staticPlace.evidence, livePlace.evidence);
  const evidenceLabel = mergedOverlayEvidenceLabel(staticPlace.evidenceLabel, livePlace.evidenceLabel);
  const is_hidden_gem = livePlace.is_hidden_gem !== undefined ? livePlace.is_hidden_gem : staticPlace.is_hidden_gem;
  const validationLabel = livePlace.validationLabel !== undefined ? livePlace.validationLabel : staticPlace.validationLabel;
  const daysSinceFreshEvidence =
    livePlace.daysSinceFreshEvidence !== undefined && livePlace.daysSinceFreshEvidence > 0
      ? livePlace.daysSinceFreshEvidence
      : (staticPlace.daysSinceFreshEvidence ?? livePlace.daysSinceFreshEvidence);
  const mainstreamExposure =
    livePlace.mainstreamExposure !== undefined && livePlace.mainstreamExposure > 0
      ? livePlace.mainstreamExposure
      : (staticPlace.mainstreamExposure ?? livePlace.mainstreamExposure);

  return {
    ...staticPlace,
    ...livePlace,
    id: staticPlace.id,
    idNamespace: staticPlace.idNamespace ?? livePlace.idNamespace,
    address: liveAddress || staticAddress || livePlace.address,
    cuisine: mergedOverlayCuisine(staticPlace, livePlace),
    tags: mergedOverlayTags(staticPlace, livePlace),
    specialty: mergedOverlaySpecialty(staticPlace, livePlace),
    openingHours: livePlace.openingHours || staticPlace.openingHours,
    website: livePlace.website || staticPlace.website,
    priceSEK: livePlace.priceSEK ?? staticPlace.priceSEK,
    ...(evidence ? { evidence } : {}),
    ...(evidenceLabel ? { evidenceLabel } : {}),
    ...(is_hidden_gem !== undefined ? { is_hidden_gem } : {}),
    ...(validationLabel !== undefined ? { validationLabel } : {}),
    ...(daysSinceFreshEvidence !== undefined ? { daysSinceFreshEvidence } : {}),
    ...(mainstreamExposure !== undefined ? { mainstreamExposure } : {}),
    ...(liveEvidenceSources ? { evidenceSources: liveEvidenceSources } : {}),
  };
}

/** Enriches a live D1 place in-place with curated static fields when D1 has baseline/empty values. */
export function enrichD1PlaceFromStatic<T extends Record<string, any>>(d1Place: T, staticPlace: Record<string, any>): T {
  if (!d1Place.cuisine && staticPlace.cuisine) {
    (d1Place as any).cuisine = staticPlace.cuisine;
  }
  if (Array.isArray(staticPlace.tags) && staticPlace.tags.length > 0) {
    const existingTags = Array.isArray(d1Place.tags) ? d1Place.tags : [];
    (d1Place as any).tags = Array.from(new Set([...existingTags, ...staticPlace.tags]));
  }
  if (staticPlace.specialty?.specialtyVerified && !d1Place.specialty?.specialtyVerified) {
    (d1Place as any).specialty = staticPlace.specialty;
  }
  if ((!Array.isArray(d1Place.evidenceSources) || d1Place.evidenceSources.length === 0) && Array.isArray(staticPlace.evidenceSources) && staticPlace.evidenceSources.length > 0) {
    (d1Place as any).evidenceSources = staticPlace.evidenceSources;
  }
  if (!d1Place.openingHours && staticPlace.openingHours) {
    (d1Place as any).openingHours = staticPlace.openingHours;
  }
  if (!d1Place.website && staticPlace.website) {
    (d1Place as any).website = staticPlace.website;
  }
  if (d1Place.priceSEK === undefined && staticPlace.priceSEK !== undefined) {
    (d1Place as any).priceSEK = staticPlace.priceSEK;
  }
  if (!d1Place.address && staticPlace.address) {
    (d1Place as any).address = staticPlace.address;
  }
  if (staticPlace.evidence) {
    (d1Place as any).evidence = mergedOverlayEvidence(staticPlace.evidence, (d1Place as any).evidence);
  }
  if ((!d1Place.evidenceLabel || d1Place.evidenceLabel === "No source evidence yet") && staticPlace.evidenceLabel) {
    (d1Place as any).evidenceLabel = staticPlace.evidenceLabel;
  }
  if (d1Place.is_hidden_gem === undefined && staticPlace.is_hidden_gem !== undefined) {
    (d1Place as any).is_hidden_gem = staticPlace.is_hidden_gem;
  }
  if (d1Place.validationLabel === undefined && staticPlace.validationLabel !== undefined) {
    (d1Place as any).validationLabel = staticPlace.validationLabel;
  }
  if ((d1Place.daysSinceFreshEvidence === undefined || d1Place.daysSinceFreshEvidence === 0) && staticPlace.daysSinceFreshEvidence !== undefined) {
    (d1Place as any).daysSinceFreshEvidence = staticPlace.daysSinceFreshEvidence;
  }
  if ((d1Place.mainstreamExposure === undefined || d1Place.mainstreamExposure === 0) && staticPlace.mainstreamExposure !== undefined) {
    (d1Place as any).mainstreamExposure = staticPlace.mainstreamExposure;
  }
  return d1Place;
}

function getPlaceOsmIdentities(place: PlaceInput): string[] {
  const identities: string[] = [];
  if (place.osmIdentity) {
    identities.push(place.osmIdentity);
  }
  if (Array.isArray(place.osmAliases)) {
    for (const alias of place.osmAliases) {
      if (alias) identities.push(alias);
    }
  }
  return identities;
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

/** Prefer live D1 editorial data for matching venues, then append publishable D1-only rows in O(N + M) time. */
export function overlayCatalogWithLivePlaces(
  staticCatalog: PlaceInput[],
  liveCatalog: PlaceInput[],
): PlaceInput[] {
  if (!liveCatalog.length) {
    return staticCatalog;
  }

  // Build O(1) lookup indices for liveCatalog preserving first-match scan order
  const liveById = new Map<number, PlaceInput>();
  const liveByOsm = new Map<string, PlaceInput[]>();
  const liveByName = new Map<string, PlaceInput[]>();

  for (const livePlace of liveCatalog) {
    if (!liveById.has(livePlace.id)) {
      liveById.set(livePlace.id, livePlace);
    }
    for (const osmId of getPlaceOsmIdentities(livePlace)) {
      let bucket = liveByOsm.get(osmId);
      if (!bucket) {
        bucket = [];
        liveByOsm.set(osmId, bucket);
      }
      bucket.push(livePlace);
    }
    const normName = normalize(livePlace.name);
    if (normName) {
      let bucket = liveByName.get(normName);
      if (!bucket) {
        bucket = [];
        liveByName.set(normName, bucket);
      }
      bucket.push(livePlace);
    }
  }

  const consumedLiveIds = new Set<number>();

  const findIndexedMatchingLivePlace = (staticPlace: PlaceInput): PlaceInput | undefined => {
    const candidateMap = new Map<number, PlaceInput>();
    const byId = liveById.get(staticPlace.id);
    if (byId && !consumedLiveIds.has(byId.id)) {
      candidateMap.set(byId.id, byId);
    }
    for (const osmId of getPlaceOsmIdentities(staticPlace)) {
      const matches = liveByOsm.get(osmId);
      if (matches) {
        for (const match of matches) {
          if (!consumedLiveIds.has(match.id)) {
            candidateMap.set(match.id, match);
          }
        }
      }
    }
    const normName = normalize(staticPlace.name);
    if (normName) {
      const matches = liveByName.get(normName);
      if (matches) {
        for (const match of matches) {
          if (!consumedLiveIds.has(match.id)) {
            candidateMap.set(match.id, match);
          }
        }
      }
    }

    if (candidateMap.size === 0) {
      return undefined;
    }

    let best: PlaceInput | undefined;
    for (const candidate of candidateMap.values()) {
      if (staticPlace.id === candidate.id || samePlaceIdentity(staticPlace, candidate)) {
        if (!best) {
          best = candidate;
        }
      }
    }
    if (best && candidateMap.size > 1) {
      for (const livePlace of liveCatalog) {
        if (consumedLiveIds.has(livePlace.id)) continue;
        if (candidateMap.has(livePlace.id) && (staticPlace.id === livePlace.id || samePlaceIdentity(staticPlace, livePlace))) {
          return livePlace;
        }
      }
    }
    return best;
  };

  const overlaid = staticCatalog.map((staticPlace) => {
    const livePlace = findIndexedMatchingLivePlace(staticPlace);
    if (!livePlace) {
      return staticPlace;
    }
    consumedLiveIds.add(livePlace.id);
    return overlayPlaceFromLive(staticPlace, livePlace);
  });

  // Track overlaid identities in sets for O(1) duplicate checks when appending D1-only places
  const overlaidIds = new Set<number>();
  const overlaidOsm = new Set<string>();
  const overlaidNameAreas = new Set<string>();

  const registerOverlaidPlace = (place: PlaceInput) => {
    overlaidIds.add(place.id);
    if (place.osmIdentity) {
      overlaidOsm.add(place.osmIdentity);
    }
    const nameArea = `${normalize(place.name)}::${normalize(place.area || "")}`;
    if (nameArea) {
      overlaidNameAreas.add(nameArea);
    }
  };

  for (const place of overlaid) {
    registerOverlaidPlace(place);
  }

  for (const livePlace of liveCatalog) {
    if (consumedLiveIds.has(livePlace.id)) {
      continue;
    }
    const catalogPlace = livePlace as CatalogPlace;
    if (!shouldAppendLiveOnlyPlace(catalogPlace)) {
      continue;
    }
    const nameArea = `${normalize(catalogPlace.name)}::${normalize(catalogPlace.area || "")}`;
    const isDuplicate =
      overlaidIds.has(catalogPlace.id) ||
      Boolean(catalogPlace.osmIdentity && overlaidOsm.has(catalogPlace.osmIdentity)) ||
      Boolean(nameArea && overlaidNameAreas.has(nameArea));
    if (isDuplicate) {
      continue;
    }
    overlaid.push(livePlace);
    registerOverlaidPlace(livePlace);
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
