import test from "node:test";
import assert from "node:assert/strict";
import { FILTER_SECTIONS, formatDistance, distanceFromPoint } from "../lib/mobile-filters.ts";
import { demoPlaces } from "../lib/demo-places.ts";

test("FILTER_SECTIONS contains the 4 core categorized mobile filter sections", () => {
  const sectionIds = FILTER_SECTIONS.map((s) => s.id);
  assert.deepEqual(sectionIds, ["coffee", "drinks", "food", "services"]);

  const coffeeSection = FILTER_SECTIONS.find((s) => s.id === "coffee");
  assert.ok(coffeeSection);
  const coffeeTags = coffeeSection.items.map((i) => i.tag);
  assert.ok(coffeeTags.includes("Filter"));
  assert.ok(coffeeTags.includes("Hand brew"));
  assert.ok(coffeeTags.includes("Own roastery"));
  assert.ok(coffeeTags.includes("Single origin"));
});

test("formatDistance formats meters and kilometers cleanly for mobile UI", () => {
  assert.equal(formatDistance(0.45, "sv"), "450 m");
  assert.equal(formatDistance(0.9, "sv"), "900 m");
  assert.equal(formatDistance(1.23, "sv"), "1.2 km");
  assert.equal(formatDistance(2.2, "sv"), "2.2 km");
  assert.equal(formatDistance(Number.POSITIVE_INFINITY, "sv"), "");
});

test("distanceFromPoint calculates real distances in Stockholm", () => {
  const dropCoffee = demoPlaces.find((p) => p.name === "Drop Coffee");
  assert.ok(dropCoffee);
  const mariatorgetLoc = { latitude: 59.3174, longitude: 18.062 };
  const distKm = distanceFromPoint(dropCoffee, mariatorgetLoc);
  assert.ok(distKm < 0.05); // essentially at the spot
});

test("Savoj Pizza is present in demoPlaces with correct attributes", () => {
  const savoj = demoPlaces.find((p) => p.name === "Savoj Pizza");
  assert.ok(savoj, "Savoj Pizza should be in demoPlaces");
  assert.equal(savoj.kind, "Restaurant");
  assert.equal(savoj.cuisine, "pizza");
  assert.equal(savoj.area, "Vasastan");
  assert.ok(savoj.tags.includes("Pizza"));
  assert.ok(savoj.tags.includes("Sourdough"));
  assert.ok(savoj.tags.includes("Locally owned"));
});
