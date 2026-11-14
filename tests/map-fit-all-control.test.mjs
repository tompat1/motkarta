import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const mapSource = await readFile(new URL("../src/components/FoodMap.tsx", import.meta.url), "utf8");

test("fit-all control uses a distinct frame icon and fits every current POI", () => {
  assert.match(mapSource, /className="map-control-btn map-fit-all-btn"/);
  assert.match(mapSource, /<FrameCorners size=\{16\} weight="bold" aria-hidden="true" \/>/);
  assert.match(mapSource, /placesRef\.current\.filter\(hasCoordinates\)/);
  assert.match(mapSource, /map\.fitBounds\(bounds, \{[\s\S]*?\.\.\.padding,[\s\S]*?maxZoom: 13/);
});
