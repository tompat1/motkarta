import assert from "node:assert/strict";
import test from "node:test";

import {
  openingHoursFact,
  priceFact,
  visibleTagLabels,
  wifiFact,
} from "../src/app/place-card-facts.ts";

test("place card facts render placeholders without inventing missing facts", () => {
  assert.deepEqual(openingHoursFact({}, "en"), {
    label: "Hours unknown",
    title: "Verified opening hours are missing",
    isPlaceholder: true,
  });

  assert.deepEqual(priceFact({ priceLevel: 4 }, "en"), {
    label: "Price unknown",
    title: "Verified price information is missing",
    isPlaceholder: true,
  });

  assert.deepEqual(wifiFact({ tags: [] }, "en"), {
    label: "Wi-Fi unknown",
    title: "Verified Wi-Fi information is missing",
    isPlaceholder: true,
  });
});

test("place card facts display sourced values and hide duplicate Wi-Fi tags", () => {
  assert.equal(openingHoursFact({ openingHours: "Mo-Sa 17:00-23:00" }, "sv").label, "Mo-Sa 17:00-23:00");
  assert.equal(priceFact({ priceSEK: "145 SEK" }, "sv").label, "$ · 145 SEK");
  assert.equal(wifiFact({ tags: ["Wi-Fi", "Free Wi-Fi", "Bakery"] }, "en").label, "Free Wi-Fi");
  assert.deepEqual(visibleTagLabels(["Wi-Fi", "Free Wi-Fi", "Bakery"]), ["Bakery"]);
});
