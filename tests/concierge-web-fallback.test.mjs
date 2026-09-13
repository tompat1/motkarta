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

test("isProhibitedDomain rejects commercial aggregators, chains, and permits independent venues", () => {
  assert.equal(isProhibitedDomain("https://www.yelp.com/biz/stockholm"), true);
  assert.equal(isProhibitedDomain("https://www.yelp.se/biz/stockholm"), true);
  assert.equal(isProhibitedDomain("https://tripadvisor.com/restaurants"), true);
  assert.equal(isProhibitedDomain("https://www.tripadvisor.se/restaurant"), true);
  assert.equal(isProhibitedDomain("https://instagram.com/p/123"), true);
  assert.equal(isProhibitedDomain("https://google.com/maps"), true);
  assert.equal(isProhibitedDomain("https://www.thefork.se/restaurant"), true);
  assert.equal(isProhibitedDomain("https://www.gastrogate.com/restaurang"), true);
  assert.equal(isProhibitedDomain("https://www.bokabord.se/boka"), true);
  assert.equal(isProhibitedDomain("https://starbucks.se/cafe"), true);
  assert.equal(isProhibitedDomain("https://espressohouse.com/menu"), true);
  assert.equal(isProhibitedDomain("https://waynescoffee.se/om-oss"), true);
  assert.equal(isProhibitedDomain("https://mcdonalds.se/mat"), true);
  assert.equal(isProhibitedDomain("https://max.se/restauranger"), true);

  assert.equal(isProhibitedDomain("https://svd.se/krog"), false);
  assert.equal(isProhibitedDomain("https://dn.se/restaurang"), false);
  assert.equal(isProhibitedDomain("https://thatsup.se/stockholm"), false);
  assert.equal(isProhibitedDomain("https://85kvadrattapas.se/polsk-tapas"), false);
  assert.equal(isProhibitedDomain("https://abyssinia.se/"), false);
  assert.equal(isProhibitedDomain("https://lalibela.se/"), false);
  assert.equal(isProhibitedDomain("https://guidetostockholm.se/cafeer"), false);
  assert.equal(isProhibitedDomain("https://kaffebar.se/om-oss"), false);
});

test("cleanCommercialText strips star ratings, review counts, and promo ads", async () => {
  const { cleanCommercialText } = await import("../lib/concierge/web-search.ts");
  const raw = "Betyg: 4.5 av 5 stjärnor. 142 omdömen. Boka bord online för 20% rabatt. Sponsrad krog. Mysig polsk krog i Vasastan med hemgjorda piroger.";
  const cleaned = cleanCommercialText(raw);

  assert.equal(cleaned, "Mysig polsk krog i Vasastan med hemgjorda piroger.");
  assert.ok(!cleaned.includes("4.5"));
  assert.ok(!cleaned.includes("stjärnor"));
  assert.ok(!cleaned.includes("omdömen"));
  assert.ok(!cleaned.includes("Boka bord"));
  assert.ok(!cleaned.includes("rabatt"));
  assert.ok(!cleaned.includes("Sponsrad"));
});

test("cleanCommercialTitle unescapes entities and removes commercial directory suffixes", async () => {
  const { cleanCommercialTitle } = await import("../lib/concierge/web-search.ts");
  assert.equal(cleanCommercialTitle("PIEROGI PARK AND BAR, Stockholm - Tripadvisor"), "PIEROGI PARK AND BAR, Stockholm");
  assert.equal(cleanCommercialTitle("Top 10 Best Pierogi in Stockholm - Yelp"), "Pierogi in Stockholm");
  assert.equal(cleanCommercialTitle("85 Kvadrat Tapas &amp; Vinbar"), "85 Kvadrat Tapas & Vinbar");
});

test("filterExternalWebResults strips prohibited domains, commercial chains, and sanitizes snippets", async () => {
  const { filterExternalWebResults } = await import("../lib/concierge/web-search.ts");
  const input = [
    { title: "Pierogi Park - Tripadvisor", url: "https://www.tripadvisor.se/r1", snippet: "Betyg 5.0 av 5 stjärnor på Tripadvisor.", domain: "tripadvisor.se" },
    { title: "Espresso House", url: "https://espressohouse.com/latte", snippet: "Kaffekedja i Stockholm.", domain: "espressohouse.com" },
    { title: "85 Kvadrat Tapas - Thatsup", url: "https://www.85kvadrattapas.se/polsk-tapas/", snippet: "Traditionella polska piroger och tapas. Boka bord online!", domain: "85kvadrattapas.se" },
    { title: "Abyssinia", url: "https://abyssinia.se/", snippet: "Autentisk etiopisk mat i Vasastan sedan 1990.", domain: "abyssinia.se" },
  ];

  const results = filterExternalWebResults(input);
  assert.equal(results.length, 2);
  assert.equal(results[0].title, "85 Kvadrat Tapas");
  assert.equal(results[0].snippet, "Traditionella polska piroger och tapas.");
  assert.equal(results[1].title, "Abyssinia");
  assert.equal(results[1].snippet, "Autentisk etiopisk mat i Vasastan sedan 1990.");
});

test("renderAnswer formats webSearch.externalResults inline when zero catalog cards match", async () => {
  const { renderAnswer } = await import("../lib/concierge/response.ts");
  const res = {
    intro: "Inga ställen matchade i katalogen. Här är automatiskt funna oberoende webbträffar:",
    cards: [],
    webSearch: {
      query: "pierogi",
      links: [],
      externalResults: [
        { title: "85 Kvadrat Tapas", url: "https://85kvadrattapas.se", snippet: "Traditionella piroger.", domain: "85kvadrattapas.se" },
      ],
    },
  };

  const answer = renderAnswer(res);
  assert.ok(answer.includes("85 Kvadrat Tapas"));
  assert.ok(answer.includes("85kvadrattapas.se"));
  assert.ok(answer.includes("Traditionella piroger."));
});

test("styles.css defines inline web search card and guarantee banner styles", async () => {
  const { readFileSync } = await import("node:fs");
  const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

  assert.ok(css.includes(".concierge-inline-web-enrichment"));
  assert.ok(css.includes(".concierge-inline-web-banner"));
  assert.ok(css.includes(".concierge-inline-web-guarantee"));
  assert.ok(css.includes(".concierge-card.concierge-web-card"));
  assert.ok(css.includes(".concierge-web-domain-badge"));
  assert.ok(css.includes(".concierge-card-web-snippet"));
});

