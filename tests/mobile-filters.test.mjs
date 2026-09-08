import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { formatDistance, distanceFromPoint } from "../lib/mobile-filters.ts";

const rawPlacesData = JSON.parse(await readFile(new URL("../public/data/places.json", import.meta.url), "utf8"));
const livePlaces = rawPlacesData.places ?? rawPlacesData;

test("formatDistance formats meters and kilometers cleanly for mobile UI", () => {
  assert.equal(formatDistance(0.45, "sv"), "450 m");
  assert.equal(formatDistance(0.9, "sv"), "900 m");
  assert.equal(formatDistance(1.23, "sv"), "1.2 km");
  assert.equal(formatDistance(2.2, "sv"), "2.2 km");
  assert.equal(formatDistance(Number.POSITIVE_INFINITY, "sv"), "");
});

test("distanceFromPoint calculates real distances in Stockholm", () => {
  const dropCoffee = livePlaces.find((p) => p.name.includes("Drop Coffee"));
  assert.ok(dropCoffee, "Drop Coffee should exist in live dataset");
  const mariatorgetLoc = { latitude: 59.3174, longitude: 18.062 };
  const distKm = distanceFromPoint(dropCoffee, mariatorgetLoc);
  assert.ok(distKm < 0.1); // within 100 meters of Mariatorget
});

test("Savoj is present in live places with correct attributes", () => {
  const savoj = livePlaces.find((p) => p.name.toLowerCase().includes("savoj"));
  assert.ok(savoj, "Savoj should be in live places");
  assert.equal(savoj.kind, "Restaurant");
  assert.ok(savoj.cuisine?.includes("pizza"));
});

test("unified search query matches places by name, cuisine, region or tags", () => {
  const query = "pizza";
  const terms = query.toLowerCase().split(/\s+/);
  const matched = livePlaces.filter((p) =>
    terms.every(
      (term) =>
        p.name.toLowerCase().includes(term) ||
        (p.area && p.area.toLowerCase().includes(term)) ||
        (p.cuisine && p.cuisine.toLowerCase().includes(term)) ||
        (Array.isArray(p.tags) && p.tags.some((t) => t.toLowerCase().includes(term)))
    )
  );
  assert.ok(matched.length > 0);
  assert.ok(matched.some((p) => p.name.toLowerCase().includes("savoj") || p.name.toLowerCase().includes("pizza")));
});

test("dog friendly filter returns verified venues across Stockholm", () => {
  const dogVenues = livePlaces.filter((p) => {
    const tags = (p.tags ?? []).map((t) => t.toLowerCase());
    return tags.includes("dog friendly") || tags.includes("hundvänligt") || tags.includes("tasstipset");
  });
  assert.ok(dogVenues.length >= 100, `Expected at least 100 dog friendly venues, found ${dogVenues.length}`);
  const sampleNames = dogVenues.map((p) => p.name.toLowerCase());
  assert.ok(sampleNames.some((n) => n.includes("drop coffee") || n.includes("bambino") || n.includes("kvarnen")));
});
