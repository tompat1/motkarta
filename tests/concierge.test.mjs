import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { extractStructuredFilters, retrieveAndSynthesize } from "../functions/api/concierge.ts";
import { parseConciergeAnswer } from "../lib/concierge-parser.ts";

const rawPlacesData = JSON.parse(await readFile(new URL("../public/data/places.json", import.meta.url), "utf8"));
const livePlaces = rawPlacesData.places ?? rawPlacesData;

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
  const result = retrieveAndSynthesize("cardamom bun and filter coffee", livePlaces);

  assert.ok(result.answer.toLowerCase().includes("based on our auditable open dataset"));
  assert.ok(result.recommendedPlaces.length > 0);
  assert.ok(result.recommendedPlaces.length <= 3);
  assert.ok(result.recommendedPlaces[0].id);
  assert.ok(result.recommendedPlaces[0].name);
});

test("RAG retrieveAndSynthesize excludes commercial chains Nespresso and Kahls and prioritizes specialty venues", () => {
  const mockPlaces = [
    { id: 99, name: "Nespresso", kind: "Specialty coffee", area: "Central Stockholm", note: "Chain", tags: [], evidenceLabel: "OSM", ratingAverage: 4.0, reliableRatingCount: 100, reviewCount: 100, categoryMeanRating: 4.0, categoryPopularityRaw: 0.5, localPopularityPercentile: 0, ageDays: 100, daysSinceFreshEvidence: 10, evidence: { specialistGuide: 0, independentEditorial: 0, verifiedUserRating: 0.5, repeatVisits: 10, recentReviews: 10, credibleReviewers: 10, inspectionStatus: 50, verifiedAttributes: 0, dataFreshness: 50, confidence: "Low" } },
    { id: 98, name: "Kahls Kaffe", kind: "Specialty coffee", area: "Central Stockholm", note: "Chain", tags: [], evidenceLabel: "OSM", ratingAverage: 4.0, reliableRatingCount: 100, reviewCount: 100, categoryMeanRating: 4.0, categoryPopularityRaw: 0.5, localPopularityPercentile: 0, ageDays: 100, daysSinceFreshEvidence: 10, evidence: { specialistGuide: 0, independentEditorial: 0, verifiedUserRating: 0.5, repeatVisits: 10, recentReviews: 10, credibleReviewers: 10, inspectionStatus: 50, verifiedAttributes: 0, dataFreshness: 50, confidence: "Low" } },
    ...livePlaces,
  ];

  const result = retrieveAndSynthesize("specialty coffee", mockPlaces);
  const recommendedNames = result.recommendedPlaces.map((p) => p.name);

  assert.equal(recommendedNames.includes("Nespresso"), false);
  assert.equal(recommendedNames.includes("Kahls Kaffe"), false);
  assert.ok(
    recommendedNames.some((n) =>
      [
        "Pascal",
        "Lykke",
        "Drop Coffee",
        "Solkant",
        "Volca",
        "Muttley",
        "Johan & Nyström",
        "A.B.Café",
        "Nordic Brew Lab",
        "Standout",
        "Gast",
        "Café Blom",
        "Kaffe",
        "Rosteri",
      ].some((s) => n.includes(s)),
    ),
  );
});

test("RAG retrieveAndSynthesize ranks Polish restaurants for 'food from Poland' query", () => {
  const result = retrieveAndSynthesize("I want to eat food from Poland", livePlaces);
  const recommendedNames = result.recommendedPlaces.map((p) => p.name);

  assert.ok(recommendedNames.some((n) => n.includes("85 Kvadrat") || n.includes("Polish") || n.includes("Polsk") || n.includes("Piastowska")));
  assert.equal(recommendedNames.some((n) => n.includes("Burger") || n.includes("Pizza")), false);
});

test("RAG retrieveAndSynthesize ranks Mexican places for 'Mexican food' query", () => {
  const result = retrieveAndSynthesize("Mexican food", livePlaces);
  const recommendedNames = result.recommendedPlaces.map((p) => p.name);

  assert.ok(recommendedNames.some((n) => n.includes("YUC") || n.includes("Taco") || n.includes("Chelas") || n.includes("La Neta") || n.includes("MXCO")));
});

test("RAG retrieveAndSynthesize ranks Spanish places for 'Spanish tapas' query", () => {
  const result = retrieveAndSynthesize("Spanish tapas", livePlaces);
  const recommendedNames = result.recommendedPlaces.map((p) => p.name);

  assert.ok(recommendedNames.some((n) => n.includes("Tapas") || n.includes("Caliente") || n.includes("Xarcuteria") || n.includes("Boqueria") || n.includes("Ramblas")));
});

test("RAG retrieveAndSynthesize ranks Thai places for 'Best thai place in Stockholm' query and never returns coffee places", () => {
  const result = retrieveAndSynthesize("Best thai place in Stockholm", livePlaces);
  const recommendedNames = result.recommendedPlaces.map((p) => p.name);

  assert.ok(recommendedNames.some((n) => n.includes("Thai") || n.includes("Wok") || n.includes("Koh Phangan")));
  assert.equal(recommendedNames.some((n) => n.includes("Pascal") || n.includes("Lykke") || n.includes("Drop Coffee")), false);
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

// ─── Swedish prompt tests ────────────────────────────────────────────

test("SV: 'specialty coffee och kardemummabulle på Södermalm' returns specialty coffee or bakery in Södermalm", () => {
  const result = retrieveAndSynthesize("specialty coffee och kardemummabulle på Södermalm", livePlaces);
  assert.ok(result.recommendedPlaces.length > 0, "Should return at least one place");
  assert.ok(
    result.recommendedPlaces.some((p) => p.kind === "Specialty coffee" || p.kind === "Bakery" || p.kind === "Café"),
    "Should return specialty coffee, bakery or café places",
  );
});

test("SV: 'bästa mexikanska tacos i Vasastan' returns Mexican restaurants, no bakeries or coffee", () => {
  const result = retrieveAndSynthesize("bästa mexikanska tacos i Vasastan", livePlaces);
  assert.ok(result.recommendedPlaces.length > 0, "Should return at least one place");
  const kinds = result.recommendedPlaces.map((p) => p.kind);
  assert.ok(
    kinds.every((k) => k === "Restaurant"),
    `All results should be restaurants, got: ${kinds.join(", ")}`,
  );
});

test("SV: 'familjeägd fransk bistro med bra vin i Gamla Stan' returns French restaurants", () => {
  const result = retrieveAndSynthesize("familjeägd fransk bistro med bra vin i Gamla Stan", livePlaces);
  assert.ok(result.recommendedPlaces.length > 0, "Should return at least one place");
  const kinds = result.recommendedPlaces.map((p) => p.kind);
  assert.ok(
    kinds.every((k) => k === "Restaurant"),
    `All results should be restaurants, got: ${kinds.join(", ")}`,
  );
});

test("SV: 'hantverksbageri med surdegsbröd i Zinkensdamm' returns bakeries, no restaurants", () => {
  const result = retrieveAndSynthesize("hantverksbageri med surdegsbröd i Zinkensdamm", livePlaces);
  assert.ok(result.recommendedPlaces.length > 0, "Should return at least one place");
  const kinds = result.recommendedPlaces.map((p) => p.kind);
  assert.ok(
    kinds.every((k) => k === "Bakery" || k === "Café"),
    `All results should be bakery or café, got: ${kinds.join(", ")}`,
  );
});

test("SV: 'handgjorda polska pierogi i Gamla Stan' returns Polish restaurants, NO bakeries", () => {
  const result = retrieveAndSynthesize("handgjorda polska pierogi i Gamla Stan", livePlaces);
  assert.ok(result.recommendedPlaces.length > 0, "Should return at least one place");
  const kinds = result.recommendedPlaces.map((p) => p.kind);
  assert.ok(
    kinds.every((k) => k === "Restaurant"),
    `All results should be restaurants (not bakeries), got: ${kinds.join(", ")}`,
  );
});

test("SV: 'dolda pärlor för middag nära mig' returns restaurant hidden gems, no coffee shops", () => {
  const result = retrieveAndSynthesize("dolda pärlor för middag nära mig", livePlaces);
  assert.ok(result.recommendedPlaces.length > 0, "Should return at least one place");
  const kinds = result.recommendedPlaces.map((p) => p.kind);
  assert.ok(
    kinds.every((k) => k === "Restaurant"),
    `All results should be restaurants (dinner query), got: ${kinds.join(", ")}`,
  );
});

// ─── English prompt tests ────────────────────────────────────────────

test("EN: 'specialty coffee and a cardamom bun in Södermalm' returns specialty coffee or bakery", () => {
  const result = retrieveAndSynthesize("specialty coffee and a cardamom bun in Södermalm", livePlaces);
  assert.ok(result.recommendedPlaces.length > 0, "Should return at least one place");
  assert.ok(
    result.recommendedPlaces.some((p) => p.kind === "Specialty coffee" || p.kind === "Bakery" || p.kind === "Café"),
    "Should return specialty coffee, bakery or café places",
  );
});

test("EN: 'best Mexican tacos in Vasastan' returns Mexican restaurants, no bakeries or coffee", () => {
  const result = retrieveAndSynthesize("best Mexican tacos in Vasastan", livePlaces);
  assert.ok(result.recommendedPlaces.length > 0, "Should return at least one place");
  const kinds = result.recommendedPlaces.map((p) => p.kind);
  assert.ok(
    kinds.every((k) => k === "Restaurant"),
    `All results should be restaurants, got: ${kinds.join(", ")}`,
  );
});

test("EN: 'family-owned French bistro with great wine in Gamla Stan' returns French restaurants", () => {
  const result = retrieveAndSynthesize("family-owned French bistro with great wine in Gamla Stan", livePlaces);
  assert.ok(result.recommendedPlaces.length > 0, "Should return at least one place");
  const kinds = result.recommendedPlaces.map((p) => p.kind);
  assert.ok(
    kinds.every((k) => k === "Restaurant"),
    `All results should be restaurants, got: ${kinds.join(", ")}`,
  );
});

test("EN: 'artisan bakery with sourdough bread in Zinkensdamm' returns bakeries, no restaurants", () => {
  const result = retrieveAndSynthesize("artisan bakery with sourdough bread in Zinkensdamm", livePlaces);
  assert.ok(result.recommendedPlaces.length > 0, "Should return at least one place");
  const kinds = result.recommendedPlaces.map((p) => p.kind);
  assert.ok(
    kinds.every((k) => k === "Bakery" || k === "Café"),
    `All results should be bakery or café, got: ${kinds.join(", ")}`,
  );
});

test("EN: 'handmade Polish pierogi in Gamla Stan' returns Polish restaurants, NO bakeries", () => {
  const result = retrieveAndSynthesize("handmade Polish pierogi in Gamla Stan", livePlaces);
  assert.ok(result.recommendedPlaces.length > 0, "Should return at least one place");
  const kinds = result.recommendedPlaces.map((p) => p.kind);
  assert.ok(
    kinds.every((k) => k === "Restaurant"),
    `All results should be restaurants (not bakeries), got: ${kinds.join(", ")}`,
  );
});

test("EN: 'hidden gems for dinner near me' returns restaurant hidden gems, no coffee shops", () => {
  const result = retrieveAndSynthesize("hidden gems for dinner near me", livePlaces);
  assert.ok(result.recommendedPlaces.length > 0, "Should return at least one place");
  const kinds = result.recommendedPlaces.map((p) => p.kind);
  assert.ok(
    kinds.every((k) => k === "Restaurant"),
    `All results should be restaurants (dinner query), got: ${kinds.join(", ")}`,
  );
});

test("extractStructuredFilters parses Swedish cuisine keywords", () => {
  const filters = extractStructuredFilters("mexikanska tacos och familjeägd restaurang till rimligt pris");
  assert.ok(filters.cuisines.includes("mexican"), "Should detect Mexican cuisine from 'mexikanska'");
  assert.equal(filters.independent_preferred, true, "Should detect 'familjeägd' as independent");
  assert.equal(filters.price_max, 250, "Should detect 'rimligt pris' as affordable");
});
