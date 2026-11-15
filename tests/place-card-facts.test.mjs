import assert from "node:assert/strict";
import test from "node:test";

import {
  openingHoursFact,
  priceFact,
  visibleTagLabels,
  wifiFact,
} from "../src/app/place-card-facts.ts";
import { isInternalDiagnosticNote, getPublicPlaceNote } from "../src/app/shared.ts";

test("place card facts render placeholders without inventing missing facts", () => {
  assert.deepEqual(openingHoursFact({}, "en"), {
    label: "Hours unknown",
    title: "Verified opening hours are missing",
    isPlaceholder: true,
  });

  assert.deepEqual(priceFact({ priceLevel: 4 }, "en"), {
    label: "Price unknown",
    title: "Verified price information is missing",
    isPlaceholder: true,
  });

  assert.deepEqual(wifiFact({ tags: [] }, "en"), {
    label: "Wi-Fi unknown",
    title: "Verified Wi-Fi information is missing",
    isPlaceholder: true,
  });
});

test("place card facts display sourced values and hide duplicate Wi-Fi tags", () => {
  assert.equal(openingHoursFact({ openingHours: "Mo-Sa 17:00-23:00" }, "sv").label, "Mo-Sa 17:00-23:00");
  assert.equal(priceFact({ priceSEK: "145 SEK" }, "sv").label, "$ · 145 SEK");
  assert.equal(wifiFact({ tags: ["Wi-Fi", "Free Wi-Fi", "Bakery"] }, "en").label, "Free Wi-Fi");
  assert.deepEqual(visibleTagLabels(["Wi-Fi", "Free Wi-Fi", "Bakery"]), ["Bakery"]);
});

test("isInternalDiagnosticNote identifies backend pipeline and import messages", () => {
  assert.equal(isInternalDiagnosticNote("Bakery imported from OpenStreetMap. Needs source enrichment before quality scoring."), true);
  assert.equal(isInternalDiagnosticNote("Restaurant imported from OpenStreetMap at Sveavägen 10."), true);
  assert.equal(isInternalDiagnosticNote("Added through Google Places sync"), true);
  assert.equal(isInternalDiagnosticNote("Bakery from OpenStreetMap."), true);
  assert.equal(isInternalDiagnosticNote("Pending community submission · not independently verified"), true);

  assert.equal(isInternalDiagnosticNote("Hyllad och prisbelönt napolitansk pizzeria grundad av Jesper Blomqvist."), false);
  assert.equal(isInternalDiagnosticNote("Oberoende bageri med surdegsbröd och kardemummabullar."), false);
  assert.equal(isInternalDiagnosticNote(undefined), true);
  assert.equal(isInternalDiagnosticNote(""), true);
});

test("getPublicPlaceNote hides internal pipeline notes and provides clean user-facing copy", () => {
  const dogBakeryWithDiagnostic = {
    name: "Dog Bakery",
    kind: "Bakery",
    area: "Kungsholmen",
    note: "Bakery imported from OpenStreetMap. Needs source enrichment before quality scoring.",
  };
  assert.equal(getPublicPlaceNote(dogBakeryWithDiagnostic, "sv"), "Oberoende bageri i Kungsholmen.");
  assert.equal(getPublicPlaceNote(dogBakeryWithDiagnostic, "en"), "Independent bakery in Kungsholmen.");

  const genuinePlace = {
    name: "Lillebrors Bageri",
    kind: "Bakery",
    area: "Vasastan",
    note: "Känt för sina nygräddade kardemummabullar och surdegsbröd.",
  };
  assert.equal(getPublicPlaceNote(genuinePlace, "sv"), "Känt för sina nygräddade kardemummabullar och surdegsbröd.");
});
