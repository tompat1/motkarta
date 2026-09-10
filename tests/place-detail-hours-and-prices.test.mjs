import test from "node:test";
import assert from "node:assert/strict";
import { rowToPlaceInput } from "../lib/place-records.ts";
import { placeFacts } from "../lib/concierge/facts.ts";

test("toPlaceInput preserves address, opening_hours, and price fields", () => {
  const mockRow = {
    id: 101,
    name: "Trattoria Bella",
    type: "Restaurant",
    district: "Vasastan",
    description: "Authentic pasta in Vasastan",
    address: "Sveavägen 42, Vasastan",
    website: "https://bellapasta.se",
    price_level: 2,
    opening_hours: "Mo-Sa 17:00-23:00",
    price_sek: "160–320",
    latitude: 59.341,
    longitude: 18.055,
    chain_status: "independent",
    lifecycle_state: "verified",
    validation_label: "known_hidden_gem",
    validation_notes: null,
    rating_average: 4.6,
    reliable_rating_count: 85,
    review_count: 120,
    category_mean_rating: 4.2,
    search_impressions: 200,
    profile_views: 150,
    map_marker_clicks: 80,
    saves: 45,
    direction_requests: 30,
    confirmed_visits: 25,
    repeat_visits: 12,
    recommendations: 10,
    recent_saves: 5,
    latest_rating_at: "2026-09-01T12:00:00Z",
    latest_engagement_at: "2026-09-01T12:00:00Z",
    specialty_verified: 0,
    own_roastery: 0,
    traceable_coffee: 0,
    filter_coffee: 0,
    espresso_based: 0,
    rotating_roasters: 0,
    single_origin: 0,
    manual_brew_methods_json: null,
    decaf_available: 0,
    beans_for_sale: 0,
    verification_sources: 0,
  };

  const place = rowToPlaceInput(mockRow, [], [{ id: 1, establishment_id: 101, tag: "Italian" }]);

  assert.equal(place.id, 101);
  assert.equal(place.name, "Trattoria Bella");
  assert.equal(place.address, "Sveavägen 42, Vasastan");
  assert.equal(place.openingHours, "Mo-Sa 17:00-23:00");
  assert.equal(place.priceSEK, "160–320");
  assert.equal(place.priceLevel, 2);
});

test("placeFacts includes openingHours and priceSEK facts for Concierge search and retrieval", () => {
  const samplePlace = {
    id: 102,
    name: "Café Dropp",
    kind: "Specialty coffee",
    area: "Södermalm",
    address: "Wollmar Yxkullsgatan 10, Södermalm",
    openingHours: "Mo-Fr 08:00-18:00; Sa-Su 10:00-17:00",
    priceSEK: "45–140",
    priceLevel: 1,
    tags: ["Specialty coffee", "Fika"],
  };

  const facts = placeFacts(samplePlace);
  assert.equal(facts.id, 102);

  const hoursFact = facts.facts.find((f) => f.field === "openingHours");
  assert.ok(hoursFact);
  assert.equal(hoursFact.value, "Mo-Fr 08:00-18:00; Sa-Su 10:00-17:00");

  const priceFact = facts.facts.find((f) => f.field === "priceSEK");
  assert.ok(priceFact);
  assert.equal(priceFact.value, "45–140");
});
