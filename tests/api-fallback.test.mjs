import assert from "node:assert/strict";
import test from "node:test";

import { processConciergeQuery } from "../functions/api/concierge.ts";
import { onRequestGet as getPhotos } from "../functions/api/photos.ts";
import { onRequestGet as getPlaces } from "../functions/api/places.ts";
import { onRequestGet as getReviews } from "../functions/api/reviews.ts";

test("places API rejects with 503 when D1 database is unbound", async () => {
  const response = await getPlaces({ env: {} });
  const payload = await response.json();

  assert.equal(response.status, 503);
  assert.equal(payload.source, "unavailable");
  assert.deepEqual(payload.places, []);
});

test("concierge refuses recommendations when live dataset is missing", async () => {
  const blocked = await processConciergeQuery("specialty coffee");
  const blockedPayload = await blocked.json();

  assert.equal(blocked.status, 503);
  assert.equal(blockedPayload.source, "unavailable");
  assert.deepEqual(blockedPayload.recommendedPlaces, []);
  assert.match(blockedPayload.answer, /live Motkarta dataset is unavailable/i);
});

test("lazy media APIs return unavailable with empty arrays when D1 records are absent", async () => {
  const reviewRequest = new Request("https://motkarta.test/api/reviews?place_id=10&name=Restaurang%20Frantz%C3%A9n");
  const photoRequest = new Request("https://motkarta.test/api/photos?place_id=10&name=Restaurang%20Frantz%C3%A9n");

  const blockedReviews = await getReviews({ request: reviewRequest, env: {} });
  const blockedReviewPayload = await blockedReviews.json();
  assert.equal(blockedReviews.status, 200);
  assert.equal(blockedReviewPayload.source, "unavailable");
  assert.deepEqual(blockedReviewPayload.reviews, []);

  const blockedPhotos = await getPhotos({ request: photoRequest, env: {} });
  const blockedPhotoPayload = await blockedPhotos.json();
  assert.equal(blockedPhotos.status, 200);
  assert.equal(blockedPhotoPayload.source, "unavailable");
  assert.deepEqual(blockedPhotoPayload.photos, []);
});
