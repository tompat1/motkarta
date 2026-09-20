import test from "node:test";
import assert from "node:assert/strict";
import {
  buildAppleDirectionsUrl,
  buildDirectionsUrl,
  buildGoogleDirectionsUrl,
} from "../lib/map-links.ts";

const place = {
  id: 1,
  name: "Myrans Grill Och Pizza",
  area: "Södermalm",
  address: "Tussmötevägen",
  latitude: 59.3123,
  longitude: 18.0456,
  kind: "Restaurant",
};

test("buildGoogleDirectionsUrl uses coordinates when available", () => {
  const url = buildGoogleDirectionsUrl(place);
  assert.equal(url, "https://www.google.com/maps/dir/?api=1&destination=59.3123,18.0456");
});

test("buildAppleDirectionsUrl uses coordinates when available", () => {
  const url = buildAppleDirectionsUrl(place);
  assert.equal(url, "https://maps.apple.com/?daddr=59.3123,18.0456");
});

test("buildDirectionsUrl falls back to encoded address without coordinates", () => {
  const url = buildGoogleDirectionsUrl({
    ...place,
    latitude: undefined,
    longitude: undefined,
  });
  assert.match(url, /^https:\/\/www\.google\.com\/maps\/dir\/\?api=1&destination=/);
  assert.match(url, /Myrans/);
});

test("buildDirectionsUrl falls back to Stockholm when only city context exists", () => {
  const url = buildGoogleDirectionsUrl({ id: 1, name: "", area: "", kind: "Restaurant" });
  assert.match(url, /destination=Stockholm/);
});
