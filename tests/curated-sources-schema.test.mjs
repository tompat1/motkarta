import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { DEFAULT_CURATED_SOURCES } from "../lib/db-sources-prompts.ts";
import { getPlaceVerifiedSources } from "../src/app/verified-sources.ts";

test("DEFAULT_CURATED_SOURCES contains all 17 audited curated sources", () => {
  assert.equal(DEFAULT_CURATED_SOURCES.length, 17);

  const sourceIds = DEFAULT_CURATED_SOURCES.map((s) => s.id);
  assert.ok(sourceIds.includes("husa-guide"));
  assert.ok(sourceIds.includes("stockholm-stad"));
  assert.ok(sourceIds.includes("openstreetmap"));
  assert.ok(sourceIds.includes("white-guide"));
  assert.ok(sourceIds.includes("specialty-coffee-se"));
  assert.ok(sourceIds.includes("visit-stockholm"));
  assert.ok(sourceIds.includes("tasstipset"));
  assert.ok(sourceIds.includes("spotted-by-locals"));
  assert.ok(sourceIds.includes("burgerdudes"));
  assert.ok(sourceIds.includes("michelin-guide"));
  assert.ok(sourceIds.includes("dn-krog"));
  assert.ok(sourceIds.includes("svd-krogguiden"));
  assert.ok(sourceIds.includes("allt-om-mat"));
  assert.ok(sourceIds.includes("vagabond"));
  assert.ok(sourceIds.includes("stora-restaurangpriset"));
  assert.ok(sourceIds.includes("sveriges-basta"));
  assert.ok(sourceIds.includes("thatsup"));

  for (const src of DEFAULT_CURATED_SOURCES) {
    assert.ok(src.id, "Source must have id");
    assert.ok(src.name, "Source must have name");
    assert.ok(src.url, "Source must have url");
    assert.ok(src.type, "Source must have type");
    assert.ok(src.description, "Source must have description");
    assert.ok(src.license, "Source must have license");
    assert.ok(src.verifiedCount > 0, "Source must have verifiedCount > 0");
  }
});

test("getPlaceVerifiedSources detects Burgerdudes, Michelin and White Guide", () => {
  const placesData = JSON.parse(fs.readFileSync("public/data/places.json", "utf-8"));
  const places = placesData.places || placesData;

  const funkyChicken = places.find((p) => p.name === "Funky Chicken Food Truck");
  assert.ok(funkyChicken, "Funky Chicken Food Truck must be present in places.json");
  const bdSources = getPlaceVerifiedSources(funkyChicken);
  assert.ok(bdSources.some((s) => s.id === "burgerdudes"), "Funky Chicken must have Burgerdudes verified badge");
  assert.equal(bdSources[0].label, "Vald av Burgerdudes");
  assert.ok(bdSources[0].url.includes("burgerdudes.se"));

  const frantzen = places.find((p) => p.name === "Frantzén");
  assert.ok(frantzen, "Frantzén must be present in places.json");
  const frantzenSources = getPlaceVerifiedSources(frantzen);
  assert.ok(frantzenSources.some((s) => s.id === "michelin"), "Frantzén must have Michelin verified badge");
  assert.ok(frantzenSources.some((s) => s.id === "white-guide"), "Frantzén must have White Guide badge");
});
