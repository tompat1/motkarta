import type { ScoredPlace } from "../../lib/scoring";
import type { EstablishmentFilter } from "./shared";

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
