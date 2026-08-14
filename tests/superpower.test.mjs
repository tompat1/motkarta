import assert from "node:assert/strict";
import test from "node:test";

import { retrieveAndSynthesize } from "../functions/api/concierge.ts";
import { parseConciergeAnswer } from "../lib/concierge-parser.ts";
import { addUserPhoto, addUserReview, fetchPlacePhotos, fetchPlaceReviews } from "../lib/lazy-media.ts";

const mockPlaces = [
  {
    id: 101,
    name: "Oaxen Slip",
    kind: "Restaurant",
    cuisine: "swedish",
    area: "Djurgården",
    address: "Beckholmsvägen 26",
    note: "Nordic bistro on the waterfront.",
    tags: ["Bistro", "Waterfront"],
    evidenceLabel: "OSM",
    ratingAverage: 4.8,
    reliableRatingCount: 100,
    reviewCount: 120,
    categoryMeanRating: 4.2,
    categoryPopularityRaw: 0.8,
    localPopularityPercentile: 70,
    priceLevel: 3,
    mainstreamExposure: 50,
    ageDays: 1000,
    daysSinceFreshEvidence: 10,
    evidence: {
      specialistGuide: 1,
      independentEditorial: 1,
      verifiedUserRating: 1,
      repeatVisits: 80,
      recentReviews: 90,
      credibleReviewers: 85,
      inspectionStatus: 100,
      verifiedAttributes: 90,
      dataFreshness: 90,
      confidence: "High",
    },
    latitude: 59.3245,
    longitude: 18.0984,
    engagement: {
      searchImpressions: 1000,
      profileViews: 300,
      mapMarkerClicks: 150,
      saves: 50,
      directionRequests: 40,
      confirmedVisits: 30,
      repeatVisits: 10,
      recommendations: 12,
      recentSaves: 20,
    },
    x: 50,
    y: 50,
  },
];

test("retrieveAndSynthesize detects add place superpower prompt", () => {
  const res = retrieveAndSynthesize("Lägg till ställe Oaxen Slip", mockPlaces);
  assert.ok(res.answer.includes("SUPERPOWER_ACTION: add_place"));

  const parsed = parseConciergeAnswer(res.answer);
  assert.equal(parsed.superpowerAction, "add_place");
});

test("retrieveAndSynthesize detects review superpower prompt", () => {
  const res = retrieveAndSynthesize("Skriv recension för Oaxen", mockPlaces);
  assert.ok(res.answer.includes("SUPERPOWER_ACTION: add_review"));

  const parsed = parseConciergeAnswer(res.answer);
  assert.equal(parsed.superpowerAction, "add_review");
});

test("retrieveAndSynthesize detects photo superpower prompt", () => {
  const res = retrieveAndSynthesize("Lägg till foto för Oaxen", mockPlaces);
  assert.ok(res.answer.includes("SUPERPOWER_ACTION: add_photo"));

  const parsed = parseConciergeAnswer(res.answer);
  assert.equal(parsed.superpowerAction, "add_photo");
});

test("addUserReview and addUserPhoto dynamically enrich place media", async () => {
  const newRev = addUserReview(101, {
    author: "Test User",
    rating: 5,
    source: "Verified Local",
    content: "Fantastisk mat och utsikt över Beckholmen!",
  });

  assert.equal(newRev.placeId, 101);
  assert.equal(newRev.author, "Test User");

  const reviews = await fetchPlaceReviews(mockPlaces[0]);
  assert.ok(reviews.some((r) => r.content.includes("Beckholmen")));

  const newPhoto = addUserPhoto(101, {
    url: "https://example.com/oaxen.jpg",
    thumbnailUrl: "https://example.com/oaxen_thumb.jpg",
    caption: "Utsikt över Djurgården",
  });

  assert.equal(newPhoto.placeId, 101);

  const photos = await fetchPlacePhotos(mockPlaces[0]);
  assert.ok(photos.some((p) => p.caption.includes("Djurgården")));
});
