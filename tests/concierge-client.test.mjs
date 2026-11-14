import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  appendConciergeTurn,
  buildConciergeQuerySuccess,
  conciergeDisplayAnswer,
  conciergeModeLabel,
  buildFollowUpChips,
} from "../src/app/concierge-client.ts";
import { retrieveAndSynthesize } from "../lib/concierge/response.ts";

const places = JSON.parse(
  await readFile(new URL("./fixtures/concierge/places.json", import.meta.url), "utf8"),
).places;

test("conciergeDisplayAnswer prefers rendered answer text for normal responses", () => {
  const response = retrieveAndSynthesize("pierogi", places, { language: "sv" });
  assert.match(conciergeDisplayAnswer(response), /Motkartas katalog|Pierogi/i);
});

test("appendConciergeTurn keeps the latest user and assistant messages", () => {
  const response = retrieveAndSynthesize("pierogi", places, { language: "sv" });
  const messages = appendConciergeTurn([], "pierogi", response, 1000);
  assert.equal(messages.length, 2);
  assert.equal(messages[0].role, "user");
  assert.equal(messages[1].role, "assistant");
});

test("conciergeModeLabel describes retrieval and synthesis modes", () => {
  const response = retrieveAndSynthesize("pierogi", places, { language: "en" });
  assert.match(conciergeModeLabel(response, "en"), /Lexical search · Template · \d+ matches of/);
});

test("buildConciergeQuerySuccess returns answer, response and chat turns together", () => {
  const response = retrieveAndSynthesize("pierogi", places, { language: "sv" });
  const applied = buildConciergeQuerySuccess([], "pierogi", response, 1000);
  assert.equal(applied.response, response);
  assert.match(applied.answer, /./);
  assert.equal(applied.chatMessages.length, 2);
});

test("App.tsx wires structured concierge responses into answer state", async () => {
  const appSource = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
  assert.match(appSource, /buildConciergeQuerySuccess\(currentMessages, queryText, payload/);
  assert.match(appSource, /buildConciergeQuerySuccess\(currentMessages, queryText, result/);
  assert.match(appSource, /if \(conciergeResponse\?\.cards\.length && conciergePlaces\.length > 0\)/);
});

test("buildFollowUpChips dynamically adapts alternative district and context", () => {
  const soderQuery = "specialty coffee och kardemummabulle på Södermalm";
  const soderResponse = retrieveAndSynthesize(soderQuery, places, { language: "sv" });
  const soderChips = buildFollowUpChips(soderQuery, soderResponse, [], "sv");
  const soderLabels = soderChips.map((c) => c.label);

  assert.equal(soderLabels.includes("På Söder då?"), false, "Must not suggest Södermalm when already queried");
  assert.equal(soderLabels.includes("På Östermalm då?"), true, "Must suggest alternative district like Östermalm");
  assert.equal(soderLabels.includes("Fler förslag"), true);

  // When querying Vasastan, Södermalm should be suggested
  const vasastanQuery = "bästa pizza i Vasastan";
  const vasaResponse = retrieveAndSynthesize(vasastanQuery, places, { language: "sv" });
  const vasaChips = buildFollowUpChips(vasastanQuery, vasaResponse, [], "sv");
  assert.equal(vasaChips.some((c) => c.label === "På Söder då?"), true);
  assert.equal(vasaChips.some((c) => c.label === "I Vasastan då?"), false);

  // When querying citywide without district, Södermalm is suggested
  const cityQuery = "bästa pizza i stan";
  const cityResponse = retrieveAndSynthesize(cityQuery, places, { language: "sv" });
  const cityChips = buildFollowUpChips(cityQuery, cityResponse, [], "sv");
  assert.equal(cityChips.some((c) => c.label === "På Söder då?"), true);

  // When price is constrained, does not suggest 'Billigare'
  const cheapQuery = "pizza under 100";
  const cheapChips = buildFollowUpChips(cheapQuery, undefined, [], "sv");
  assert.equal(cheapChips.some((c) => c.label === "Billigare"), false);
  assert.equal(cheapChips.some((c) => c.label.includes("uteservering")), true);

  // When searching for an unknown specific place/POI like 450 grader, offers to add/suggest it
  const unknownPlaceQuery = "450 grader";
  const unknownResponse = retrieveAndSynthesize(unknownPlaceQuery, places, { language: "sv" });
  const unknownChips = buildFollowUpChips(unknownPlaceQuery, unknownResponse, [], "sv");
  assert.equal(unknownChips.some((c) => c.label.includes("Tipsa om")), true);
  assert.equal(unknownChips.some((c) => c.query.includes("Lägg till ställe 450 grader")), true);
});
