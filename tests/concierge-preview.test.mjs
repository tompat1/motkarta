import test from 'node:test';
import assert from 'node:assert/strict';
import preview, { readOnlyCatalog } from '../execution/concierge-preview-worker.ts';
import { placeQuery, evidenceQuery, tagQuery } from '../lib/place-records.ts';
import { lexicalCandidates } from '../lib/concierge/retrieval.ts';

const origin = 'https://concierge-rag-preview.motkarta.pages.dev';
const unavailableAssets = { fetch: () => { throw new Error('unexpected_asset_access'); } };

test('unsupported intents short-circuit ranking without reading venue records', () => {
  const places = [{ get id() { assert.fail('unnecessary_catalog_scan'); } }];
  for (const query of ['Starbucks', 'open now', 'pierogi nära mig', 'restaurants in Göteborg']) {
    assert.deepEqual(lexicalCandidates(query, places), []);
  }
  assert.deepEqual(lexicalCandidates('coffee', places, { radiusKm: 2 }), []);
});

test('preview exposes only catalog SELECTs and strips database mutation methods', async () => {
  let reads = 0;
  const db = readOnlyCatalog({ prepare: () => ({ all: async () => { reads++; return { results: [] }; }, run: () => assert.fail('write'), bind() { return this; } }), exec: () => assert.fail('exec') });
  for (const query of [placeQuery, evidenceQuery, tagQuery]) await db.prepare(query).all();
  assert.equal(reads, 3);
  assert.equal(db.exec, undefined);
  assert.equal(db.prepare(placeQuery).run, undefined);
  assert.equal(db.prepare(placeQuery).bind().run, undefined);
  for (const query of ['DELETE FROM establishments', 'SELECT * FROM recommendation_events', placeQuery + '; DELETE FROM establishments']) {
    assert.throws(() => db.prepare(query), /preview_query_not_allowed/);
  }
});

test('preview rejects unrelated APIs and write methods without touching D1 or assets', async () => {
  const env = { ASSETS: unavailableAssets, DB: { prepare: () => assert.fail('unexpected_db_access') } };
  for (const route of ['/api/reviews', '/api/recommendation-events', '/api/admin/session', '/admin', '/admin.html', '/api/concierge/extra']) {
    for (const method of ['GET', 'POST']) assert.equal((await preview.fetch(new Request(origin + route, { method }), env)).status, 404);
  }
  for (const method of ['DELETE', 'PATCH', 'PUT']) assert.equal((await preview.fetch(new Request(origin + '/api/concierge', { method }), env)).status, 405);
  assert.equal((await preview.fetch(new Request(origin + '/', { method: 'POST' }), env)).status, 405);
});

test('preview remains lexical even when incoming bindings request AI', async () => {
  const request = new Request(origin + '/api/concierge', { method: 'POST', body: JSON.stringify({ query: 'Drop Coffee', language: 'en' }) });
  const response = await preview.fetch(request, {
    ASSETS: unavailableAssets,
    DB: { prepare: (sql) => ({ all: async () => ({ results: sql === placeQuery ? [{ id: 1, name: 'Drop Coffee', type: 'Specialty coffee', district: 'Södermalm', chain_status: 'independent', lifecycle_state: 'baseline' }] : [] }) }) },
    CONCIERGE_RETRIEVAL_MODE: 'hybrid', CONCIERGE_SYNTHESIS_MODE: 'constrained',
    AI: { run: () => assert.fail('paid_inference') }, CONCIERGE_INDEX: { query: () => assert.fail('vector_query') },
    CONCIERGE_RATE_LIMITER: { limit: () => assert.fail('rate_gate') },
  });
  const result = await response.json();
  assert.equal(response.status, 200);
  assert.equal(result.source, 'd1');
  assert.equal(result.retrievalMode, 'lexical');
  assert.equal(result.synthesisMode, 'template');
  assert.equal(result.cards[0].name, 'Drop Coffee');
  assert.equal(response.headers.get('x-motkarta-preview'), 'lexical-readonly-v1');
});

test('preview refuses production hosts and keeps normal static responses intact', async () => {
  for (const hostname of ['motkarta.pages.dev', 'motkarta.rynell.org', 'evil-motkarta.pages.dev']) {
    const response = await preview.fetch(new Request(`https://${hostname}/`), { ASSETS: unavailableAssets });
    assert.equal(response.status, 503);
  }
  const response = await preview.fetch(new Request(origin + '/assets/app.js'), { ASSETS: { fetch: async () => new Response('asset', { headers: { 'content-type': 'text/javascript', 'cache-control': 'max-age=3600' } }) } });
  assert.equal(await response.text(), 'asset');
  assert.equal(response.headers.get('cache-control'), 'max-age=3600');
  assert.equal(response.headers.get('x-robots-tag'), 'noindex');
});
