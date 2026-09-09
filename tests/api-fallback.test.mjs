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

test("places API falls back to env.ASSETS when D1 database is unbound or empty", async () => {
  const mockPlaces = [{ id: 101, name: "Asset Roasters", kind: "Specialty coffee", area: "Södermalm", scores: {} }];
  const request = new Request("https://motkarta.test/api/places");
  const env = {
    ASSETS: {
      fetch: async (url) => {
        assert.ok(String(url).endsWith("/data/places.json"));
        return new Response(JSON.stringify(mockPlaces), { status: 200, headers: { "content-type": "application/json" } });
      },
    },
  };

  const response = await getPlaces({ request, env });
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.source, "published_dataset");
  assert.equal(payload.places.length, 1);
  assert.equal(payload.places[0].name, "Asset Roasters");
});

test("concierge falls back to env.ASSETS when live dataset is missing in D1", async () => {
  const mockPlaces = [
    {
      id: 202,
      name: "Drop Coffee",
      kind: "Specialty coffee",
      area: "Södermalm",
      cuisine: "coffee",
      tags: ["coffee", "filter", "specialty"],
      scores: { recommendation: 95 },
      evidence: { confidence: "High" },
    },
  ];
  const env = {
    ASSETS: {
      fetch: async (url) => {
        assert.ok(String(url).endsWith("/data/places.json"));
        return new Response(JSON.stringify(mockPlaces), { status: 200, headers: { "content-type": "application/json" } });
      },
    },
  };

  const response = await processConciergeQuery(
    "Drop Coffee",
    env,
    { language: "sv" },
    false,
    "https://motkarta.test/api/concierge",
  );
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.status, "ok");
  assert.equal(payload.source, "published_dataset");
  assert.equal(payload.recommendedPlaces.length, 1);
  assert.equal(payload.recommendedPlaces[0].name, "Drop Coffee");
});

