import assert from 'node:assert/strict';
import test from 'node:test';
import { priceDisplay } from '../lib/price-display.ts';
test('price symbols use explicit tiers or average SEK amounts; unknown remains unknown', () => {
  for (const symbol of ['$', '$$', '$$$', '$$$$']) assert.deepEqual(priceDisplay(symbol), { symbol });
  assert.equal(priceDisplay('145 SEK').symbol, '$');
  assert.equal(priceDisplay('100–700').symbol, '$$$');
  assert.equal(priceDisplay('950').symbol, '$$$$');
  for (const value of [undefined, '', 'unknown', '4', '400–100', '$$$$$']) assert.equal(priceDisplay(value), null);
});
