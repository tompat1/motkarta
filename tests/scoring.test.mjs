import assert from "node:assert/strict";
import test from "node:test";

import {
  bayesianRating,
  bayesianRate,
  recencyWeight,
  scorePlace,
} from "../lib/scoring.ts";
import { demoPlaces } from "../lib/demo-places.ts";

test("bayesian rating tempers tiny sample sizes", () => {
  const tinyPerfectSample = bayesianRating(5, 3, 4.1, 30);
  const strongLargeSample = bayesianRating(4.6, 300, 4.1, 30);

  assert.ok(tinyPerfectSample < strongLargeSample);
});

test("recency half-life halves signal after the configured period", () => {
  assert.equal(Math.round(recencyWeight(180, 180) * 100), 50);
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
