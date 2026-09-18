import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  appendConciergeTurn,
  buildConciergeQuerySuccess,
  conciergeDisplayAnswer,
  conciergeModeLabel,
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
