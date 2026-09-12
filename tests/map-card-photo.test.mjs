import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const appSource = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
const stylesSource = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
const lazyMediaSource = await readFile(new URL("../lib/lazy-media.ts", import.meta.url), "utf8");
const detailSheetSource = await readFile(new URL("../src/components/PlaceDetailSheet.tsx", import.meta.url), "utf8");

test("App.tsx replaces recommendation paragraph with map card photo container", () => {
  // Recommendation paragraph with red line is removed from map card
  assert.ok(!appSource.includes('<p className="recommendation">'), "App.tsx should not contain <p className=\"recommendation\">");

  // Map card photo container is integrated
  assert.match(appSource, /className=\{`map-card-photo-container \$\{\!activeCardPhoto \? "map-card-photo-container-dummy" : ""\}`\}/);
  assert.match(appSource, /className=\{`map-card-hero-photo \$\{\!activeCardPhoto \? "map-card-hero-photo-dummy" : ""\}`\}/);
  assert.match(appSource, /src=\{activeCardPhoto\?\.url \?\? DUMMY_PLACE_IMAGE_URL\}/);

  // Clicking photo opens place detail sheet
  assert.match(appSource, /onClick=\{\(\) => setIsPlaceDetailOpen\(true\)\}/);
});

test("App.tsx removes note paragraph from map card", () => {
  // Note paragraph is removed from the map card
  assert.ok(!appSource.includes('<p className="note">{active.note}</p>'), "App.tsx map card should not contain <p className=\"note\">{active.note}</p>");
});

test("PlaceDetailSheet filters out raw OpenStreetMap notes", () => {
  assert.match(detailSheetSource, /place\.note && !place\.note\.toLowerCase\(\)\.includes\("from openstreetmap"\)/);
});

test("lazy-media.ts exports DUMMY_PLACE_IMAGE_URL", () => {
  assert.match(lazyMediaSource, /export const DUMMY_PLACE_IMAGE_URL = "\/motkarta_drop_divided_black_red\.svg";/);
});

test("styles.css defines map card photo container and responsive styling", () => {
  assert.match(stylesSource, /\.map-card-photo-container\s*\{/);
  assert.match(stylesSource, /\.map-card-photo-container-dummy\s*\{/);
  assert.match(stylesSource, /\.map-card-hero-photo\s*\{/);
  assert.match(stylesSource, /\.map-card-hero-photo-dummy\s*\{/);
  assert.match(stylesSource, /\.map-card-photo-credit\s*\{/);
});

const mediaDrawerSource = await readFile(new URL("../src/components/LazyPlaceMediaDrawer.tsx", import.meta.url), "utf8");

test("LazyPlaceMediaDrawer excludes main placeholder photo to prevent duplicate images in map card", () => {
  // App.tsx passes exclusion props to LazyPlaceMediaDrawer
  assert.match(appSource, /<LazyPlaceMediaDrawer[\s\S]*?excludePhotoId=\{activeCardPhoto\?\.id\}/);
  assert.match(appSource, /excludeFirstPhoto=\{Boolean\(activeCardPhoto\)\}/);

  // LazyPlaceMediaDrawer accepts exclusion props and filters out main photo
  assert.match(mediaDrawerSource, /excludePhotoId\?: string \| null/);
  assert.match(mediaDrawerSource, /const displayPhotos = photos\s*\?\s*photos\.filter/);
  assert.match(mediaDrawerSource, /if \(excludePhotoId && img\.id === excludePhotoId\) return false;/);
  assert.match(mediaDrawerSource, /if \(excludeFirstPhoto && idx === 0\) return false;/);
});
