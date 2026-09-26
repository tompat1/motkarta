import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { fetchPlacesPayload } from "../lib/place-payload.ts";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("places payload loads static dataset before D1 API", async () => {
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    if (url === "/api/place-visibility") return jsonResponse({ blocked: [] });
    assert.equal(url, "/data/places.json");
    return jsonResponse({
      source: "osm_curated_open_sources",
      places: [place(1, "Static Place")],
    });
  };

  const payload = await fetchPlacesPayload();

  assert.deepEqual(calls, ["/api/place-visibility", "/data/places.json", "/api/places"]);
  assert.equal(payload.source, "osm");
  assert.equal(payload.places[0].name, "Static Place");
});

test("places payload overlays live D1 fields onto static catalog matches", async () => {
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    if (url === "/api/place-visibility") return jsonResponse({ blocked: [] });
    if (url === "/data/places.json") {
      return jsonResponse({
        source: "osm_curated_open_sources",
        places: [{ ...place(1, "Static Place"), address: "Old road 1", osmIdentity: "node:99" }],
      });
    }
    if (url === "/api/places") {
      return jsonResponse({
        source: "d1",
        places: [{
          ...place(1, "Static Place"),
          id: 9001,
          address: "New road 9",
          osmIdentity: "node:99",
          lifecycleState: "verified",
        }],
      });
    }
    throw new Error(`Unexpected URL ${url}`);
  };

  const payload = await fetchPlacesPayload();
  assert.deepEqual(calls, ["/api/place-visibility", "/data/places.json", "/api/places"]);
  assert.equal(payload.places[0].id, 1);
  assert.equal(payload.places[0].address, "New road 9");
  assert.equal(payload.places[0].lifecycleState, "verified");
  assert.equal(payload.source, "d1");
});

test("places payload merges manual admin entries from live D1 catalog", async () => {
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    if (url === "/api/place-visibility") return jsonResponse({ blocked: [] });
    if (url === "/data/places.json") {
      return jsonResponse({ source: "osm_curated_open_sources", places: [place(1, "Static Place")] });
    }
    if (url === "/api/places") {
      return jsonResponse({
        source: "d1",
        places: [
          place(1, "Static Place"),
          {
            ...place(2, "LUCA - PIZZA NAPOLETANA"),
            candidateSourceType: "admin_entry",
            lifecycleState: "verified",
            validationLabel: "known_hidden_gem",
            latitude: 59.32,
            longitude: 18.07,
          },
        ],
      });
    }
    throw new Error(`Unexpected URL ${url}`);
  };

  const payload = await fetchPlacesPayload();

  assert.deepEqual(calls, ["/api/place-visibility", "/data/places.json", "/api/places"]);
  assert.equal(payload.source, "d1");
  assert.equal(payload.places.length, 2);
  assert.equal(payload.places[1].name, "LUCA - PIZZA NAPOLETANA");
});

test("places payload uses D1 API only when static dataset is unavailable", async () => {
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    if (url === "/api/place-visibility") return jsonResponse({ blocked: [] });
    if (url === "/data/places.json") {
      return new Response("missing", { status: 503 });
    }
    if (url === "/api/places") {
      return jsonResponse({
        source: "d1",
        places: [place(2, "D1 Fallback Place")],
      });
    }
    throw new Error(`Unexpected URL ${url}`);
  };

  const payload = await fetchPlacesPayload();

  assert.deepEqual(calls, ["/api/place-visibility", "/data/places.json", "/api/places"]);
  assert.equal(payload.source, "d1");
  assert.equal(payload.places[0].name, "D1 Fallback Place");
});

test("static catalog applies live admin exclusions with separate D1 IDs", async () => {
  const venue = { ...place(200, "Belgobarens bakficka"), idNamespace: "public", osmIdentity: "node:3845015364" };
  globalThis.fetch = async (url) => url === "/api/place-visibility"
    ? jsonResponse({ blocked: [{ id: 42, idNamespace: "d1", osmIdentity: venue.osmIdentity }] })
    : jsonResponse({ places: [venue] });
  assert.deepEqual((await fetchPlacesPayload()).places, []);
});

test("visibility errors stop loading instead of bypassing admin removals", async () => {
  for (const response of [new Response("Unavailable", { status: 503 }), jsonResponse({})]) {
    globalThis.fetch = async (url) => {
      assert.equal(url, "/api/place-visibility");
      return response;
    };
    await assert.rejects(fetchPlacesPayload(), /[Pp]ublication status/);
  }
});

function jsonResponse(body) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function place(id, name) {
  return {
    id,
    name,
    kind: "Restaurant",
    area: "Södermalm",
    note: "Test place.",
    tags: ["Independent"],
    evidenceLabel: "Static test",
    ratingAverage: 4.2,
    reliableRatingCount: 0,
    reviewCount: 0,
    categoryMeanRating: 4.1,
    categoryPopularityRaw: 0,
    localPopularityPercentile: 0.5,
    priceLevel: 2,
    mainstreamExposure: 0,
    ageDays: 0,
    daysSinceFreshEvidence: 0,
    evidence: {
      specialistGuide: 0,
      independentEditorial: 0,
      verifiedUserRating: 0,
      repeatVisits: 0,
      recentReviews: 0,
      credibleReviewers: 0,
      inspectionStatus: 60,
      verifiedAttributes: 0,
      dataFreshness: 100,
      confidence: "Low",
    },
    engagement: {
      searchImpressions: 0,
      profileViews: 0,
      mapMarkerClicks: 0,
      saves: 0,
      directionRequests: 0,
      confirmedVisits: 0,
      repeatVisits: 0,
      recommendations: 0,
      recentSaves: 0,
    },
    x: 50,
    y: 50,
  };
}
