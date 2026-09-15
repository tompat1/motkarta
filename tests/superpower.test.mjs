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
    source: "Community Submission",
    content: "Fantastisk mat och utsikt över Beckholmen!",
  });

  assert.equal(newRev.placeId, 101);
  assert.equal(newRev.author, "Test User");
  assert.equal(newRev.verified, false);

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

test("addUserPhoto accepts device uploaded base64 data URLs", async () => {
  const sampleBase64 = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP...";
  const newPhoto = addUserPhoto(101, {
    url: sampleBase64,
    thumbnailUrl: sampleBase64,
    caption: "Färsk croissant från ugnen",
    credit: "Uppladdat från enhet",
  });

  assert.equal(newPhoto.placeId, 101);
  assert.equal(newPhoto.url, sampleBase64);
  assert.equal(newPhoto.credit, "Uppladdat från enhet");

  const photos = await fetchPlacePhotos(mockPlaces[0]);
  assert.ok(photos.some((p) => p.caption.includes("Färsk croissant")));
});

test("addUserPhoto turns Instagram submissions into the Motkarta dummy image", async () => {
  const newPhoto = addUserPhoto(202, {
    url: "https://scontent.cdninstagram.com/v/t51.2885-19/example.jpg",
    thumbnailUrl: "https://scontent.cdninstagram.com/v/t51.2885-19/example.jpg",
    caption: "Instagram image",
    credit: "Official Website (www.instagram.com)",
  });

  assert.equal(newPhoto.placeId, 202);
  assert.equal(newPhoto.url, "/motkarta_drop_divided_black_red.svg");
  assert.equal(newPhoto.thumbnailUrl, "/motkarta_drop_divided_black_red.svg");
  assert.equal(newPhoto.credit, "MOTKARTA");

  const photos = await fetchPlacePhotos({ ...mockPlaces[0], id: 202, name: "A.B.Café" });
  assert.ok(photos.every((photo) => !photo.url.includes("instagram")));
  assert.ok(photos.some((photo) => photo.url === "/motkarta_drop_divided_black_red.svg"));
});

test("duplicate place check matches existing names case-insensitively", () => {
  const existingName = "oaxen slip";
  const match = mockPlaces.find((p) => p.name.toLowerCase() === existingName.trim().toLowerCase());
  assert.ok(match);
  assert.equal(match.name, "Oaxen Slip");
});

test("searchable place filter matches places by name, area, kind, and cuisine with smart relevance", () => {
  const places = [
    { id: 1, name: "Solbacken", area: "Djurgården", kind: "Cafe", cuisine: "fika" },
    { id: 2, name: "Solkant", area: "Vasastan", kind: "Cafe", cuisine: "specialty coffee" },
    { id: 3, name: "Café Pascal", area: "Vasastan", kind: "Cafe", cuisine: "specialty coffee" },
    { id: 4, name: "Soldaten Svejk", area: "Södermalm", kind: "Pub", cuisine: "czech" },
  ];

  const searchPlaces = (query) => {
    const q = query.trim().toLowerCase();
    const matches = places.filter((p) => {
      const nameMatch = p.name.toLowerCase().includes(q);
      const areaMatch = p.area?.toLowerCase().includes(q);
      const kindMatch = p.kind?.toLowerCase().includes(q);
      const cuisineMatch = typeof p.cuisine === "string" && p.cuisine.toLowerCase().includes(q);
      return nameMatch || areaMatch || kindMatch || cuisineMatch;
    });

    matches.sort((a, b) => {
      const aName = a.name.toLowerCase();
      const bName = b.name.toLowerCase();
      if (aName === q && bName !== q) return -1;
      if (bName === q && aName !== q) return 1;
      const aStarts = aName.startsWith(q);
      const bStarts = bName.startsWith(q);
      if (aStarts && !bStarts) return -1;
      if (bStarts && !aStarts) return 1;
      return aName.localeCompare(bName, "sv");
    });

    return matches;
  };

  // Exact match prioritized
  const solkantRes = searchPlaces("Solkant");
  assert.equal(solkantRes[0].name, "Solkant");

  // Area search matches all Vasastan places
  const vasaRes = searchPlaces("Vasastan");
  assert.equal(vasaRes.length, 2);

  // Cuisine search matches Czech
  const czechRes = searchPlaces("czech");
  assert.equal(czechRes.length, 1);
  assert.equal(czechRes[0].name, "Soldaten Svejk");
});
