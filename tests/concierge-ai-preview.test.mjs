import test from 'node:test';
import assert from 'node:assert/strict';
import preview, { readOnlyAiCatalog } from '../execution/concierge-ai-preview-worker.ts';
import { evidenceQuery, placeQuery, tagQuery } from '../lib/place-records.ts';

const origin = 'https://concierge-ai-preview.motkarta.pages.dev';
const db = { prepare: (sql) => ({ all: async () => ({ results: sql === placeQuery ? [{ id: 1, name: 'Magari', type: 'Restaurant', district: 'Södermalm', chain_status: 'independent', lifecycle_state: 'baseline' }] : sql === tagQuery ? [{ establishment_id: 1, tag: 'pizza' }] : [] }), bind() { return this; } }) };

test('AI preview exposes only the three catalog reads', async () => {
  const safe = readOnlyAiCatalog(db);
  for (const query of [placeQuery, evidenceQuery, tagQuery]) await safe.prepare(query).all();
  assert.throws(() => safe.prepare('SELECT * FROM recommendation_events'), /preview_query_not_allowed/);
});

test('AI preview hard-codes lexical retrieval and constrained synthesis behind service gate', async () => {
  const calls = [];
  const request = new Request(origin + '/api/concierge', { method: 'POST', body: JSON.stringify({ query: 'pizza', language: 'sv' }) });
  const response = await preview.fetch(request, {
    DB: db, ASSETS: { fetch: async () => new Response('asset') },
    CONCIERGE_RETRIEVAL_MODE: 'hybrid', CONCIERGE_SYNTHESIS_MODE: 'template',
    CONCIERGE_INDEX: { query: () => assert.fail('vector_query') },
    CONCIERGE_RATE_GATE: { fetch: async () => Response.json({ success: true }) },
    AI: { run: async (model, input) => { calls.push({ model, input }); return { response: JSON.stringify({ places: [{ placeId: 1, factIds: ['1:cuisine'] }] }) }; } },
  });
  const result = await response.json();
  assert.equal(response.headers.get('x-motkarta-preview'), 'ai-synthesis-readonly-v1');
  assert.equal(result.retrievalMode, 'lexical');
  assert.equal(result.synthesisMode, 'constrained');
  assert.equal(calls.length, 1);
  assert.match(calls[0].model, /gemma-4/);
});

test('AI preview rejects unrelated APIs and mutation methods', async () => {
  const env = { DB: db, ASSETS: { fetch: async () => new Response('asset') } };
  for (const route of ['/api/recommendation-events', '/api/reviews', '/api/admin/session', '/admin']) {
    assert.equal((await preview.fetch(new Request(origin + route, { method: 'POST' }), env)).status, 404);
  }
  assert.equal((await preview.fetch(new Request(origin + '/api/concierge', { method: 'PUT' }), env)).status, 405);
});
