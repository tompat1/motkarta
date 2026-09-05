import test from "node:test";
import assert from "node:assert/strict";
import {
  comparePlaces,
  distanceFromPoint,
  filterPlacesByRankingMode,
  modeScore,
  stockholmCenter,
  visibleModes,
} from "../src/app/place-ranking.ts";

function scoredPlace(overrides = {}) {
  return {
    id: 1,
    name: "Test Place",
    kind: "Restaurant",
    area: "Södermalm",
    note: "",
    tags: [],
    evidenceLabel: "Open data",
    ratingAverage: 4,
    reliableRatingCount: 0,
    reviewCount: 0,
    categoryMeanRating: 4,
    categoryPopularityRaw: 0,
    localPopularityPercentile: 0,
    priceLevel: 2,
    mainstreamExposure: 0,
    ageDays: 365,
    daysSinceFreshEvidence: 90,
    evidence: {
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
    },
    engagement: {
      searchImpressions: 0,
      profileViews: 0,
      mapMarkerClicks: 0,
      saves: 0,
      directionRequests: 0,
      confirmedVisits: 0,
      repeatVisits: 0,
      recommendations: 0,
      recentSaves: 0,
    },
    scores: {
      quality: 50,
      popularity: 50,
      relevance: 50,
      discovery: 50,
      freshness: 50,
      recommendation: 50,
      bayesianUserRating: 50,
      exposureAdjustedEngagement: 50,
      repeatVisitRate: 50,
      recentSaveRate: 50,
      crossSourceConsensus: 50,
      specialistConfidence: 50,
      localEngagement: 50,
    },
    verification: {
      verifiedSourcesCount: 0,
      confidenceLevel: "Low",
      confidenceScore: 20,
      summary: "",
      specialistGuide: { verified: false, label: "", detail: "" },
      editorialTeam: { verified: false, label: "", detail: "" },
      communitySubmissions: { verified: false, label: "", detail: "" },
      structuredEvidence: { verified: false, label: "", detail: "" },
    },
    hiddenGem: {
      eligible: false,
      independentEvidenceCount: 0,
      gates: {},
    },
    x: 0,
    y: 0,
    ...overrides,
  };
}

function sortedIds(places, mode, sortMode, seed = 1, center = stockholmCenter) {
  return [...places].sort((a, b) => comparePlaces(a, b, mode, sortMode, seed, center)).map((place) => place.id);
}

test("ranking controls produce distinct top results", () => {
  const places = [
    scoredPlace({
      id: 1,
      name: "Alpha Close",
      latitude: 59.3294,
      longitude: 18.0687,
      scores: { ...scoredPlace().scores, recommendation: 60, quality: 55, popularity: 45, discovery: 40 },
    }),
    scoredPlace({
      id: 2,
      name: "Bravo Match",
      latitude: 59.36,
      longitude: 18.09,
      scores: { ...scoredPlace().scores, recommendation: 95, quality: 70, popularity: 95, discovery: 65 },
    }),
    scoredPlace({
      id: 3,
      name: "Charlie Quality",
      latitude: 59.34,
      longitude: 18.08,
      scores: { ...scoredPlace().scores, recommendation: 75, quality: 98, popularity: 40, discovery: 70 },
    }),
  ];

  assert.equal(sortedIds(places, "All recommendations", "Motkarta score")[0], 2);
  assert.equal(sortedIds(places, "Quality first", "Motkarta score")[0], 3);
  assert.equal(sortedIds(places, "All recommendations", "Distance")[0], 1);
  assert.equal(sortedIds(places, "All recommendations", "Alphabetical")[0], 1);
});

test("motkarta score mode ties are broken by mode-specific evidence", () => {
  const broadMatch = scoredPlace({
    id: 1,
    name: "Broad Match",
    lastUpdated: "2025-01-01T00:00:00Z",
    evidence: { ...scoredPlace().evidence, confidence: "High" },
    scores: { ...scoredPlace().scores, recommendation: 92, quality: 78 },
    verification: { ...scoredPlace().verification, verifiedSourcesCount: 1, confidenceLevel: "High", confidenceScore: 100 },
  });
  const deeplyVerified = scoredPlace({
    id: 2,
    name: "Deeply Verified",
    lastUpdated: "2026-08-01T00:00:00Z",
    evidence: {
      ...scoredPlace().evidence,
      confidence: "High",
      specialistGuide: 1,
      independentEditorial: 1,
      inspectionStatus: 1,
      verifiedAttributes: 1,
    },
    scores: { ...scoredPlace().scores, recommendation: 82, quality: 88 },
    verification: { ...scoredPlace().verification, verifiedSourcesCount: 4, confidenceLevel: "High", confidenceScore: 100 },
    hiddenGem: { ...scoredPlace().hiddenGem, independentEvidenceCount: 3 },
  });

  assert.equal(modeScore(broadMatch, "Most verified"), modeScore(deeplyVerified, "Most verified"));
  assert.equal(sortedIds([broadMatch, deeplyVerified], "Most verified", "Motkarta score")[0], 2);
});

test("ranking mode menu omits modes without backing public data", () => {
  assert.equal(visibleModes.includes("All recommendations"), true);
  assert.equal(visibleModes.includes("Local favourites"), false);
  assert.equal(visibleModes.includes("Quality first"), false);
  assert.equal(visibleModes.includes("Recently opened"), false);
  assert.equal(visibleModes.includes("Hidden gems"), true);
});

test("hidden-gem mode prioritizes eligible places before discovery score", () => {
  const ineligibleHighDiscovery = scoredPlace({
    id: 1,
    name: "High Discovery",
    scores: { ...scoredPlace().scores, discovery: 99 },
    hiddenGem: { ...scoredPlace().hiddenGem, eligible: false },
  });
  const eligibleDiscovery = scoredPlace({
    id: 2,
    name: "Eligible Discovery",
    scores: { ...scoredPlace().scores, discovery: 70 },
    hiddenGem: { ...scoredPlace().hiddenGem, eligible: true },
  });

  assert.equal(sortedIds([ineligibleHighDiscovery, eligibleDiscovery], "Hidden gems", "Motkarta score")[0], 2);
});

test("ranking modes narrow the result set before sorting", () => {
  const places = [
    scoredPlace({ id: 1, name: "General Match", scores: { ...scoredPlace().scores, popularity: 5 } }),
    scoredPlace({
      id: 2,
      name: "Hidden Gem",
      hiddenGem: { ...scoredPlace().hiddenGem, eligible: true },
      scores: { ...scoredPlace().scores, popularity: 80 },
    }),
    scoredPlace({
      id: 3,
      name: "Expert Pick",
      evidence: { ...scoredPlace().evidence, specialistGuide: 1 },
      scores: { ...scoredPlace().scores, popularity: 70 },
    }),
    scoredPlace({
      id: 4,
      name: "Most Verified",
      evidence: { ...scoredPlace().evidence, confidence: "High" },
      scores: { ...scoredPlace().scores, popularity: 60 },
    }),
  ];

  assert.deepEqual(filterPlacesByRankingMode(places, "All recommendations").map((place) => place.id), [1, 2, 3, 4]);
  assert.deepEqual(filterPlacesByRankingMode(places, "Hidden gems").map((place) => place.id), [2]);
  assert.deepEqual(filterPlacesByRankingMode(places, "Expert selected").map((place) => place.id), [3]);
  assert.deepEqual(filterPlacesByRankingMode(places, "Most verified").map((place) => place.id), [4]);
  assert.deepEqual(filterPlacesByRankingMode(places, "Popular now").map((place) => place.id), [2]);
});

test("distance calculation remains centered on Stockholm by default", () => {
  const close = scoredPlace({ latitude: 59.3294, longitude: 18.0687 });
  const far = scoredPlace({ latitude: 59.36, longitude: 18.09 });

  assert.ok(distanceFromPoint(close) < distanceFromPoint(far));
});
