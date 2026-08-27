import assert from "node:assert/strict";
import test from "node:test";

import { loadPlacesFromD1 } from "../lib/place-records.ts";

test("D1 loader returns no places when production rows are absent", async () => {
  const db = fakeD1({
    places: [],
    evidence: [],
    tags: [],
  });

  assert.deepEqual(await loadPlacesFromD1(db), []);
});

test("D1 loader maps rows into scoring inputs", async () => {
  const db = fakeD1({
    places: [
      {
        id: 10,
        name: "Test Roaster",
        type: "Specialty coffee",
        district: "Södermalm",
        description: "Traceable filter coffee and beans.",
        address: "Testgatan 10, Stockholm",
        website: "https://test-roaster.example",
        price_level: 2,
        latitude: 59.31,
        longitude: 18.08,
        chain_status: "independent",
        lifecycle_state: "verified",
        validation_label: "known_hidden_gem",
        validation_notes: "Human spot-check confirmed",
        rating_average: 4.7,
        reliable_rating_count: 60,
        review_count: 80,
        category_mean_rating: 4.2,
        search_impressions: 300,
        profile_views: 100,
        map_marker_clicks: 80,
        saves: 40,
        direction_requests: 20,
        confirmed_visits: 12,
        repeat_visits: 5,
        recommendations: 3,
        recent_saves: 14,
        latest_rating_at: new Date().toISOString(),
        latest_engagement_at: new Date().toISOString(),
        specialty_verified: 1,
        own_roastery: 1,
        traceable_coffee: 1,
        filter_coffee: 1,
        espresso_based: 1,
        rotating_roasters: 0,
        single_origin: 1,
        manual_brew_methods_json: "[\"V60\"]",
        decaf_available: 1,
        beans_for_sale: 1,
        verification_sources: 2,
      },
    ],
    evidence: [
      {
        establishment_id: 10,
        source_type: "specialist_guide",
        source_name: "Specialist guide",
        confidence: 0.9,
        captured_at: new Date().toISOString(),
      },
      {
        establishment_id: 10,
        source_type: "osm",
        source_name: "OSM",
        confidence: 0.8,
        captured_at: new Date().toISOString(),
      },
    ],
    tags: [
      { establishment_id: 10, tag: "Independent" },
      { establishment_id: 10, tag: "Filter" },
      { establishment_id: 10, tag: "Coffee Shop" },
      { establishment_id: 10, tag: "Single Origin" },
    ],
  });

  const [place] = await loadPlacesFromD1(db);

  assert.equal(place.name, "Test Roaster");
  assert.equal(place.kind, "Specialty coffee");
  assert.equal(place.lifecycleState, "verified");
  assert.equal(place.validationLabel, "known_hidden_gem");
  assert.equal(place.address, "Testgatan 10, Stockholm");
  assert.equal(place.website, "https://test-roaster.example");
  assert.deepEqual([...place.tags].sort(), ["Coffee Shop", "Filter", "Independent", "Single Origin"]);
  assert.equal(place.cuisine, "coffee shop");
  assert.equal(place.specialty?.specialtyVerified, true);
  assert.equal(place.evidence.confidence, "Medium");
});

test("D1 loader derives cuisine filters from establishment tags", async () => {
  const db = fakeD1({
    places: [
      {
        ...basePlaceRow,
        id: 11,
        name: "Pizza Test",
        type: "Restaurant",
      },
      {
        ...basePlaceRow,
        id: 12,
        name: "French Test",
        type: "Restaurant",
      },
    ],
    evidence: [],
    tags: [
      { establishment_id: 11, tag: "Pizza" },
      { establishment_id: 11, tag: "Hamburgers" },
      { establishment_id: 11, tag: "Opening Hours" },
      { establishment_id: 12, tag: "French" },
      { establishment_id: 12, tag: "Bistro" },
      { establishment_id: 12, tag: "Food-Control Registered" },
    ],
  });

  const places = await loadPlacesFromD1(db);

  assert.equal(places.find((place) => place.id === 11)?.cuisine, "pizza;burger");
  assert.equal(places.find((place) => place.id === 12)?.cuisine, "french;bistro");
});

const basePlaceRow = {
  id: 0,
  name: "Base",
  type: "Restaurant",
  district: "Södermalm",
  description: "Base place.",
  address: null,
  website: null,
  price_level: null,
  latitude: 59.31,
  longitude: 18.08,
  chain_status: "independent",
  lifecycle_state: null,
  validation_label: null,
  validation_notes: null,
  rating_average: null,
  reliable_rating_count: null,
  review_count: null,
  category_mean_rating: null,
  search_impressions: null,
  profile_views: null,
  map_marker_clicks: null,
  saves: null,
  direction_requests: null,
  confirmed_visits: null,
  repeat_visits: null,
  recommendations: null,
  recent_saves: null,
  latest_rating_at: null,
  latest_engagement_at: null,
  specialty_verified: null,
  own_roastery: null,
  traceable_coffee: null,
  filter_coffee: null,
  espresso_based: null,
  rotating_roasters: null,
  single_origin: null,
  manual_brew_methods_json: null,
  decaf_available: null,
  beans_for_sale: null,
  verification_sources: null,
};

function fakeD1({ places, evidence, tags }) {
  return {
    prepare(query) {
      return {
        all() {
          if (query.includes("FROM establishments")) {
            return Promise.resolve({ results: places });
          }

          if (query.includes("FROM evidence_sources")) {
            return Promise.resolve({ results: evidence });
          }

          if (query.includes("FROM establishment_tags")) {
            return Promise.resolve({ results: tags });
          }

          return Promise.resolve({ results: [] });
        },
      };
    },
  };
}
