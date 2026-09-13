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
  assert.ok(result.recommendedPlaces.length <= 5);
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

test("RAG retrieveAndSynthesize returns strictly Södermalm Thai landmark venues for 'bästa thai ställena på söder'", () => {
  const result = retrieveAndSynthesize("bästa thai ställena på söder", livePlaces);
  const recommendedPlaces = result.recommendedPlaces;

  assert.ok(recommendedPlaces.length > 0, "Should return at least 1 Södermalm Thai restaurant");
  assert.ok(
    recommendedPlaces.every((p) => (p.area || "").toLowerCase().includes("södermalm") || (p.area || "").toLowerCase().includes("söder")),
    "All returned places must be strictly in Södermalm",
  );
  const names = recommendedPlaces.map((p) => p.name);
  assert.ok(
    names.some((n) => ["Koh Phangan", "Pat's Place", "Thaiboat", "Elefantpojken", "Chao Na"].includes(n)),
    `Expected landmark Södermalm Thai spot, got: ${names.join(", ")}`,
  );
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

// Constraint behavior is tested on explicit source facts, rather than expecting
// unrelated real-catalog results when the requested dish/location is absent.
const fixturePlaces = JSON.parse(await readFile(new URL('./fixtures/concierge/places.json', import.meta.url), 'utf8')).places;
for (const [query, ids] of [
  ['specialty coffee och kardemummabulle på Södermalm', [4]],
  ['best Mexican tacos in Vasastan', [2]],
  ['fransk bistro i Gamla Stan', [3]],
  ['artisan bakery with sourdough bread in Zinkensdamm', [5]],
  ['polska pierogi i Södermalm', [1]],
  ['handmade Polish pierogi in Gamla Stan', []],
  ['hidden gems for dinner near me', []],
  ['dolda pärlor för middag nära mig', []],
]) {
  test(`grounded constraints: ${query}`, () => {
    const result = retrieveAndSynthesize(query, fixturePlaces);
    assert.deepEqual(result.recommendedPlaces.map((p) => p.id), ids);
    assert.equal(result.status, ids.length ? 'ok' : 'clarification');
  });
}

test("extractStructuredFilters parses Swedish cuisine keywords", () => {
  const filters = extractStructuredFilters("mexikanska tacos och familjeägd restaurang till rimligt pris");
  assert.ok(filters.cuisines.includes("mexican"), "Should detect Mexican cuisine from 'mexikanska'");
  assert.equal(filters.independent_preferred, true, "Should detect 'familjeägd' as independent");
  assert.equal(filters.price_max, 250, "Should detect 'rimligt pris' as affordable");
});

test("extractStructuredFilters parses Swedish burger keywords (burgare, burgaren, hamburgare)", () => {
  assert.deepEqual(extractStructuredFilters("bästa burgaren i stan").cuisines, ["burger"]);
  assert.deepEqual(extractStructuredFilters("hamburgare på söder").cuisines, ["burger"]);
  assert.deepEqual(extractStructuredFilters("best burger in town").cuisines, ["burger"]);
});

test("RAG retrieveAndSynthesize returns top burger spots and deduplicates establishments for 'bästa burgaren i stan'", () => {
  const resultSv = retrieveAndSynthesize("bästa burgaren i stan", livePlaces, { language: "sv" });
  const resultEn = retrieveAndSynthesize("best burger in town", livePlaces, { language: "en" });

  assert.ok(resultSv.recommendedPlaces.length > 0, "Swedish burger search should return results");
  assert.ok(resultEn.recommendedPlaces.length > 0, "English burger search should return results");

  const namesSv = resultSv.recommendedPlaces.map((p) => p.name);
  const namesEn = resultEn.recommendedPlaces.map((p) => p.name);

  // Both should prioritize top-rated independent burger venues like Franky's or Lily's or Bun Meat Bun
  assert.ok(namesSv.some((n) => n.includes("Franky") || n.includes("Lily") || n.includes("Bun Meat Bun")), `Expected top burger venue in Swedish, got: ${namesSv.join(", ")}`);
  assert.ok(namesEn.some((n) => n.includes("Franky") || n.includes("Lily") || n.includes("Bun Meat Bun")), `Expected top burger venue in English, got: ${namesEn.join(", ")}`);

  // No duplicate venue names in recommendations
  const uniqueNamesSv = new Set(namesSv);
  assert.equal(namesSv.length, uniqueNamesSv.size, "Should not return duplicate places in results");

  // Commercial chain O'Learys should be excluded
  assert.equal(namesSv.some((n) => n.toLowerCase().includes("o'learys") || n.toLowerCase().includes("olearys")), false);
  assert.equal(namesEn.some((n) => n.toLowerCase().includes("o'learys") || n.toLowerCase().includes("olearys")), false);
});

test("concierge search input has exact aria-label and top-nav CONCIERGE and OnboardingModal focus input", async () => {
  const appSource = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");

  assert.equal(
    appSource.includes('aria-label={lang === "sv" ? "Sök ställe, kök, område eller fråga" : "Search place, cuisine, region or ask"}'),
    true,
  );
  assert.equal(appSource.includes("focusSearchInput()"), true);
  assert.equal(appSource.includes('onOpenConcierge={focusSearchInput}'), true);
  assert.equal(appSource.includes('href="#concierge"'), true);
});

test("RAG retrieveAndSynthesize lists ALL places in region when user writes Gamla Stan, gamlastan, or any district", () => {
  const resultGamlaStan = retrieveAndSynthesize("Gamla Stan", livePlaces, { language: "sv" });
  const resultGamlaStanLower = retrieveAndSynthesize("gamla stan", livePlaces, { language: "sv" });
  const resultGamlastan = retrieveAndSynthesize("gamlastan", livePlaces, { language: "sv" });

  // In live places, there were 128 places in Gamla Stan (2 are Espresso House chains, leaving 126 eligible).
  // With Café Skeppsholmen and Harö Krog moved to Skeppsholmen, and Brasserie Hutton and Lilla Gästabud moved to Riddarholmen, there are 122 eligible places in Gamla Stan.
  assert.equal(resultGamlaStan.cards.length, 122, "Should return all 122 places in Gamla Stan");
  assert.equal(resultGamlaStanLower.cards.length, 122, "Case-insensitive query should also return all places");
  assert.equal(resultGamlastan.cards.length, 122, "Compound word gamlastan should also return all places");
  assert.equal(resultGamlaStan.recommendedPlaces.length, 122);

  assert.ok(
    resultGamlaStan.intro.includes("alla 122 ställen i Gamla Stan"),
    `Intro should state all 122 places in Gamla Stan, got: ${resultGamlaStan.intro}`,
  );

  // Riddarholmen (4 places: Riddaren Mat & Catering, Mälardrottningen Brasserie Hutton, Lilla Gästabud, Gamla Riksarkivet)
  const resultRiddarholmen = retrieveAndSynthesize("Riddarholmen", livePlaces, { language: "sv" });
  assert.equal(resultRiddarholmen.cards.length, 4, "Should return all 4 places in Riddarholmen");
  assert.ok(resultRiddarholmen.intro.includes("alla 4 ställen i Riddarholmen"));

  // Skeppsholmen (2 places: Café Skeppsholmen, Harö Krog)
  const resultSkeppsholmen = retrieveAndSynthesize("Skeppsholmen", livePlaces, { language: "sv" });
  assert.equal(resultSkeppsholmen.cards.length, 2, "Should return all 2 places in Skeppsholmen");
  assert.ok(resultSkeppsholmen.intro.includes("alla 2 ställen i Skeppsholmen"));

  // Gärdet (39 places)
  const resultGardet = retrieveAndSynthesize("Gärdet", livePlaces, { language: "sv" });
  assert.equal(resultGardet.cards.length, 39, "Should return all 39 places in Gärdet");
  assert.ok(resultGardet.intro.includes("alla 39 ställen i Gärdet"));

  // Kransen (41 places)
  const resultKransen = retrieveAndSynthesize("Kransen", livePlaces, { language: "sv" });
  assert.equal(resultKransen.cards.length, 41, "Should return all 41 places in Kransen");
  assert.ok(resultKransen.intro.includes("alla 41 ställen i Kransen"));

  // Vasastan (205 places)
  const resultVasastan = retrieveAndSynthesize("Vasastan", livePlaces, { language: "sv" });
  assert.equal(resultVasastan.cards.length, 205, "Should return all 205 places in Vasastan");

  // Non-district query still capped at 5
  const resultGeneric = retrieveAndSynthesize("cardamom bun and filter coffee", livePlaces);
  assert.ok(resultGeneric.cards.length <= 5, "Non-district queries must remain capped at top 5 recommendations");
});

test("extractStructuredFilters parses Swedish Chinese cuisine keywords", () => {
  assert.deepEqual(extractStructuredFilters("kinaställen på kungsholmen").cuisines, ["chinese"]);
  assert.deepEqual(extractStructuredFilters("kinaställe kungsholmen").cuisines, ["chinese"]);
  assert.deepEqual(extractStructuredFilters("bästa kinastället i stan").cuisines, ["chinese"]);
  assert.deepEqual(extractStructuredFilters("kinarestauranger i stockholm").cuisines, ["chinese"]);
  assert.deepEqual(extractStructuredFilters("kinakrog på söder").cuisines, ["chinese"]);
  assert.deepEqual(extractStructuredFilters("kinamat").cuisines, ["chinese"]);
  assert.deepEqual(extractStructuredFilters("dumplings och dim sum").cuisines, ["chinese"]);
});

test("RAG retrieveAndSynthesize returns all Chinese places on Kungsholmen for 'kinaställen på kungsholmen'", () => {
  const result = retrieveAndSynthesize("kinaställen på kungsholmen", livePlaces, { language: "sv" });

  assert.equal(result.status, "ok");
  assert.equal(result.cards.length, 12, "Should return all 12 Chinese places on Kungsholmen");
  assert.ok(result.intro.includes("alla 12 ställen i Kungsholmen"));

  const names = result.cards.map((c) => c.name);
  assert.ok(names.includes("Eat East"));
  assert.ok(names.includes("Restaurang Hong Kong"));
  assert.ok(names.includes("Plus 86"));
  assert.ok(names.includes("Hangchow"));
  assert.ok(names.includes("China Corner"));
  assert.ok(names.includes("Lao Wai"));
  assert.ok(names.includes("Stråket"));
  assert.ok(names.includes("Kinamuren"));
  assert.ok(names.includes("Hemma hos Dong"));
  assert.ok(names.includes("Ox Lan"));
  assert.ok(names.includes("Lilla Kina"));
  assert.ok(names.includes("Weidao"));

  for (const card of result.cards) {
    assert.equal(card.area, "Kungsholmen");
  }
});

