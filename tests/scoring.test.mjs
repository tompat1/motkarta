import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  bayesianRating,
  bayesianRate,
  evaluateHiddenGemGates,
  recencyWeight,
  scorePlace,
  verifySpecialtyCoffeeEligibility,
} from "../lib/scoring.ts";

test("bayesian rating tempers tiny sample sizes", () => {
  const tinyPerfectSample = bayesianRating(5, 3, 4.1, 30);
  const strongLargeSample = bayesianRating(4.6, 300, 4.1, 30);

  assert.ok(tinyPerfectSample < strongLargeSample);
});

test("bayesian rating prevents winner-take-all bias for central high-volume cafes", () => {
  const centralCafe = bayesianRating(4.2, 8000, 4.1, 30); // ~4.199
  const localBakery = bayesianRating(4.8, 45, 4.1, 30);   // ~4.520
  const newSpecialty = bayesianRating(4.9, 12, 4.1, 30);  // ~4.328

  assert.ok(localBakery > newSpecialty);
  assert.ok(newSpecialty > centralCafe);
});

test("recency half-life halves signal after the configured period", () => {
  assert.equal(Math.round(recencyWeight(0, 180) * 100), 100);
  assert.equal(Math.round(recencyWeight(180, 180) * 100), 50);
  assert.equal(Math.round(recencyWeight(360, 180) * 100), 25);
});

test("exposure-adjusted rate rewards efficient engagement", () => {
  const smallEfficientPlace = bayesianRate(50, 200, 0.08, 50);
  const famousLowYieldPlace = bayesianRate(800, 20_000, 0.08, 50);

  assert.ok(smallEfficientPlace > famousLowYieldPlace);
});

test("places receive all promised score dimensions", () => {
  const samplePlace = {
    id: 1,
    name: "Sample Roastery",
    kind: "Specialty coffee",
    cuisine: "coffee",
    area: "Södermalm",
    tags: ["Filter", "Single origin", "Specialty coffee"],
    ratingAverage: 4.6,
    reliableRatingCount: 200,
    reviewCount: 250,
    categoryMeanRating: 4.2,
    categoryPopularityRaw: 0.8,
    localPopularityPercentile: 75,
    mainstreamExposure: 30,
    ageDays: 1000,
    daysSinceFreshEvidence: 30,
    evidence: {
      specialistGuide: 1,
      independentEditorial: 1,
      verifiedUserRating: 1,
      repeatVisits: 80,
      recentReviews: 80,
      credibleReviewers: 80,
      inspectionStatus: 90,
      verifiedAttributes: 85,
      dataFreshness: 80,
      confidence: "High",
    },
    engagement: {
      searchImpressions: 1000,
      profileViews: 200,
      mapMarkerClicks: 100,
      saves: 50,
      directionRequests: 30,
      confirmedVisits: 20,
      repeatVisits: 10,
      recommendations: 5,
      recentSaves: 10,
    },
  };
  const scored = scorePlace(samplePlace, { kind: "Specialty coffee", tags: ["filter"] });

  assert.ok(scored.scores.quality > 0);
  assert.ok(scored.scores.popularity > 0);
  assert.ok(scored.scores.relevance > 0);
  assert.ok(scored.scores.discovery > 0);
  assert.ok(scored.scores.freshness > 0);
  assert.ok(scored.scores.recommendation > 0);
});

test("partial evidence records score as finite neutral values instead of NaN", () => {
  const scored = scorePlace({
    id: 2022635109,
    name: "Pascal Café & Bakery",
    kind: "Specialty coffee",
    cuisine: "coffee",
    area: "Södermalm",
    note: "Curated specialty venue",
    tags: ["Filter", "Single origin", "Specialty coffee"],
    evidenceLabel: "Specialist guide",
    ratingAverage: 0,
    reliableRatingCount: 0,
    reviewCount: 0,
    categoryMeanRating: 0,
    categoryPopularityRaw: 0,
    localPopularityPercentile: 0,
    priceLevel: 2,
    mainstreamExposure: 40,
    ageDays: 365,
    daysSinceFreshEvidence: 15,
    evidence: {
      specialistGuide: 1,
      independentEditorial: 1,
      verifiedAttributes: 90,
      dataFreshness: 95,
      confidence: "High",
    },
  });

  for (const [key, value] of Object.entries(scored.scores)) {
    assert.equal(Number.isFinite(value), true, `${key} should be finite`);
  }
});

test("static production places never produce non-finite score dimensions", async () => {
  const payload = JSON.parse(await readFile(new URL("../public/data/places.json", import.meta.url), "utf8"));
  const places = Array.isArray(payload) ? payload : payload.places;
  const failures = [];

  for (const place of places) {
    const scored = scorePlace(place);
    for (const [key, value] of Object.entries(scored.scores)) {
      if (!Number.isFinite(value)) {
        failures.push(`${place.id} ${place.name} ${key}=${String(value)}`);
      }
    }
  }

  assert.deepEqual(failures, []);
});

test("specialty coffee verification requires explicit gates, rejecting marketing text", () => {
  const unverified = {
    id: 1,
    name: "Marketing Copy Cafe",
    kind: "Specialty coffee",
    area: "Vasastan",
    note: "Serves premium coffee",
    tags: ["Coffee"],
    evidence: { specialistGuide: 0 },
    specialty: {
      specialtyVerified: false,
      ownRoastery: false,
      traceableCoffee: false,
      singleOrigin: false,
      rotatingRoasters: false,
      manualBrewMethods: [],
      beansForSale: false,
      verificationSources: 0,
    },
  };
  const guideVerified = { ...unverified, evidence: { specialistGuide: 1 } };
  assert.equal(verifySpecialtyCoffeeEligibility(guideVerified), true);
});

test("discovery score requires strong quality evidence and does not reward simple obscurity", () => {
  const unknownNoQuality = scorePlace({
    id: 100,
    name: "Obscure Place",
    kind: "Restaurant",
    area: "Farsta",
    note: "",
    tags: [],
    mainstreamExposure: 0,
    evidenceLabel: "Low confidence",
    ratingAverage: 4.0,
    reliableRatingCount: 0,
    reviewCount: 0,
    categoryMeanRating: 4.1,
    categoryPopularityRaw: 0,
    localPopularityPercentile: 0,
    priceLevel: 2,
    ageDays: 300,
    daysSinceFreshEvidence: 300,
    evidence: {
      specialistGuide: 0,
      independentEditorial: 0,
      verifiedUserRating: 0,
      repeatVisits: 0,
      recentReviews: 0,
      credibleReviewers: 0,
      inspectionStatus: 60,
      verifiedAttributes: 0,
      dataFreshness: 0,
      confidence: "Low",
    },
  });

  const hiddenGem = scorePlace({
    id: 101,
    name: "Real Hidden Gem",
    kind: "Specialty coffee",
    area: "Farsta",
    note: "Great coffee",
    tags: ["Filter"],
    mainstreamExposure: 5,
    evidenceLabel: "High confidence",
    ratingAverage: 4.8,
    reliableRatingCount: 50,
    reviewCount: 60,
    categoryMeanRating: 4.1,
    categoryPopularityRaw: 50,
    localPopularityPercentile: 0.8,
    priceLevel: 2,
    ageDays: 30,
    daysSinceFreshEvidence: 10,
    evidence: {
      specialistGuide: 1,
      independentEditorial: 1,
      verifiedUserRating: 85,
      repeatVisits: 80,
      recentReviews: 80,
      credibleReviewers: 85,
      inspectionStatus: 90,
      verifiedAttributes: 80,
      dataFreshness: 90,
      confidence: "High",
    },
    specialty: {
      specialtyVerified: true,
      ownRoastery: false,
      traceableCoffee: true,
      filterCoffee: true,
      espressoBased: true,
      rotatingRoasters: true,
      singleOrigin: true,
      manualBrewMethods: ["V60"],
      decafAvailable: true,
      beansForSale: true,
      verificationSources: 3,
    },
  });

  assert.ok(hiddenGem.scores.discovery > unknownNoQuality.scores.discovery);
  assert.equal(unknownNoQuality.hiddenGem.eligible, false);
  assert.equal(hiddenGem.hiddenGem.eligible, true);
});

test("hidden gem gates require evidence, current existence, distinctiveness, and visible lifecycle", () => {
  const basePlace = {
    id: 200,
    name: "Gated Gem",
    kind: "Restaurant",
    cuisine: "regional",
    area: "Farsta",
    note: "Small regional kitchen.",
    tags: ["Regional", "Fermentation"],
    mainstreamExposure: 12,
    evidenceLabel: "Specialist guide · Stockholms stad",
    ratingAverage: 4.1,
    reliableRatingCount: 0,
    reviewCount: 0,
    categoryMeanRating: 4.1,
    categoryPopularityRaw: 0,
    localPopularityPercentile: 0.2,
    priceLevel: 2,
    ageDays: 40,
    daysSinceFreshEvidence: 30,
    evidence: {
      specialistGuide: 1,
      independentEditorial: 0,
      verifiedUserRating: 0,
      repeatVisits: 0,
      recentReviews: 0,
      credibleReviewers: 0,
      inspectionStatus: 90,
      verifiedAttributes: 0,
      dataFreshness: 90,
      confidence: "Medium",
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
  };

  assert.equal(evaluateHiddenGemGates(basePlace).eligible, true);
  assert.equal(evaluateHiddenGemGates({ ...basePlace, mainstreamExposure: 75 }).eligible, false);
  assert.equal(evaluateHiddenGemGates({ ...basePlace, tags: ["Restaurant"], cuisine: "general" }).eligible, false);
  assert.equal(evaluateHiddenGemGates({ ...basePlace, lifecycleState: "candidate" }).eligible, false);
});
