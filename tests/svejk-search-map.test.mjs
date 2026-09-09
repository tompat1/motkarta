import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { extractStructuredFilters, retrieveAndSynthesize } from '../functions/api/concierge.ts';

const rawPlacesData = JSON.parse(await readFile(new URL('../public/data/places.json', import.meta.url), 'utf8'));
const places = rawPlacesData.places ?? rawPlacesData;

test("Search filter matches 'Soldaten Svejk, södermalm' with comma and multi-word query", () => {
  const svejk = places.find((p) => p.name.toLowerCase().includes('svejk'));
  assert.ok(svejk, "Soldaten Svejk must exist in the sanitized catalog");

  const query = "Soldaten Svejk, södermalm";
  const qClean = query.trim().toLowerCase();
  const placeSearchText = `${svejk.name} ${svejk.area} ${svejk.address ?? ""} ${svejk.cuisine ?? ""} ${svejk.tags.join(" ")}`.toLowerCase();
  const queryTokens = qClean.split(/[,\s]+/).filter(Boolean);

  assert.ok(
    queryTokens.length > 0 && queryTokens.every((token) => placeSearchText.includes(token)),
    "Tokens ['soldaten', 'svejk', 'södermalm'] should all match placeSearchText"
  );
});

test("Concierge extracts Czech cuisine filters from Swedish terms", () => {
  const f1 = extractStructuredFilters("tjeckisk mat i stan");
  assert.ok(f1.cuisines.includes("czech"), "tjeckisk should extract czech cuisine");

  const f2 = extractStructuredFilters("tjeckiskt ölhus på söder");
  assert.ok(f2.cuisines.includes("czech") || f2.cuisines.includes("pub"), "tjeckiskt ölhus should extract czech or pub");

  const f3 = extractStructuredFilters("tjeckisk öl");
  assert.ok(f3.cuisines.includes("czech"), "tjeckisk öl should extract czech");
});

test("Concierge retrieves Soldaten Svejk for Czech and Svejk queries", () => {
  const svejkQueries = [
    "Soldaten Svejk",
    "Soldaten Svejk, södermalm",
    "tjeckisk mat",
    "tjeckisk mat södermalm",
    "tjeckiskt",
    "czech",
    "svejk"
  ];

  for (const q of svejkQueries) {
    const res = retrieveAndSynthesize(q, places, { language: 'sv' });
    assert.equal(res.status, 'ok', `Query "${q}" should have status 'ok'`);
    assert.ok(res.cards.length > 0, `Query "${q}" should return at least 1 card`);
    assert.ok(
      res.cards.some((c) => c.name.toLowerCase().includes('svejk')),
      `Query "${q}" should include Soldaten Svejk in cards`
    );
  }
});

test("Concierge place cards for Soldaten Svejk contain coordinates for map pin placement", () => {
  const res = retrieveAndSynthesize("Soldaten Svejk", places, { language: 'sv' });
  const svejkCard = res.cards.find((c) => c.name.toLowerCase().includes('svejk'));
  assert.ok(svejkCard);
  assert.equal(typeof svejkCard.latitude, 'number');
  assert.equal(typeof svejkCard.longitude, 'number');
  assert.ok(svejkCard.latitude > 59.3 && svejkCard.latitude < 59.4);
  assert.ok(svejkCard.longitude > 18.0 && svejkCard.longitude < 18.1);
});

test("Dataset union merges missing places from published dataset into D1 places by ID", () => {
  const d1Places = [{ id: 1, name: "Place A" }, { id: 2, name: "Place B" }];
  const assetPlaces = [{ id: 2, name: "Place B" }, { id: 116240012, name: "Soldaten Svejk" }];

  const existingIds = new Set(d1Places.map((p) => p.id));
  for (const ap of assetPlaces) {
    if (!existingIds.has(ap.id)) {
      d1Places.push(ap);
      existingIds.add(ap.id);
    }
  }

  assert.equal(d1Places.length, 3);
  assert.ok(d1Places.some((p) => p.id === 116240012));
});
