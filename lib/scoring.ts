export type EstablishmentType =
  | "Restaurant"
  | "Bakery"
  | "Café"
  | "Specialty coffee";

export type Confidence = "Low" | "Medium" | "High";

export type SpecialtyAttributes = {
  specialtyVerified: boolean;
  ownRoastery: boolean;
  traceableCoffee: boolean;
  filterCoffee: boolean;
  espressoBased: boolean;
  rotatingRoasters: boolean;
  singleOrigin: boolean;
  manualBrewMethods: string[];
  decafAvailable: boolean;
  beansForSale: boolean;
  verificationSources: number;
};

export type EvidenceSignals = {
  specialistGuide: number;
  independentEditorial: number;
  verifiedUserRating: number;
  repeatVisits: number;
  recentReviews: number;
  credibleReviewers: number;
  inspectionStatus: number;
  verifiedAttributes: number;
  dataFreshness: number;
  confidence: Confidence;
};

export type EngagementSignals = {
  searchImpressions: number;
  profileViews: number;
  mapMarkerClicks: number;
  saves: number;
  directionRequests: number;
  confirmedVisits: number;
  repeatVisits: number;
  recommendations: number;
  recentSaves: number;
};

export type UserPreferences = {
  kind?: EstablishmentType;
  tags?: string[];
  priceLevel?: number;
  district?: string;
  purpose?: "breakfast" | "fika" | "lunch" | "dinner" | "work";
  independentOnly?: boolean;
};

export type PlaceInput = {
  id: number;
  name: string;
  kind: EstablishmentType;
  cuisine?: string;
  area: string;
  note: string;
  tags: string[];
  discoveryReasons?: string[];
  discoverySignals?: Record<string, boolean>;
  sourceName?: string;
  lastUpdated?: string;
  evidenceLabel: string;
  ratingAverage: number;
  reliableRatingCount: number;
  reviewCount: number;
  categoryMeanRating: number;
  categoryPopularityRaw: number;
  localPopularityPercentile: number;
  priceLevel: number;
  mainstreamExposure: number;
  ageDays: number;
  daysSinceFreshEvidence: number;
  evidence: EvidenceSignals;
  engagement: EngagementSignals;
  specialty?: SpecialtyAttributes;
  latitude?: number;
  longitude?: number;
  x: number;
  y: number;
};

export type ScoreBreakdown = {
  quality: number;
  popularity: number;
  relevance: number;
  discovery: number;
  freshness: number;
  recommendation: number;
  bayesianUserRating: number;
  exposureAdjustedEngagement: number;
  repeatVisitRate: number;
  recentSaveRate: number;
  crossSourceConsensus: number;
  specialistConfidence: number;
  localEngagement: number;
};

export type ScoredPlace = PlaceInput & {
  scores: ScoreBreakdown;
};

const confidenceWeight: Record<Confidence, number> = {
  Low: 0.45,
  Medium: 0.72,
  High: 1,
};

export function clamp(value: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value));
}

export function bayesianRating(
  rating: number,
  ratingCount: number,
  categoryMean = 4.1,
  minimumEvidence = 30,
) {
  if (ratingCount <= 0) {
    return categoryMean;
  }

  return (
    (ratingCount / (ratingCount + minimumEvidence)) * rating +
    (minimumEvidence / (ratingCount + minimumEvidence)) * categoryMean
  );
}

export function recencyWeight(daysOld: number, halfLife = 180) {
  return Math.exp((-Math.log(2) * Math.max(0, daysOld)) / halfLife);
}

export function bayesianRate(
  positiveSignals: number,
  totalSignals: number,
  priorRate = 0.08,
  priorWeight = 50,
) {
  if (totalSignals <= 0) {
    return priorRate;
  }

  return (positiveSignals + priorRate * priorWeight) / (totalSignals + priorWeight);
}

export function logarithmicCountScore(count: number, highWatermark: number) {
  if (highWatermark <= 0) {
    return 0;
  }

  return clamp((Math.log1p(Math.max(0, count)) / Math.log1p(highWatermark)) * 100);
}

function sourceConsensus(evidence: EvidenceSignals) {
  const sourceCount =
    evidence.specialistGuide +
    evidence.independentEditorial +
    evidence.verifiedUserRating +
    evidence.credibleReviewers;

  return clamp((sourceCount / 4) * 100 * confidenceWeight[evidence.confidence]);
}

function specialtyConfidence(place: PlaceInput) {
  if (place.kind !== "Specialty coffee" || !place.specialty) {
    return 0;
  }

  const attributes = place.specialty;
  const structuredSignals = [
    attributes.specialtyVerified,
    attributes.ownRoastery,
    attributes.traceableCoffee,
    attributes.filterCoffee,
    attributes.espressoBased,
    attributes.rotatingRoasters,
    attributes.singleOrigin,
    attributes.decafAvailable,
    attributes.beansForSale,
    attributes.manualBrewMethods.length > 0,
  ].filter(Boolean).length;

  const verificationScore = Math.min(3, attributes.verificationSources) / 3;
  return clamp(structuredSignals * 7 + verificationScore * 30);
}

export function qualityScore(place: PlaceInput) {
  const evidence = place.evidence;
  const base =
    0.16 * evidence.specialistGuide +
    0.14 * evidence.independentEditorial +
    0.14 * evidence.verifiedUserRating +
    0.1 * evidence.repeatVisits +
    0.1 * evidence.recentReviews +
    0.1 * evidence.credibleReviewers +
    0.06 * evidence.inspectionStatus +
    0.1 * evidence.verifiedAttributes +
    0.1 * evidence.dataFreshness;

  const specialtyBonus = place.kind === "Specialty coffee" ? specialtyConfidence(place) * 0.12 : 0;
  return clamp(base + specialtyBonus);
}

export function freshnessScore(place: PlaceInput) {
  return clamp(recencyWeight(place.daysSinceFreshEvidence) * 100);
}

export function popularityScore(place: PlaceInput) {
  const bayesianUserRating = ((bayesianRating(
    place.ratingAverage,
    place.reliableRatingCount,
    place.categoryMeanRating,
  ) - 1) / 4) * 100;

  const exposureAdjustedEngagement =
    bayesianRate(
      place.engagement.saves +
        place.engagement.confirmedVisits +
        place.engagement.directionRequests,
      Math.max(1, place.engagement.searchImpressions),
      0.08,
      120,
    ) * 100;

  const repeatVisitRate =
    bayesianRate(
      place.engagement.repeatVisits,
      Math.max(1, place.engagement.confirmedVisits),
      0.18,
      30,
    ) * 100;

  const recentSaveRate =
    bayesianRate(
      place.engagement.recentSaves,
      Math.max(1, place.engagement.saves),
      0.38,
      25,
    ) * 100;

  const crossSourceConsensus = sourceConsensus(place.evidence);

  return {
    score: clamp(
      0.3 * bayesianUserRating +
        0.25 * exposureAdjustedEngagement +
        0.2 * repeatVisitRate +
        0.15 * recentSaveRate +
        0.1 * crossSourceConsensus,
    ),
    bayesianUserRating,
    exposureAdjustedEngagement,
    repeatVisitRate,
    recentSaveRate,
    crossSourceConsensus,
  };
}

export function relevanceScore(place: PlaceInput, preferences: UserPreferences = {}) {
  let score = 50;

  if (preferences.kind) {
    score += place.kind === preferences.kind ? 22 : -12;
  }

  if (preferences.district) {
    score += place.area === preferences.district ? 12 : 0;
  }

  if (typeof preferences.priceLevel === "number") {
    score += Math.max(0, 12 - Math.abs(place.priceLevel - preferences.priceLevel) * 6);
  }

  if (preferences.independentOnly) {
    score += place.tags.includes("Independent") ? 10 : -10;
  }

  if (preferences.tags?.length) {
    const lowerTags = place.tags.map((tag) => tag.toLowerCase());
    const matches = preferences.tags.filter((tag) =>
      lowerTags.some((placeTag) => placeTag.includes(tag.toLowerCase())),
    );
    score += Math.min(24, matches.length * 8);
  }

  if (preferences.purpose && place.tags.some((tag) => tag.toLowerCase() === preferences.purpose)) {
    score += 8;
  }

  return clamp(score);
}

export function discoveryScore(place: PlaceInput, quality: number) {
  const specialistConfidence = place.evidence.specialistGuide * 70 + specialtyConfidence(place) * 0.3;
  const localEngagement =
    bayesianRate(
      place.engagement.mapMarkerClicks + place.engagement.saves,
      Math.max(1, place.engagement.searchImpressions),
      0.1,
      80,
    ) * 100;
  const dataFreshness = freshnessScore(place);

  return {
    score: clamp(
      0.4 * quality +
        0.25 * specialistConfidence +
        0.2 * localEngagement +
        0.15 * dataFreshness -
        0.25 * place.mainstreamExposure,
    ),
    specialistConfidence: clamp(specialistConfidence),
    localEngagement,
  };
}

export function scorePlace(place: PlaceInput, preferences: UserPreferences = {}): ScoredPlace {
  const quality = qualityScore(place);
  const popularity = popularityScore(place);
  const relevance = relevanceScore(place, preferences);
  const discovery = discoveryScore(place, quality);
  const freshness = freshnessScore(place);
  const recommendation = clamp(
    0.35 * relevance +
      0.25 * quality +
      0.15 * popularity.score +
      0.15 * discovery.score +
      0.1 * freshness,
  );

  return {
    ...place,
    scores: {
      quality,
      popularity: popularity.score,
      relevance,
      discovery: discovery.score,
      freshness,
      recommendation,
      bayesianUserRating: popularity.bayesianUserRating,
      exposureAdjustedEngagement: popularity.exposureAdjustedEngagement,
      repeatVisitRate: popularity.repeatVisitRate,
      recentSaveRate: popularity.recentSaveRate,
      crossSourceConsensus: popularity.crossSourceConsensus,
      specialistConfidence: discovery.specialistConfidence,
      localEngagement: discovery.localEngagement,
    },
  };
}

export function addLocalPopularityPercentiles<T extends PlaceInput>(places: T[]) {
  return places.map((place) => {
    const peers = places
      .filter((peer) => peer.kind === place.kind && peer.area === place.area)
      .sort((a, b) => a.categoryPopularityRaw - b.categoryPopularityRaw);
    const rank = peers.findIndex((peer) => peer.id === place.id) + 1;

    return {
      ...place,
      localPopularityPercentile: peers.length > 1 ? rank / peers.length : 0.5,
    };
  });
}
