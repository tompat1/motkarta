import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CUISINE_DISHES_VERSION,
  dishCuisineSearchTerms,
  dishExclusionTerms,
  dishHints,
  dishIntentMatchers,
  signatureDishesByCuisine,
} from '../lib/concierge/cuisine-dishes.ts';
import { extractStructuredFilters } from '../lib/concierge/filters.ts';
import { parseIntent } from '../lib/concierge/intent.ts';
import { retrieveAndSynthesize } from '../lib/concierge/response.ts';
import { readFile } from 'node:fs/promises';

const places = JSON.parse(await readFile(new URL('./fixtures/concierge/places.json', import.meta.url), 'utf8')).places;

test('registry version and scale', () => {
  assert.equal(CUISINE_DISHES_VERSION, 'concierge-cuisine-dishes-v2');
  assert.ok(Object.keys(signatureDishesByCuisine()).length >= 70);
  assert.ok(dishHints().length >= 60);
});

test('dish hints map pierogi to polish and moules-frites to belgian', () => {
  const pierogi = dishHints().find((hint) => hint.dish === 'pierogi');
  assert.equal(pierogi?.cuisine, 'polish');
  const moules = dishHints().find((hint) => hint.dish === 'moules-frites');
  assert.equal(moules?.cuisine, 'belgian');
  const salmon = dishHints().find((hint) => hint.dish === 'lohikeitto');
  assert.equal(salmon?.cuisine, 'finnish');
});

test('structured filters infer cuisine from signature dishes', () => {
  assert.deepEqual(extractStructuredFilters('where can I get pierogi').cuisines, ['polish']);
  assert.deepEqual(extractStructuredFilters('moules frites near Södermalm').cuisines, ['belgian']);
  assert.deepEqual(extractStructuredFilters('lohikeitto or salmon soup').cuisines, ['finnish']);
});

test('intent matchers prefer longest dish phrases', () => {
  const matchers = dishIntentMatchers();
  const moulesIdx = matchers.findIndex(([term]) => term === 'moules frites');
  const moulesShortIdx = matchers.findIndex(([term]) => term === 'moules');
  assert.ok(moulesIdx >= 0);
  assert.ok(moulesShortIdx < 0 || moulesIdx < moulesShortIdx);
});

test('dish exclusion stays narrow for ramen not sushi', () => {
  const excluded = dishExclusionTerms('sushi');
  assert.ok(excluded.includes('sushi'));
  assert.ok(!excluded.includes('ramen'));
  const intent = parseIntent('ramen not sushi');
  assert.deepEqual(intent.dishes, ['ramen']);
  assert.ok(intent.exclusions.includes('sushi'));
  assert.ok(!intent.exclusions.includes('ramen'));
  assert.deepEqual(retrieveAndSynthesize('ramen not sushi', places).cards.map((p) => p.id), [7]);
});

test('dishCuisineSearchTerms includes registry pairs', () => {
  const pairs = dishCuisineSearchTerms();
  assert.ok(pairs.some(([term, cuisine]) => term === 'cevapi' && cuisine === 'balkan'));
  assert.ok(pairs.some(([term, cuisine]) => term === 'khachapuri' && cuisine === 'georgian'));
});
