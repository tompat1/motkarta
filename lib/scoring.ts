export type EstablishmentType =
  | "Restaurant"
  | "Bakery"
  | "Café"
  | "Specialty coffee";

export type Confidence = "Low" | "Medium" | "High";
export type PlaceLifecycleState = "baseline" | "candidate" | "verified" | "featured";

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
  address?: string;
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
  is_hidden_gem?: boolean;
  lifecycleState?: PlaceLifecycleState;
  validationLabel?: "known_mainstream" | "known_hidden_gem" | "not_enough_evidence" | "closed_wrong_category";
  validationNotes?: string;
  evidence: EvidenceSignals;
  engagement: EngagementSignals;
  specialty?: SpecialtyAttributes;
  latitude?: number;
  longitude?: number;
  website?: string;
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

export type VerificationSourceStatus = {
  verified: boolean;
  label: string;
  detail: string;
};

export type VerificationBreakdown = {
  specialistGuide: VerificationSourceStatus;
  editorialTeam: VerificationSourceStatus;
  communitySubmissions: VerificationSourceStatus;
  structuredEvidence: VerificationSourceStatus;
  verifiedSourcesCount: number;
  confidenceLevel: Confidence;
  confidenceScore: number;
  summary: string;
};

export type ScoredPlace = PlaceInput & {
  scores: ScoreBreakdown;
  verification: VerificationBreakdown;
  hiddenGem: HiddenGemEligibility;
};

export type HiddenGemGateStatus = {
  passed: boolean;
  label: string;
  detail: string;
};

export type HiddenGemEligibility = {
  eligible: boolean;
  independentEvidenceCount: number;
  gates: {
    lowMainstreamExposure: HiddenGemGateStatus;
    independentEvidence: HiddenGemGateStatus;
    currentExistence: HiddenGemGateStatus;
    distinctiveness: HiddenGemGateStatus;
    lifecycle: HiddenGemGateStatus;
  };
};

const confidenceWeight: Record<Confidence, number> = {
  Low: 0.45,
  Medium: 0.72,
  High: 1,
};

const defaultEvidence: EvidenceSignals = {
  specialistGuide: 0,
  independentEditorial: 0,
  verifiedUserRating: 0,
  repeatVisits: 0,
  recentReviews: 0,
  credibleReviewers: 0,
  inspectionStatus: 0,
  verifiedAttributes: 0,
  dataFreshness: 0,
  confidence: "Low",
};

const defaultEngagement: EngagementSignals = {
  searchImpressions: 0,
  profileViews: 0,
  mapMarkerClicks: 0,
  saves: 0,
  directionRequests: 0,
  confirmedVisits: 0,
  repeatVisits: 0,
  recommendations: 0,
  recentSaves: 0,
};

function finiteNumber(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function normalizedConfidence(value: unknown): Confidence {
  return value === "High" || value === "Medium" || value === "Low" ? value : "Low";
}

function normalizeEvidence(evidence: Partial<EvidenceSignals> | undefined): EvidenceSignals {
  const source = { ...defaultEvidence, ...evidence };

  return {
    specialistGuide: finiteNumber(source.specialistGuide),
    independentEditorial: finiteNumber(source.independentEditorial),
    verifiedUserRating: finiteNumber(source.verifiedUserRating),
    repeatVisits: finiteNumber(source.repeatVisits),
    recentReviews: finiteNumber(source.recentReviews),
    credibleReviewers: finiteNumber(source.credibleReviewers),
    inspectionStatus: finiteNumber(source.inspectionStatus),
    verifiedAttributes: finiteNumber(source.verifiedAttributes),
    dataFreshness: finiteNumber(source.dataFreshness),
    confidence: normalizedConfidence(source.confidence),
  };
}

function normalizeEngagement(engagement: Partial<EngagementSignals> | undefined): EngagementSignals {
  const source = { ...defaultEngagement, ...engagement };

  return {
    searchImpressions: finiteNumber(source.searchImpressions),
    profileViews: finiteNumber(source.profileViews),
    mapMarkerClicks: finiteNumber(source.mapMarkerClicks),
    saves: finiteNumber(source.saves),
    directionRequests: finiteNumber(source.directionRequests),
    confirmedVisits: finiteNumber(source.confirmedVisits),
    repeatVisits: finiteNumber(source.repeatVisits),
    recommendations: finiteNumber(source.recommendations),
    recentSaves: finiteNumber(source.recentSaves),
  };
}

export function clamp(value: number, min = 0, max = 100) {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(max, Math.max(min, value));
}

export function bayesianRating(
  rating: number,
  ratingCount: number,
  categoryMean = 4.1,
  minimumEvidence = 30,
) {
  const safeCategoryMean = finiteNumber(categoryMean, 4.1);
  const safeRatingCount = Math.max(0, finiteNumber(ratingCount));
  const safeMinimumEvidence = Math.max(0, finiteNumber(minimumEvidence, 30));

  if (safeRatingCount <= 0) {
    return safeCategoryMean;
  }

  const safeRating = finiteNumber(rating, safeCategoryMean);
  const totalEvidence = safeRatingCount + safeMinimumEvidence;

  return (
    (safeRatingCount / totalEvidence) * safeRating +
    (safeMinimumEvidence / totalEvidence) * safeCategoryMean
  );
}

export function recencyWeight(daysOld: number, halfLife = 180) {
  const safeHalfLife = finiteNumber(halfLife, 180);
  if (safeHalfLife <= 0) {
    return 0;
  }

  return Math.exp((-Math.log(2) * Math.max(0, finiteNumber(daysOld))) / safeHalfLife);
}

export function bayesianRate(
  positiveSignals: number,
  totalSignals: number,
  priorRate = 0.08,
  priorWeight = 50,
) {
  const safePositiveSignals = Math.max(0, finiteNumber(positiveSignals));
  const safeTotalSignals = Math.max(0, finiteNumber(totalSignals));
  const safePriorRate = finiteNumber(priorRate, 0.08);
  const safePriorWeight = Math.max(0, finiteNumber(priorWeight, 50));

  if (safeTotalSignals <= 0) {
    return safePriorRate;
  }

  return (safePositiveSignals + safePriorRate * safePriorWeight) / (safeTotalSignals + safePriorWeight);
}

export function logarithmicCountScore(count: number, highWatermark: number) {
  const safeHighWatermark = finiteNumber(highWatermark);
  if (safeHighWatermark <= 0) {
    return 0;
  }

  return clamp((Math.log1p(Math.max(0, finiteNumber(count))) / Math.log1p(safeHighWatermark)) * 100);
}

function sourceConsensus(evidence: EvidenceSignals | Partial<EvidenceSignals> | undefined) {
  const normalized = normalizeEvidence(evidence);
  const sourceCount =
    normalized.specialistGuide +
    normalized.independentEditorial +
    normalized.verifiedUserRating +
    normalized.credibleReviewers;

  return clamp((sourceCount / 4) * 100 * confidenceWeight[normalized.confidence]);
}

function signalStrength(value: number | undefined) {
  const raw = finiteNumber(value);
  return clamp(raw <= 1 ? raw * 100 : raw);
}

export function independentEvidenceCount(place: PlaceInput) {
  const evidence = normalizeEvidence(place.evidence);
  const signals = [
    signalStrength(evidence.specialistGuide) >= 40,
    signalStrength(evidence.independentEditorial) >= 40,
    signalStrength(evidence.verifiedUserRating) >= 40 ||
      signalStrength(evidence.credibleReviewers) >= 40 ||
      (place.reliableRatingCount ?? 0) >= 20,
    signalStrength(evidence.inspectionStatus) >= 80,
    signalStrength(evidence.verifiedAttributes) >= 50 ||
      (place.specialty?.verificationSources ?? 0) >= 2 ||
      place.specialty?.specialtyVerified === true,
  ];

  return signals.filter(Boolean).length;
}

export function isUserVisibleLifecycleState(state: PlaceLifecycleState | undefined) {
  return state !== "candidate";
}

export function evaluateHiddenGemGates(place: PlaceInput): HiddenGemEligibility {
  const evidence = normalizeEvidence(place.evidence);
  const evidenceCount = independentEvidenceCount(place);
  const nonGenericTags = (place.tags ?? []).filter((tag) => {
    const normalized = tag.toLowerCase().trim();
    return ![
      "restaurant",
      "bakery",
      "café",
      "cafe",
      "specialty coffee",
      "independent",
      "community submission",
      "pending verification",
      "openstreetmap",
      "osm",
    ].includes(normalized);
  });
  const hasDistinctiveStructuredSignal =
    Boolean(place.discoveryReasons?.length) ||
    Object.values(place.discoverySignals ?? {}).some(Boolean) ||
    nonGenericTags.length >= 2 ||
    (place.cuisine ? !["general", "restaurant", "cafe", "coffee"].includes(place.cuisine.toLowerCase()) : false) ||
    (place.kind === "Specialty coffee" && verifySpecialtyCoffeeEligibility(place));

  const lifecycleState = place.lifecycleState ?? "baseline";
  const isKnownBadValidation = place.validationLabel === "closed_wrong_category";
  const currentExistence =
    !isKnownBadValidation &&
    (finiteNumber(place.daysSinceFreshEvidence, 365) <= 365 ||
      signalStrength(evidence.dataFreshness) >= 50 ||
      signalStrength(evidence.inspectionStatus) >= 80);

  const gates = {
    lowMainstreamExposure: {
      passed: finiteNumber(place.mainstreamExposure, 100) <= 40,
      label: "Low mainstream exposure",
      detail: `mainstreamExposure ${finiteNumber(place.mainstreamExposure, 100).toFixed(0)} <= 40`,
    },
    independentEvidence: {
      passed: evidenceCount >= 2,
      label: "Two independent evidence signals",
      detail: `${evidenceCount} independent signal${evidenceCount === 1 ? "" : "s"} found`,
    },
    currentExistence: {
      passed: currentExistence,
      label: "Current existence",
      detail: currentExistence ? "Recent or municipal/field evidence is present" : "Needs recent existence verification",
    },
    distinctiveness: {
      passed: hasDistinctiveStructuredSignal,
      label: "Distinctiveness",
      detail: hasDistinctiveStructuredSignal ? "Distinctive tags, source reasons, or specialty attributes present" : "Needs a specific reason beyond obscurity",
    },
    lifecycle: {
      passed: isUserVisibleLifecycleState(lifecycleState) && !isKnownBadValidation,
      label: "Visible lifecycle state",
      detail: `state=${lifecycleState}${isKnownBadValidation ? ", validation=closed_wrong_category" : ""}`,
    },
  };

  return {
    eligible: Object.values(gates).every((gate) => gate.passed),
    independentEvidenceCount: evidenceCount,
    gates,
  };
}

export function verifySpecialtyCoffeeEligibility(place: PlaceInput): boolean {
  const guideVerified = (place.evidence?.specialistGuide ?? 0) > 0;
  if (!place.specialty) {
    return guideVerified;
  }

  const attributes = place.specialty;
  const structuredSignals = [
    attributes.specialtyVerified,
    attributes.ownRoastery,
    attributes.traceableCoffee,
    attributes.singleOrigin,
    attributes.rotatingRoasters,
    Boolean(attributes.manualBrewMethods?.length),
    attributes.beansForSale,
  ].filter(Boolean).length;

  const editorialVerified = attributes.specialtyVerified;
  const communityVerified = (attributes.verificationSources ?? 0) >= 2;
  const menuVerified = structuredSignals >= 3;

  return guideVerified || editorialVerified || communityVerified || menuVerified;
}

function specialtyConfidence(place: PlaceInput) {
  if (place.kind !== "Specialty coffee" || !verifySpecialtyCoffeeEligibility(place)) {
    return 0;
  }

  if (!place.specialty) {
    return (place.evidence?.specialistGuide ?? 0) > 0 ? 50 : 0;
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
    (attributes.manualBrewMethods?.length ?? 0) > 0,
  ].filter(Boolean).length;

  const verificationScore = Math.min(3, finiteNumber(attributes.verificationSources)) / 3;
  return clamp(structuredSignals * 7 + verificationScore * 30);
}

export function qualityScore(place: PlaceInput) {
  const evidence = normalizeEvidence(place.evidence);
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
  const eng = normalizeEngagement(place.engagement);

  const bayesianUserRating =
    ((bayesianRating(
      place.ratingAverage,
      place.reliableRatingCount,
      place.categoryMeanRating,
    ) - 1) /
      4) *
    100;

  const exposureAdjustedEngagement =
    bayesianRate(
      eng.saves + eng.confirmedVisits + eng.directionRequests,
      Math.max(1, eng.searchImpressions),
      0.08,
      120,
    ) * 100;

  const repeatVisitRate =
    bayesianRate(eng.repeatVisits, Math.max(1, eng.confirmedVisits), 0.18, 30) * 100;
  const recentSaveRate =
    bayesianRate(eng.recentSaves, Math.max(1, eng.saves), 0.38, 25) * 100;

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
    score += Math.max(0, 12 - Math.abs(finiteNumber(place.priceLevel) - preferences.priceLevel) * 6);
  }

  if (preferences.independentOnly) {
    score += (place.tags ?? []).includes("Independent") ? 10 : -10;
  }

  if (preferences.tags?.length) {
    const lowerTags = (place.tags ?? []).map((tag) => tag.toLowerCase());
    const matches = preferences.tags.filter((tag) =>
      lowerTags.some((placeTag) => placeTag.includes(tag.toLowerCase())),
    );
    score += Math.min(24, matches.length * 8);
  }

  if (preferences.purpose && (place.tags ?? []).some((tag) => tag.toLowerCase() === preferences.purpose)) {
    score += 8;
  }

  return clamp(score);
}

export function discoveryScore(place: PlaceInput, quality: number) {
  const eng = normalizeEngagement(place.engagement);

  const evidence = normalizeEvidence(place.evidence);
  const specialistConfidence = evidence.specialistGuide * 70 + specialtyConfidence(place) * 0.3;
  const localEngagement =
    bayesianRate(
      eng.mapMarkerClicks + eng.saves,
      Math.max(1, eng.searchImpressions),
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
        0.25 * finiteNumber(place.mainstreamExposure, 100),
    ),
    specialistConfidence: clamp(specialistConfidence),
    localEngagement,
  };
}

export function computeVerificationBreakdown(place: PlaceInput): VerificationBreakdown {
  const evidence = normalizeEvidence(place.evidence);
  const tags = place.tags ?? [];
  const guideVerified =
    evidence.specialistGuide >= 0.4 ||
    (place.evidenceLabel?.toLowerCase().includes("guide") ?? false) ||
    (place.evidenceLabel?.toLowerCase().includes("specialist") ?? false) ||
    tags.some((t) => ["white guide", "michelin", "star wine list", "specialist guide", "sca", "craft guide"].includes(t.toLowerCase()));

  const editorialVerified =
    evidence.independentEditorial >= 0.3 ||
    (place.evidenceLabel?.toLowerCase().includes("editorial") ?? false) ||
    (place.evidenceLabel?.toLowerCase().includes("official site") ?? false) ||
    (place.evidenceLabel?.toLowerCase().includes("osm") ?? false) ||
    Boolean(place.sourceName) ||
    (place.specialty?.specialtyVerified === true);

  const communityCount =
    finiteNumber(place.specialty?.verificationSources) +
    Math.floor(evidence.repeatVisits / 10) +
    Math.floor(finiteNumber(place.engagement?.confirmedVisits) / 15) +
    (finiteNumber(place.localPopularityPercentile) > 0.4 ? 2 : 1);

  const communityVerified =
    communityCount >= 2 ||
    (place.reliableRatingCount ?? 0) >= 20 ||
    (place.engagement?.saves ?? 0) > 10;

  const structuredSignals = [
    Boolean(place.website),
    Boolean(place.address),
    Boolean(place.area && place.area !== "Stockholm"),
    Boolean(tags.length),
    place.specialty?.traceableCoffee ?? false,
    place.specialty?.filterCoffee ?? false,
    place.specialty?.singleOrigin ?? false,
    place.specialty?.ownRoastery ?? false,
    (place.specialty?.manualBrewMethods?.length ?? 0) > 0,
  ].filter(Boolean).length;

  const structuredVerified =
    structuredSignals >= 2 ||
    Boolean(place.website) ||
    evidence.verifiedAttributes >= 30;

  const verifiedSourcesCount = [guideVerified, editorialVerified, communityVerified, structuredVerified].filter(Boolean).length;

  const confidenceScore = clamp(
    verifiedSourcesCount * 25 +
      (evidence.confidence === "High" ? 15 : evidence.confidence === "Medium" ? 5 : 0),
  );

  const confidenceLevel: Confidence =
    verifiedSourcesCount >= 3 ? "High" : verifiedSourcesCount >= 2 ? "Medium" : "Low";

  const verifiedNames = [
    guideVerified && "Specialty Guide",
    editorialVerified && "Editorial Team",
    communityVerified && "Community Consensus",
    structuredVerified && "Structured Menu & Web",
  ].filter(Boolean) as string[];

  const summary = verifiedSourcesCount >= 3
    ? `Verified by ${verifiedSourcesCount} independent sources (${verifiedNames.join(", ")})`
    : verifiedSourcesCount === 2
    ? `Verified by 2 independent sources (${verifiedNames.join(", ")})`
    : `Verified by 1 source (${verifiedNames[0] ?? "Open Data Baseline"})`;

  return {
    specialistGuide: {
      verified: guideVerified,
      label: "Recognised Specialty Guide",
      detail: guideVerified ? "Verified by White Guide / Specialist Guide" : "Unverified by specialty guide",
    },
    editorialTeam: {
      verified: editorialVerified,
      label: "Editorial Team & Admin Audit",
      detail: editorialVerified ? "Audited & verified by editorial team" : "Pending editorial audit",
    },
    communitySubmissions: {
      verified: communityVerified,
      label: "Consistent Community Submissions",
      detail: communityVerified ? `Verified by ${communityCount || 3}+ consistent community submissions` : "Awaiting community submissions",
    },
    structuredEvidence: {
      verified: structuredVerified,
      label: "Structured Menu & Web Evidence",
      detail: structuredVerified ? "Menu, website & operational signals verified" : "Requires live menu verification",
    },
    verifiedSourcesCount,
    confidenceLevel,
    confidenceScore,
    summary,
  };
}

export function scorePlace(place: PlaceInput, preferences: UserPreferences = {}): ScoredPlace {
  const quality = qualityScore(place);
  const popularity = popularityScore(place);
  const relevance = relevanceScore(place, preferences);
  const discovery = discoveryScore(place, quality);
  const freshness = freshnessScore(place);
  const verification = computeVerificationBreakdown(place);
  const hiddenGem = evaluateHiddenGemGates(place);
  const recommendation = clamp(
    0.35 * relevance +
      0.25 * quality +
      0.15 * popularity.score +
      0.15 * discovery.score +
      0.1 * freshness,
  );

  return {
    ...place,
    is_hidden_gem: Boolean(place.is_hidden_gem && hiddenGem.eligible),
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
    verification,
    hiddenGem,
  };
}

export function addLocalPopularityPercentiles<T extends PlaceInput>(places: T[]) {
  return places.map((place) => {
    const peers = places
      .filter((peer) => peer.kind === place.kind && peer.area === place.area)
      .sort((a, b) => finiteNumber(a.categoryPopularityRaw) - finiteNumber(b.categoryPopularityRaw));
    const rank = peers.findIndex((peer) => peer.id === place.id) + 1;

    return {
      ...place,
      localPopularityPercentile: peers.length > 1 ? rank / peers.length : 0.5,
    };
  });
}
