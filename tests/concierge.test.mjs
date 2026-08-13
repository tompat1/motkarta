import assert from "node:assert/strict";
import test from "node:test";

import { extractStructuredFilters, retrieveAndSynthesize } from "../functions/api/concierge.ts";
import { demoPlaces } from "../lib/demo-places.ts";

test("extractStructuredFilters parses family-run, Polish/Eastern European, not expensive, outside tourist centre query", () => {
  const query = "I want something family-run, Polish or Eastern European, not expensive, near public transport and outside the tourist centre.";
  const filters = extractStructuredFilters(query);

  assert.deepEqual(filters.cuisines, ["polish", "eastern_european"]);
  assert.equal(filters.price_max, 250);
  assert.equal(filters.independent_preferred, true);
  assert.equal(filters.tourist_centre, false);
  assert.equal(filters.near_public_transport, true);
});

test("RAG retrieveAndSynthesize ranks relevant places and synthesizes grounded answer", () => {
  const result = retrieveAndSynthesize("cardamom bun and filter coffee", demoPlaces);

  assert.ok(result.answer.toLowerCase().includes("based on our auditable open dataset"));
  assert.ok(result.recommendedPlaces.length > 0);
  assert.ok(result.recommendedPlaces.length <= 3);
  assert.ok(result.recommendedPlaces[0].id);
  assert.ok(result.recommendedPlaces[0].name);
});
