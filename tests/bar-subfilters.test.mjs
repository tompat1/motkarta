import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { allCuisines, kindFilterLabel, listContextLabel } from "../src/app/shared.ts";
import { extractStructuredFilters } from "../lib/concierge/filters.ts";
import {
  getPlaceDrinkCategory,
} from "../src/lib/drinkCategories.ts";

const rawPlacesData = JSON.parse(await readFile(new URL("../public/data/places.json", import.meta.url), "utf8"));
const livePlaces = rawPlacesData.places ?? rawPlacesData;

test("Latest added uses clean label without hardcoded emoji", () => {
  assert.equal(kindFilterLabel("Latest", "sv"), "Senast tillagda");
  assert.equal(kindFilterLabel("Latest", "en"), "Latest added");
});

test("result list header describes the active list context", () => {
  const base = { lang: "en", cuisine: allCuisines, selectedTags: [], hasQuery: false };

  assert.equal(listContextLabel({ ...base, kind: "Latest" }), "Latest added");
  assert.equal(listContextLabel({ ...base, kind: "Restaurant" }), "Restaurant");
  assert.equal(listContextLabel({ ...base, kind: "Bakery" }), "Bakery");
  assert.equal(
    listContextLabel({ ...base, kind: "All places", seasonalLabel: "Julbord" }),
    "Julbord",
  );
  assert.equal(
    listContextLabel({ ...base, kind: "Restaurant", cuisine: "italian" }),
    "Italian",
  );
});

test("Latest added button renders Lightning icon instead of AI Sparkle icon", async () => {
  const mobileSource = await readFile(new URL("../src/components/MobileFilterBottomSheet.tsx", import.meta.url), "utf8");
  const desktopSource = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");

  // Mobile bottom sheet uses Lightning for Latest, not Sparkle
  assert.match(mobileSource, /item === "Latest" \? \(\s*<Lightning/);
  // Desktop chips use Lightning for Latest, not Sparkle
  assert.match(desktopSource, /item === "Latest" \? <Lightning/);
});

test("Bar and drink sub-filters are exposed in desktop and mobile controls", async () => {
  const mobileSource = await readFile(new URL("../src/components/MobileFilterBottomSheet.tsx", import.meta.url), "utf8");
  const desktopSource = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");

  assert.match(mobileSource, /selectedTags\.includes\("Wine bar"\)/);
  assert.match(mobileSource, /selectedTags\.includes\("Cocktail bar"\)/);
  assert.match(mobileSource, /selectedTags\.includes\("Pub & beer"\)/);

  assert.match(desktopSource, /selectedTags\.includes\("Wine bar"\)/);
  assert.match(desktopSource, /selectedTags\.includes\("Cocktail bar"\)/);
  assert.match(desktopSource, /selectedTags\.includes\("Pub & beer"\)/);
});

test("Wine bar filter matches curated wine venues in Stockholm", () => {
  const wineBars = livePlaces.filter((p) => {
    const searchStr = [p.name, p.kind, p.cuisine || "", ...(p.tags || []), p.note || ""].join(" ").toLowerCase();
    const placeTags = (p.tags ?? []).map((t) => t.toLowerCase());
    return (
      searchStr.includes("wine bar") ||
      searchStr.includes("vinbar") ||
      searchStr.includes("wine") ||
      searchStr.includes("vin") ||
      placeTags.some((pt) => ["vinbar", "wine bar", "vin", "wine", "natural wine", "naturvin"].includes(pt) || pt.includes("vin") || pt.includes("wine"))
    );
  });

  assert.ok(wineBars.length >= 10, `Expected at least 10 wine bars, found ${wineBars.length}`);
  const names = wineBars.map((p) => p.name.toLowerCase());
  assert.ok(names.some((n) => n.includes("savant bar")));
  assert.ok(names.some((n) => n.includes("grus grus")));
  assert.ok(names.some((n) => n.includes("ambar")));
  assert.ok(names.some((n) => n.includes("bar montan")));
});

test("Cocktail bar filter matches curated cocktail venues in Stockholm", () => {
  const cocktailBars = livePlaces.filter((p) => {
    const searchStr = [p.name, p.kind, p.cuisine || "", ...(p.tags || []), p.note || ""].join(" ").toLowerCase();
    const placeTags = (p.tags ?? []).map((t) => t.toLowerCase());
    return (
      searchStr.includes("cocktail") ||
      searchStr.includes("drink") ||
      placeTags.some((pt) => ["cocktail", "cocktails", "cocktail bar", "cocktailbar", "drinkar"].includes(pt) || pt.includes("cocktail"))
    );
  });

  assert.ok(cocktailBars.length >= 6, `Expected at least 6 cocktail bars, found ${cocktailBars.length}`);
  const names = cocktailBars.map((p) => p.name.toLowerCase());
  assert.ok(names.some((n) => n.includes("tjoget")));
  assert.ok(names.some((n) => n.includes("lucy")));
  assert.ok(names.some((n) => n.includes("gemma")));
  assert.ok(names.some((n) => n.includes("röda huset")));
  assert.ok(names.some((n) => n.includes("pharmarium")));
});

test("Pub & beer filter matches curated beer and pub venues in Stockholm", () => {
  const pubVenues = livePlaces.filter((p) => {
    const searchStr = [p.name, p.kind, p.cuisine || "", ...(p.tags || []), p.note || ""].join(" ").toLowerCase();
    const placeTags = (p.tags ?? []).map((t) => t.toLowerCase());
    return (
      searchStr.includes("pub") ||
      searchStr.includes("öl") ||
      searchStr.includes("beer") ||
      searchStr.includes("brewery") ||
      searchStr.includes("bryggeri") ||
      placeTags.some((pt) => ["pub", "öl", "beer", "craft beer", "bryggeri", "brewery", "starköl"].includes(pt) || pt.includes("pub") || pt.includes("beer"))
    );
  });

  assert.ok(pubVenues.length >= 10, `Expected at least 10 pubs, found ${pubVenues.length}`);
  const names = pubVenues.map((p) => p.name.toLowerCase());
  assert.ok(names.some((n) => n.includes("svejk")));
  assert.ok(names.some((n) => n.includes("akkurat")));
  assert.ok(names.some((n) => n.includes("stigberget")));
  assert.ok(names.some((n) => n.includes("tudor arms")));
  assert.ok(names.some((n) => n.includes("oliver twist")));
});

test("Concierge filters ground vinbar and cocktailbar queries", () => {
  const vinbarFilters = extractStructuredFilters("bästa vinbar på söder");
  assert.ok(vinbarFilters.cuisines.some((t) => ["wine bar", "vinbar", "wine", "vin"].includes(t)));

  const cocktailFilters = extractStructuredFilters("mysig cocktailbar i vasastan");
  assert.ok(cocktailFilters.cuisines.some((t) => ["cocktail", "cocktails", "cocktail bar", "cocktailbar"].includes(t)));
});

test("FoodMap and BarAndPubIcons correctly classify and assign map icons for bars and pubs", async () => {
  const svejk = livePlaces.find((p) => p.name.toLowerCase().includes("svejk"));
  assert.ok(svejk, "Soldaten Svejk should exist in places");
  assert.equal(getPlaceDrinkCategory(svejk), "pub");

  const gemma = livePlaces.find((p) => p.name.toLowerCase().includes("a bar called gemma"));
  assert.ok(gemma, "A Bar Called Gemma should exist in places");
  assert.equal(getPlaceDrinkCategory(gemma), "bar");

  const ambar = livePlaces.find((p) => p.name.toLowerCase().includes("ambar"));
  assert.ok(ambar, "Ambar should exist in places");
  assert.equal(getPlaceDrinkCategory(ambar), "bar");

  // Verify FoodMap.tsx contains the pub and bar marker SVGs
  const foodMapSource = await readFile(new URL("../src/components/FoodMap.tsx", import.meta.url), "utf8");
  assert.match(foodMapSource, /PUB_BEER_STEIN_SVG_CONTENT/);
  assert.match(foodMapSource, /BAR_MARTINI_SVG_CONTENT/);
  assert.match(foodMapSource, /kind-\$\{drinkCategory\}/);

  // Exclude non-alcohol food counters from bar/pub classification
  assert.equal(getPlaceDrinkCategory({ name: "Sushi Bar Kirin", kind: "Restaurant" }), null);
  assert.equal(getPlaceDrinkCategory({ name: "Taco Bar Kungsgatan", kind: "Restaurant" }), null);
  assert.equal(getPlaceDrinkCategory({ name: "Joe & The Juice Bar", kind: "Café" }), null);
});
