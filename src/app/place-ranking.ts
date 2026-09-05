import type { PlaceInput, ScoredPlace } from "../../lib/scoring";

export const modes = [
  "For you",
  "Hidden gems",
  "Popular now",
  "Local favourites",
  "Quality first",
  "Recently opened",
  "Expert selected",
  "Most verified",
] as const;

export const sortModes = ["Best match", "Distance", "Alphabetical", "Surprise me"] as const;
export const stockholmCenter = { latitude: 59.3293, longitude: 18.0686 };

export type Mode = (typeof modes)[number];
export type SortMode = (typeof sortModes)[number];

const modesWithoutBackingPublicData: Mode[] = ["Local favourites", "Quality first", "Recently opened"];
export const visibleModes = modes.filter((mode) => !modesWithoutBackingPublicData.includes(mode));

export function modeScore(place: ScoredPlace, mode: Mode) {
  if (mode === "Hidden gems") {
    return place.scores.discovery;
  }

  if (mode === "Popular now") {
    return place.scores.popularity;
  }

  if (mode === "Local favourites") {
    return (place.localPopularityPercentile ?? 0) * 100;
  }

  if (mode === "Quality first") {
    return place.scores.quality;
  }

  if (mode === "Recently opened") {
    return place.scores.freshness;
  }

  if (mode === "Expert selected") {
    return (place.evidence?.specialistGuide ?? 0) * 50 + place.scores.quality * 0.5;
  }

  if (mode === "Most verified") {
    return place.evidence?.confidence === "High"
      ? 100
      : place.evidence?.confidence === "Medium"
        ? 60
        : 20;
  }

  return place.scores.recommendation;
}

export function comparePlaces(
  a: ScoredPlace,
  b: ScoredPlace,
  mode: Mode,
  sortMode: SortMode,
  randomSeed: number,
  userCenter: { latitude: number; longitude: number } = stockholmCenter
) {
  if (sortMode === "Alphabetical") {
    return compareText(a.name, b.name) || a.id - b.id;
  }

  if (sortMode === "Distance") {
    return compareAscending(distanceFromPoint(a, userCenter), distanceFromPoint(b, userCenter)) || compareBestMatch(a, b, mode, userCenter);
  }

  if (sortMode === "Surprise me") {
    return compareAscending(seededRandom(a.id, randomSeed), seededRandom(b.id, randomSeed)) || compareText(a.name, b.name) || a.id - b.id;
  }

  return compareBestMatch(a, b, mode, userCenter);
}

function compareBestMatch(
  a: ScoredPlace,
  b: ScoredPlace,
  mode: Mode,
  userCenter: { latitude: number; longitude: number }
) {
  if (mode === "Hidden gems") {
    const hiddenGemResult = compareDescending(hiddenGemPriority(a), hiddenGemPriority(b));
    if (hiddenGemResult !== 0) {
      return hiddenGemResult;
    }
  }

  const primary = compareDescending(modeScore(a, mode), modeScore(b, mode));
  if (primary !== 0) {
    return primary;
  }

  for (const [scoreA, scoreB] of modeTieBreakers(a, b, mode, userCenter)) {
    const result = compareDescending(scoreA, scoreB);
    if (result !== 0) {
      return result;
    }
  }

  return compareText(a.name, b.name) || a.id - b.id;
}

function hiddenGemPriority(place: ScoredPlace) {
  return place.hiddenGem?.eligible ? 1 : 0;
}

function modeTieBreakers(
  a: ScoredPlace,
  b: ScoredPlace,
  mode: Mode,
  userCenter: { latitude: number; longitude: number }
): Array<[number, number]> {
  if (mode === "Most verified") {
    return [
      [verificationDepth(a), verificationDepth(b)],
      [freshTimestamp(a), freshTimestamp(b)],
      [a.scores.quality, b.scores.quality],
      [a.scores.recommendation, b.scores.recommendation],
      [proximityScore(a, userCenter), proximityScore(b, userCenter)],
    ];
  }

  if (mode === "Recently opened") {
    return [
      [freshTimestamp(a), freshTimestamp(b)],
      [a.scores.recommendation, b.scores.recommendation],
      [a.scores.quality, b.scores.quality],
      [proximityScore(a, userCenter), proximityScore(b, userCenter)],
    ];
  }

  if (mode === "Expert selected") {
    return [
      [expertEvidence(a), expertEvidence(b)],
      [a.scores.quality, b.scores.quality],
      [a.scores.recommendation, b.scores.recommendation],
      [proximityScore(a, userCenter), proximityScore(b, userCenter)],
    ];
  }

  if (mode === "Local favourites") {
    return [
      [a.scores.popularity, b.scores.popularity],
      [a.scores.quality, b.scores.quality],
      [a.scores.recommendation, b.scores.recommendation],
      [proximityScore(a, userCenter), proximityScore(b, userCenter)],
    ];
  }

  return [
    [a.scores.recommendation, b.scores.recommendation],
    [a.scores.quality, b.scores.quality],
    [a.scores.discovery, b.scores.discovery],
    [a.scores.popularity, b.scores.popularity],
    [a.scores.freshness, b.scores.freshness],
    [verificationDepth(a), verificationDepth(b)],
    [proximityScore(a, userCenter), proximityScore(b, userCenter)],
  ];
}

function verificationDepth(place: ScoredPlace) {
  const evidence = place.evidence;
  return (
    confidenceScore(evidence?.confidence) +
    (place.verification?.verifiedSourcesCount ?? 0) * 20 +
    (evidence?.specialistGuide ?? 0) * 12 +
    (evidence?.independentEditorial ?? 0) * 10 +
    (evidence?.inspectionStatus ?? 0) * 8 +
    (evidence?.verifiedAttributes ?? 0) * 6 +
    (place.hiddenGem?.independentEvidenceCount ?? 0) * 5
  );
}

function expertEvidence(place: ScoredPlace) {
  return (
    (place.evidence?.specialistGuide ?? 0) * 50 +
    (place.evidence?.independentEditorial ?? 0) * 25 +
    (place.specialty?.verificationSources ?? 0) * 8
  );
}

function confidenceScore(confidence: ScoredPlace["evidence"]["confidence"] | undefined) {
  if (confidence === "High") return 100;
  if (confidence === "Medium") return 60;
  return 20;
}

function freshTimestamp(place: ScoredPlace) {
  const timestamp = new Date(place.lastUpdated ?? 0).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function proximityScore(place: ScoredPlace, center: { latitude: number; longitude: number }) {
  const distance = distanceFromPoint(place, center);
  return Number.isFinite(distance) ? -distance : Number.NEGATIVE_INFINITY;
}

function compareDescending(a: number, b: number) {
  return b - a;
}

function compareAscending(a: number, b: number) {
  return a - b;
}

function compareText(a: string, b: string) {
  return a.localeCompare(b, "sv");
}

export function distanceFromPoint(
  place: Pick<PlaceInput, "latitude" | "longitude">,
  center: { latitude: number; longitude: number } = stockholmCenter
) {
  if (typeof place.latitude !== "number" || typeof place.longitude !== "number") {
    return Number.POSITIVE_INFINITY;
  }

  const earthRadius = 6371;
  const latDelta = degreesToRadians(place.latitude - center.latitude);
  const lonDelta = degreesToRadians(place.longitude - center.longitude);
  const startLat = degreesToRadians(center.latitude);
  const endLat = degreesToRadians(place.latitude);
  const haversine =
    Math.sin(latDelta / 2) ** 2 +
    Math.cos(startLat) * Math.cos(endLat) * Math.sin(lonDelta / 2) ** 2;

  return 2 * earthRadius * Math.asin(Math.sqrt(haversine));
}

function degreesToRadians(value: number) {
  return (value * Math.PI) / 180;
}

export function seededRandom(id: number, seed: number) {
  const value = Math.sin((id + seed) * 12.9898) * 43758.5453;
  return value - Math.floor(value);
}
