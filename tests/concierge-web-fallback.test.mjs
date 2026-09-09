import assert from "node:assert/strict";
import test from "node:test";

import { buildResponse, buildWebSearchFallback } from "../lib/concierge/response.ts";
import { isProhibitedDomain } from "../functions/api/concierge.ts";

test("buildWebSearchFallback generates valid links for Google, DuckDuckGo, and OSM in Swedish", () => {
  const fallback = buildWebSearchFallback("etiopisk mat", "sv");

  assert.equal(fallback.query, "etiopisk mat");
  assert.equal(fallback.links.length, 3);

  const google = fallback.links.find((l) => l.provider === "google");
  assert.ok(google);
  assert.equal(google.title, "Sök på Google");
  assert.ok(google.url.includes("google.com/search?q="));
  assert.ok(google.url.includes(encodeURIComponent("etiopisk mat Stockholm café restaurang mat")));

  const ddg = fallback.links.find((l) => l.provider === "duckduckgo");
  assert.ok(ddg);
  assert.equal(ddg.title, "Sök på DuckDuckGo");
  assert.ok(ddg.url.includes("duckduckgo.com/?q="));

  const osm = fallback.links.find((l) => l.provider === "osm");
  assert.ok(osm);
  assert.equal(osm.title, "Sök på OpenStreetMap");
  assert.ok(osm.url.includes("openstreetmap.org/search?query="));
});

test("buildWebSearchFallback generates localized titles in English", () => {
  const fallback = buildWebSearchFallback("tacos", "en");

  assert.equal(fallback.query, "tacos");
  const google = fallback.links.find((l) => l.provider === "google");
  assert.ok(google);
  assert.equal(google.title, "Search on Google");
});

test("buildResponse includes webSearch fallback when zero candidates match", () => {
  const response = buildResponse("okänd restaurang i skogen", [], 100, { language: "sv" });

  assert.equal(response.status, "clarification");
  assert.equal(response.cards.length, 0);
  assert.ok(response.webSearch);
  assert.equal(response.webSearch.query, "okänd restaurang i skogen");
  assert.equal(response.webSearch.links.length, 3);
});

test("buildResponse omits webSearch fallback when candidates exist", () => {
  const candidate = {
    place: {
      id: 1,
      name: "Pascal",
      kind: "Specialty coffee",
      area: "Vasastan",
      scores: { recommendation: 95 },
      hiddenGem: { eligible: false },
    },
    facts: {
      id: 1,
      facts: [],
      document: "Pascal",
      chainStatus: "independent",
    },
    exact: true,
    lexicalScore: 1,
    fusionScore: 0.1,
  };

  const response = buildResponse("pascal", [candidate], 100, { language: "sv" });

  assert.equal(response.status, "ok");
  assert.equal(response.cards.length, 1);
  assert.equal(response.webSearch, undefined);
});

test("isProhibitedDomain rejects commercial aggregators and permits independent guides", () => {
  assert.equal(isProhibitedDomain("https://www.yelp.com/biz/stockholm"), true);
  assert.equal(isProhibitedDomain("https://tripadvisor.com/restaurants"), true);
  assert.equal(isProhibitedDomain("https://instagram.com/p/123"), true);
  assert.equal(isProhibitedDomain("https://google.com/maps"), true);

  assert.equal(isProhibitedDomain("https://svd.se/krog"), false);
  assert.equal(isProhibitedDomain("https://dn.se/restaurang"), false);
  assert.equal(isProhibitedDomain("https://guidetostockholm.se/cafeer"), false);
  assert.equal(isProhibitedDomain("https://kaffebar.se/om-oss"), false);
});
