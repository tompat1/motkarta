import test from "node:test";
import assert from "node:assert/strict";
import {
  expandBounds,
  filterPlacesByBounds,
  placeInBounds,
} from "../src/app/map-bounds.ts";

const stockholmBounds = {
  south: 59.28,
  west: 17.95,
  north: 59.38,
  east: 18.12,
};

test("placeInBounds accepts coordinates inside the rectangle", () => {
  assert.equal(placeInBounds({ latitude: 59.33, longitude: 18.07 }, stockholmBounds), true);
  assert.equal(placeInBounds({ latitude: 59.27, longitude: 18.07 }, stockholmBounds), false);
});

test("filterPlacesByBounds keeps in-view places and drops out-of-view places", () => {
  const places = [
    { id: 1, latitude: 59.33, longitude: 18.07 },
    { id: 2, latitude: 59.5, longitude: 18.07 },
  ];

  const filtered = filterPlacesByBounds(places, stockholmBounds, 0);
  assert.deepEqual(filtered.map((place) => place.id), [1]);
});

test("expandBounds adds padding around the viewport", () => {
  const expanded = expandBounds(stockholmBounds, 0.1);
  assert.ok(expanded.south < stockholmBounds.south);
  assert.ok(expanded.north > stockholmBounds.north);
  assert.ok(expanded.west < stockholmBounds.west);
  assert.ok(expanded.east > stockholmBounds.east);
});
