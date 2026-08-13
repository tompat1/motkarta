import assert from "node:assert/strict";
import test from "node:test";

import {
  bayesianRating,
  bayesianRate,
  recencyWeight,
  scorePlace,
  verifySpecialtyCoffeeEligibility,
} from "../lib/scoring.ts";
import { demoPlaces } from "../lib/demo-places.ts";

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
  const scored = scorePlace(demoPlaces[0], { kind: "Specialty coffee", tags: ["filter"] });

  assert.ok(scored.scores.quality > 0);
  assert.ok(scored.scores.popularity > 0);
  assert.ok(scored.scores.relevance > 0);
  assert.ok(scored.scores.discovery > 0);
  assert.ok(scored.scores.freshness > 0);
  assert.ok(scored.scores.recommendation > 0);
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
  assert.equal(verifySpecialtyCoffeeEligibility(unverified), false);

  const guideVerified = { ...unverified, evidence: { specialistGuide: 1 } };
  assert.equal(verifySpecialtyCoffeeEligibility(guideVerified), true);
});
