import assert from "node:assert/strict";
import test from "node:test";

import { extractStructuredFilters, retrieveAndSynthesize } from "../functions/api/concierge.ts";
import { demoPlaces } from "../lib/demo-places.ts";
import { parseConciergeAnswer } from "../lib/concierge-parser.ts";

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

test("parseConciergeAnswer parses markdown output into structured cards and charter", () => {
  const markdown = `Based on our database:

### **Drop Coffee**
• **Why it matches**: Matches discovery criteria
• **Area / Location**: Mariatorget
• **Price confidence**: Medium
• **Opening-hours confidence**: High confidence
• **Data sources & License**: OpenStreetMap (ODbL)

--- ETHICAL & TECHNICAL CHARTER ---
• Unbiased & Plural
• Grounded Facts`;

  const parsed = parseConciergeAnswer(markdown);

  assert.equal(parsed.cards.length, 1);
  assert.equal(parsed.cards[0].name, "Drop Coffee");
  assert.equal(parsed.cards[0].area, "Mariatorget");
  assert.equal(parsed.cards[0].hoursConfidence, "High confidence");
  assert.equal(parsed.charter.length, 2);
  assert.equal(parsed.charter[0], "Unbiased & Plural");
});

test("parseConciergeAnswer parses legacy inline bullets into structured cards", () => {
  const legacyText = `Based on our auditable dataset for "specialty coffee":
• Bönor och Blad (Specialty coffee in Central Stockholm) — 43 recommendation score
• Stockholm Roast (Specialty coffee in Central Stockholm) — 43 recommendation score
Recommendations prioritize transparent quality and discovery signals over raw review volume.`;

  const parsed = parseConciergeAnswer(legacyText);

  assert.equal(parsed.cards.length, 2);
  assert.equal(parsed.cards[0].name, "Bönor och Blad");
  assert.equal(parsed.cards[0].area, "Central Stockholm");
  assert.equal(parsed.cards[1].name, "Stockholm Roast");
  assert.ok(parsed.charter.length > 0);
});
