import assert from "node:assert/strict";
import test from "node:test";

import {
  fetchPlacePhotos,
  fetchPlaceReviews,
  getFallbackPhotos,
  getFallbackReviews,
} from "../lib/lazy-media.ts";

test("getFallbackReviews returns valid review objects with audit source tags", () => {
  const reviews = getFallbackReviews(1);

  assert.ok(Array.isArray(reviews));
  assert.ok(reviews.length >= 2);
  assert.equal(reviews[0].placeId, 1);
  assert.ok(reviews[0].author);
  assert.ok(reviews[0].source);
  assert.equal(reviews[0].verified, true);
});

test("getFallbackPhotos does not return hard-coded external venue photos", () => {
  const photos = getFallbackPhotos({ id: 10, name: "Restaurang Frantzén" });

  assert.ok(Array.isArray(photos));
  assert.equal(photos.length, 0);
});

test("getFallbackPhotos returns empty array when no verified venue photo exists", () => {
  const unknownContext = { id: 9999, name: "Unknown Place" };
  const photos = getFallbackPhotos(unknownContext);

  assert.ok(Array.isArray(photos));
  assert.equal(photos.length, 0);
});

test("fetchPlaceReviews caches results in-memory", async () => {
  const reviews1 = await fetchPlaceReviews(42);
  const reviews2 = await fetchPlaceReviews(42);

  assert.equal(reviews1, reviews2);
});

test("fetchPlacePhotos caches results in-memory", async () => {
  const photos1 = await fetchPlacePhotos(42);
  const photos2 = await fetchPlacePhotos(42);

  assert.equal(photos1, photos2);
});
