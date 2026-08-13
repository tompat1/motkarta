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

test("RAG retrieveAndSynthesize excludes commercial chains Nespresso and Kahls and prioritizes Pascal and Lykke", () => {
  const mockPlaces = [
    { id: 99, name: "Nespresso", kind: "Specialty coffee", area: "Central Stockholm", note: "Chain", tags: [], evidenceLabel: "OSM", ratingAverage: 4.0, reliableRatingCount: 100, reviewCount: 100, categoryMeanRating: 4.0, categoryPopularityRaw: 0.5, localPopularityPercentile: 0, ageDays: 100, daysSinceFreshEvidence: 10, evidence: { specialistGuide: 0, independentEditorial: 0, verifiedUserRating: 0.5, repeatVisits: 10, recentReviews: 10, credibleReviewers: 10, inspectionStatus: 50, verifiedAttributes: 0, dataFreshness: 50, confidence: "Low" } },
    { id: 98, name: "Kahls Kaffe", kind: "Specialty coffee", area: "Central Stockholm", note: "Chain", tags: [], evidenceLabel: "OSM", ratingAverage: 4.0, reliableRatingCount: 100, reviewCount: 100, categoryMeanRating: 4.0, categoryPopularityRaw: 0.5, localPopularityPercentile: 0, ageDays: 100, daysSinceFreshEvidence: 10, evidence: { specialistGuide: 0, independentEditorial: 0, verifiedUserRating: 0.5, repeatVisits: 10, recentReviews: 10, credibleReviewers: 10, inspectionStatus: 50, verifiedAttributes: 0, dataFreshness: 50, confidence: "Low" } },
    ...demoPlaces,
  ];

  const result = retrieveAndSynthesize("specialty coffee", mockPlaces);
  const recommendedNames = result.recommendedPlaces.map((p) => p.name);

  assert.equal(recommendedNames.includes("Nespresso"), false);
  assert.equal(recommendedNames.includes("Kahls Kaffe"), false);
  assert.ok(recommendedNames.some((n) => ["Pascal", "Lykke", "Drop Coffee", "Solkant", "Volca", "Muttley"].some(s => n.includes(s))));
});

test("RAG retrieveAndSynthesize ranks Polish restaurants for 'food from Poland' query", () => {
  const result = retrieveAndSynthesize("I want to eat food from Poland", demoPlaces);
  const recommendedNames = result.recommendedPlaces.map((p) => p.name);

  assert.ok(recommendedNames.some((n) => n.includes("Pyza") || n.includes("Babcia")));
  assert.equal(recommendedNames.some((n) => n.includes("Bakery") || n.includes("Café")), false);
});

test("RAG retrieveAndSynthesize ranks Mexican places for 'Mexican food' query", () => {
  const result = retrieveAndSynthesize("Mexican food", demoPlaces);
  const recommendedNames = result.recommendedPlaces.map((p) => p.name);

  assert.ok(recommendedNames.some((n) => n.includes("La Neta") || n.includes("Cheibo")));
});

test("RAG retrieveAndSynthesize ranks Spanish places for 'Spanish tapas' query", () => {
  const result = retrieveAndSynthesize("Spanish tapas", demoPlaces);
  const recommendedNames = result.recommendedPlaces.map((p) => p.name);

  assert.ok(recommendedNames.some((n) => n.includes("Ramblas") || n.includes("Boqueria")));
});

test("RAG retrieveAndSynthesize ranks French bistros for 'French bistro' query", () => {
  const result = retrieveAndSynthesize("French bistro", demoPlaces);
  const recommendedNames = result.recommendedPlaces.map((p) => p.name);

  assert.ok(recommendedNames.some((n) => n.includes("Pastis") || n.includes("Sud")));
});

test("RAG retrieveAndSynthesize ranks Thai places for 'Best thai place in Stockholm' query and never returns coffee places", () => {
  const result = retrieveAndSynthesize("Best thai place in Stockholm", demoPlaces);
  const recommendedNames = result.recommendedPlaces.map((p) => p.name);

  assert.ok(recommendedNames.some((n) => n.includes("Thai") || n.includes("Koh Phangan")));
  assert.equal(recommendedNames.some((n) => n.includes("Pascal") || n.includes("Lykke") || n.includes("Coffee")), false);
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
