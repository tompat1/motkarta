import assert from "node:assert/strict";
import test from "node:test";
import { getStoredPlaceFeedback, savePlaceFeedback } from "../lib/place-feedback.ts";
import { addUserReview, fetchPlaceReviews } from "../lib/lazy-media.ts";

test("getStoredPlaceFeedback returns empty array when localStorage is empty", () => {
  const globalStorage = new Map();
  global.localStorage = {
    getItem: (key) => globalStorage.get(key) ?? null,
    setItem: (key, val) => globalStorage.set(key, String(val)),
    removeItem: (key) => globalStorage.delete(key),
  };

  const results = getStoredPlaceFeedback(42, "Kafé Pascal");
  assert.ok(Array.isArray(results));
  assert.equal(results.length, 0);
});

test("getStoredPlaceFeedback matches feedback by numeric targetId and case-insensitive name", () => {
  const globalStorage = new Map();
  globalStorage.set(
    "motkarta_rag_learning_feedback",
    JSON.stringify([
      {
        targetId: 101,
        targetName: "Kafé Pascal",
        isPositive: true,
        selectedReasons: ["Genuint & fantastisk mat/kaffe", "Bra stämning & härlig miljö"],
        comment: "Bästa kaffet och kanelbullarna i stan!",
        timestampMs: 1720000000000,
      },
      {
        targetId: "other-id",
        targetName: "kafé pascal",
        isPositive: false,
        selectedReasons: ["Ändrade öppettider eller permanent stängt"],
        comment: "Stängde kl 16 på söndag.",
        timestampMs: 1720000050000,
      },
      {
        targetId: 999,
        targetName: "Unrelated Bakery",
        isPositive: true,
        selectedReasons: ["Prisvärt & bra meny"],
        comment: "Gott bröd",
        timestampMs: 1720000010000,
      },
    ])
  );

  global.localStorage = {
    getItem: (key) => globalStorage.get(key) ?? null,
    setItem: (key, val) => globalStorage.set(key, String(val)),
    removeItem: (key) => globalStorage.delete(key),
  };

  const results = getStoredPlaceFeedback(101, "Kafé Pascal");
  assert.equal(results.length, 2);
  // Sorted newest first
  assert.equal(results[0].timestampMs, 1720000050000);
  assert.equal(results[0].isPositive, false);
  assert.equal(results[0].selectedReasons[0], "Ändrade öppettider eller permanent stängt");

  assert.equal(results[1].timestampMs, 1720000000000);
  assert.equal(results[1].isPositive, true);
  assert.ok(results[1].comment.includes("Bästa kaffet"));
});

test("savePlaceFeedback stores structured feedback and bridges to user reviews", async () => {
  const globalStorage = new Map();
  global.localStorage = {
    getItem: (key) => globalStorage.get(key) ?? null,
    setItem: (key, val) => globalStorage.set(key, String(val)),
    removeItem: (key) => globalStorage.delete(key),
  };
  global.window = {
    localStorage: global.localStorage,
    dispatchEvent: () => true,
  };

  savePlaceFeedback(
    {
      targetId: 505,
      targetName: "Stora Bageriet",
      isPositive: true,
      selectedReasons: ["Genuint & fantastisk mat/kaffe", "Exakt rätt område & bra läge"],
      comment: "Underbara kardemummabullar och trevlig personal!",
      timestampMs: Date.now(),
    },
    { lang: "sv" }
  );

  const matched = getStoredPlaceFeedback(505, "Stora Bageriet");
  assert.equal(matched.length, 1);
  assert.equal(matched[0].targetId, 505);
  assert.equal(matched[0].targetName, "Stora Bageriet");
  assert.ok(matched[0].comment.includes("kardemummabullar"));

  const reviews = await fetchPlaceReviews(505);
  assert.ok(reviews.some((r) => r.content.includes("kardemummabullar")));
});
