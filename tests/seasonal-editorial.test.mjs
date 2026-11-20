import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  getSeasonalHeroImage,
  getSeasonalTheme,
  getStockholmSeason,
  isEditorialFeaturePhotoUrl,
  selectSeasonalVenues,
} from "../lib/seasonal-editorial.ts";

test("getStockholmSeason maps calendar months to spring-summer, autumn, and winter", () => {
  assert.equal(getStockholmSeason(new Date("2026-06-15T12:00:00Z")), "spring-summer");
  assert.equal(getStockholmSeason(new Date("2026-04-01T12:00:00Z")), "spring-summer");
  assert.equal(getStockholmSeason(new Date("2026-09-20T12:00:00Z")), "autumn");
  assert.equal(getStockholmSeason(new Date("2026-10-15T12:00:00Z")), "autumn");
  assert.equal(getStockholmSeason(new Date("2026-11-20T12:00:00Z")), "winter");
  assert.equal(getStockholmSeason(new Date("2026-12-10T12:00:00Z")), "winter");
  assert.equal(getStockholmSeason(new Date("2026-01-15T12:00:00Z")), "winter");
});

test("getSeasonalHeroImage points to distinct assets for all three seasons", () => {
  assert.equal(getSeasonalHeroImage("spring-summer"), "/motkarta-stockholm-editorial-hero.png");
  assert.equal(getSeasonalHeroImage("autumn"), "/motkarta-stockholm-editorial-hero-autumn.jpg");
  assert.equal(getSeasonalHeroImage("winter"), "/motkarta-stockholm-editorial-hero-winter.jpg");
});

test("November and December activate the Julbord theme and resolve real catalog venues", async () => {
  const novTheme = getSeasonalTheme(new Date("2026-11-20T12:00:00Z"));
  const decTheme = getSeasonalTheme(new Date("2026-12-14T12:00:00Z"));
  assert.equal(novTheme.id, "julbord");
  assert.equal(decTheme.id, "julbord");
  assert.equal(novTheme.themeLabel.sv, "Julbord");
  assert.equal(novTheme.themeLabel.en, "Julbord");

  const catalog = JSON.parse(await readFile(new URL("../public/data/places.json", import.meta.url), "utf8"));
  const matched = selectSeasonalVenues(catalog.places, novTheme, 12);
  assert.ok(matched.length >= 10, `Expected at least 10 live Julbord venues, got ${matched.length}`);
  assert.equal(matched[0].name, "Pelikan");
  assert.equal(matched[1].name, "Den Gyldene Freden");
  assert.equal(matched[2].name, "Operakällaren");
});

test("isEditorialFeaturePhotoUrl filters out logos and SVGs while keeping real photographs", () => {
  assert.equal(isEditorialFeaturePhotoUrl("https://gyldenefreden.se/wp-content/uploads/2023/04/hero-start.jpg"), true);
  assert.equal(isEditorialFeaturePhotoUrl("https://ullawinbladh.se/wp-content/uploads/2021/07/logo-vit.png"), false);
  assert.equal(isEditorialFeaturePhotoUrl("https://burgerboys.se/wp-content/uploads/2025/09/Foodbonus_org-1.svg"), false);
  assert.equal(isEditorialFeaturePhotoUrl(""), false);
});

test("App filters both map and list to seasonal places when Explore CTA is clicked", async () => {
  const appSource = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
  assert.match(appSource, /const \[seasonalFilterActive, setSeasonalFilterActive\] = useState\(false\);/);
  assert.match(appSource, /\.filter\(\(place\) => !seasonalFilterActive \|\| seasonalPlaceIds\.has\(place\.id\)\)/);
  assert.match(appSource, /setSeasonalFilterActive\(true\);/);
});
