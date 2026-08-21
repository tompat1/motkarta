import assert from "node:assert/strict";
import test from "node:test";

import { processConciergeQuery } from "../functions/api/concierge.ts";
import { onRequestGet as getPhotos } from "../functions/api/photos.ts";
import { onRequestGet as getPlaces } from "../functions/api/places.ts";
import { onRequestGet as getReviews } from "../functions/api/reviews.ts";

test("places API does not serve demo fallback unless explicitly enabled", async () => {
  const blocked = await getPlaces({ env: {} });
  const blockedPayload = await blocked.json();

  assert.equal(blocked.status, 503);
  assert.equal(blockedPayload.source, "unavailable");
  assert.deepEqual(blockedPayload.places, []);

  const allowed = await getPlaces({ env: { ALLOW_DEMO_FALLBACK: "true" } });
  const allowedPayload = await allowed.json();

  assert.equal(allowed.status, 200);
  assert.equal(allowedPayload.source, "demo");
  assert.ok(allowedPayload.places.length > 0);
});

test("concierge refuses illustrative recommendations when live dataset is missing", async () => {
  const blocked = await processConciergeQuery("specialty coffee");
  const blockedPayload = await blocked.json();

  assert.equal(blocked.status, 503);
  assert.equal(blockedPayload.source, "unavailable");
  assert.deepEqual(blockedPayload.recommendedPlaces, []);
  assert.match(blockedPayload.answer, /demo fallback is disabled/i);
});

test("lazy media APIs do not serve fallback fixtures unless demo mode is enabled", async () => {
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

  const allowedReviews = await getReviews({
    request: reviewRequest,
    env: { ALLOW_DEMO_FALLBACK: "true" },
  });
  const allowedReviewPayload = await allowedReviews.json();
  assert.equal(allowedReviewPayload.source, "demo");
  assert.ok(allowedReviewPayload.reviews.length > 0);

  const allowedPhotos = await getPhotos({
    request: photoRequest,
    env: { ALLOW_DEMO_FALLBACK: "true" },
  });
  const allowedPhotoPayload = await allowedPhotos.json();
  assert.equal(allowedPhotoPayload.source, "demo");
  assert.ok(allowedPhotoPayload.photos.length > 0);
});
