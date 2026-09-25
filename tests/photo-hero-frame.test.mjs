import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_PHOTO_HERO_FRAME,
  heroImageStyle,
  normalizePhotoHeroFrame,
} from "../lib/photo-hero-frame.ts";

test("normalizePhotoHeroFrame clamps values and defaults missing fields", () => {
  assert.deepEqual(normalizePhotoHeroFrame(), DEFAULT_PHOTO_HERO_FRAME);
  assert.deepEqual(
    normalizePhotoHeroFrame({ heroFocusX: 120, heroFocusY: -5, heroScale: 9, heroFit: "cover" }),
    { heroFocusX: 100, heroFocusY: 0, heroScale: 3, heroFit: "cover" },
  );
});

test("heroImageStyle maps frame to CSS properties", () => {
  assert.deepEqual(heroImageStyle({ heroFocusX: 30, heroFocusY: 70, heroScale: 1, heroFit: "contain" }), {
    objectFit: "contain",
    objectPosition: "30% 70%",
    transform: undefined,
    transformOrigin: "30% 70%",
  });
  assert.equal(
    heroImageStyle({ heroFocusX: 50, heroFocusY: 50, heroScale: 1.5, heroFit: "cover" }).transform,
    "scale(1.5)",
  );
});
