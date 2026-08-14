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

test("getFallbackPhotos returns high quality photo objects with captions and credits", () => {
  const photos = getFallbackPhotos(1);

  assert.ok(Array.isArray(photos));
  assert.ok(photos.length >= 3);
  assert.equal(photos[0].placeId, 1);
  assert.ok(photos[0].url.startsWith("http"));
  assert.ok(photos[0].thumbnailUrl.startsWith("http"));
  assert.ok(photos[0].caption);
});

test("getFallbackPhotos returns Mexican taco photos for Mexican places", () => {
  const mexicanContext = { id: 10, name: "La Neta", kind: "Restaurant", cuisine: "mexican", tags: ["tacos"] };
  const photos = getFallbackPhotos(mexicanContext);

  assert.ok(photos.some((p) => p.caption.toLowerCase().includes("tacos")));
});

test("getFallbackPhotos returns Pierogi photos for Polish places", () => {
  const polishContext = { id: 11, name: "Pyza II", kind: "Restaurant", cuisine: "polish", tags: ["pierogi"] };
  const photos = getFallbackPhotos(polishContext);

  assert.ok(photos.some((p) => p.caption.toLowerCase().includes("pierogi")));
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
