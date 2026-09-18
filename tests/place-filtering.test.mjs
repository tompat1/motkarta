import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { cuisineOptionsFromPlaces, resolveCuisineFilter } from "../src/app/cuisine-options.ts";
import { isLatestAddedPlace, matchesEstablishmentFilter } from "../src/app/place-filtering.ts";
import { cuisineLabel } from "../src/app/shared.ts";

function place(overrides = {}) {
  return {
    id: 1,
    name: "Test Place",
    kind: "Restaurant",
    evidence: {
      specialistGuide: 0,
      independentEditorial: 0,
    },
    tags: [],
    ...overrides,
  };
}

test("Latest added only includes places with lastUpdated", () => {
  assert.equal(isLatestAddedPlace(place({ lastUpdated: "2026-09-04T11:00:00Z" })), true);
  assert.equal(isLatestAddedPlace(place({ lastUpdated: "" })), false);
  assert.equal(isLatestAddedPlace(place()), false);
});

test("establishment filter applies special and concrete type filters", () => {
  const restaurant = place({ id: 1, kind: "Restaurant" });
  const cafe = place({ id: 2, kind: "Café" });
  const curated = place({ id: 3, kind: "Restaurant", evidenceLabel: "Visit Stockholm guide" });
  const latest = place({ id: 4, kind: "Bakery", lastUpdated: "2026-09-04T11:00:00Z" });

  assert.equal(matchesEstablishmentFilter(restaurant, "Restaurant", []), true);
  assert.equal(matchesEstablishmentFilter(cafe, "Restaurant", []), false);
  assert.equal(matchesEstablishmentFilter(curated, "Curated", []), true);
  assert.equal(matchesEstablishmentFilter(latest, "Latest", []), true);
  assert.equal(matchesEstablishmentFilter(restaurant, "Latest", []), false);
  assert.equal(matchesEstablishmentFilter(cafe, "Saved", [2]), true);
});

test("visible establishment filters omit low-value curated shortcut", async () => {
  const appSource = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
  const sharedSource = await readFile(new URL("../src/app/shared.ts", import.meta.url), "utf8");

  assert.match(sharedSource, /visibleEstablishmentTypes = establishmentTypes\.filter\(\(item\) => item !== "Curated"\)/);
  assert.equal(appSource.includes("visibleEstablishmentTypes.map"), true);
  assert.equal(appSource.includes("establishmentTypes.map"), false);
});

test("cuisine filters omit venue-type placeholders (restaurant, hotel, coffee shop, kaffebar)", () => {
  const options = cuisineOptionsFromPlaces([
    place({ cuisine: "restaurant" }),
    place({ cuisine: "italian;restaurant" }),
    place({ cuisine: "thai" }),
    place({ cuisine: "coffee shop" }),
    place({ cuisine: "kaffebar;coffee" }),
    place({ name: "Belgobarens bakficka", cuisine: "belgian" }),
  ]);

  assert.equal(options.includes("restaurant"), false);
  assert.equal(options.includes("coffee shop"), false);
  assert.equal(options.includes("kaffebar"), false);
  assert.equal(options.includes("coffee"), false);
  assert.equal(options.includes("italian"), true);
  assert.equal(options.includes("thai"), true);
  assert.equal(options.includes("belgian"), true);
});

test("cuisineLabel formats Belgian cuisine as Belgiskt in SV and Belgian in EN", () => {
  assert.equal(cuisineLabel("belgian", "sv"), "Belgiskt");
  assert.equal(cuisineLabel("belgian", "en"), "Belgian");
  assert.equal(cuisineLabel("belgiskt", "sv"), "Belgiskt");
  assert.equal(cuisineLabel("belgiskt", "en"), "Belgian");
});

test("concierge cuisine intent resolves to an available main-list filter", () => {
  const options = ["belgian", "chinese", "french", "german"];

  assert.equal(resolveCuisineFilter(["belgian"], options), "belgian");
  assert.equal(resolveCuisineFilter(["chinese"], options), "chinese");
  assert.equal(resolveCuisineFilter(["french"], options), "french");
  assert.equal(resolveCuisineFilter(["german"], options), "german");
  assert.equal(resolveCuisineFilter(["unknown"], options), undefined);
});

test("selecting any filter clears concierge state in App.tsx", async () => {
  const appSource = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
  assert.equal(appSource.includes("clearConciergeState();"), true);
  assert.equal(appSource.includes("selectKindFilter"), true);
  assert.equal(appSource.includes("selectCuisineFilter"), true);
});

test("concierge responses update the main list and structured answer state", async () => {
  const appSource = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
  assert.match(appSource, /resolveConciergeMainListIds\(payload\)/);
  assert.match(appSource, /resolveConciergeMainListIds\(result\)/);
  assert.match(appSource, /place\.id === recommended\.id \|\| normalize\(place\.name\) === normalize\(recommended\.name\)/);
  assert.match(appSource, /if \(conciergeMainListIds\.length > 0\)/);
  assert.match(appSource, /buildConciergeQuerySuccess/);
  assert.match(appSource, /setConciergeResponse\(applied\.response\)/);
});

