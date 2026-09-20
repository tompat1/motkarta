import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import preview, { buildPreviewConciergeEnv, readOnlyAiCatalog } from '../execution/concierge-ai-preview-worker.ts';
import { evidenceQuery, placeQuery, tagQuery } from '../lib/place-records.ts';
import { processingDeadlineMs } from '../functions/api/concierge.ts';

const origin = 'https://concierge-ai-preview.motkarta.pages.dev';
const hybridOrigin = 'https://concierge-ai-hybrid-preview.motkarta.pages.dev';
const db = { prepare: (sql) => ({ all: async () => ({ results: sql === placeQuery ? [{ id: 1, name: 'Magari', type: 'Restaurant', district: 'Södermalm', chain_status: 'independent', lifecycle_state: 'baseline' }] : sql === tagQuery ? [{ establishment_id: 1, tag: 'pizza' }] : [] }), bind() { return this; } }) };

test('AI preview exposes only the three catalog reads', async () => {
  const safe = readOnlyAiCatalog(db);
  for (const query of [placeQuery, evidenceQuery, tagQuery]) await safe.prepare(query).all();
  assert.throws(() => safe.prepare('SELECT * FROM recommendation_events'), /preview_query_not_allowed/);
});

test('buildPreviewConciergeEnv keeps lexical when hybrid is requested without vector index', () => {
  const built = buildPreviewConciergeEnv({
    DB: db,
    CONCIERGE_RETRIEVAL_MODE: 'hybrid',
    CONCIERGE_MIN_SIMILARITY: '0.5',
  });
  assert.equal(built.previewTag, 'ai-synthesis-readonly-v1');
  assert.equal(built.env.CONCIERGE_RETRIEVAL_MODE, 'lexical');
  assert.equal(built.env.CONCIERGE_SYNTHESIS_MODE, 'constrained');
  assert.equal(built.env.CONCIERGE_INDEX, undefined);
});

test('processingDeadlineMs keeps production at 4.5s and allows a bounded preview raise', () => {
  assert.equal(processingDeadlineMs(), 4500);
  assert.equal(processingDeadlineMs({}), 4500);
  assert.equal(processingDeadlineMs({ CONCIERGE_DEADLINE_MS: '8000' }), 8000);
  assert.equal(processingDeadlineMs({ CONCIERGE_DEADLINE_MS: '12000' }), 12000);
  assert.equal(processingDeadlineMs({ CONCIERGE_DEADLINE_MS: '4499' }), 4500);
  assert.equal(processingDeadlineMs({ CONCIERGE_DEADLINE_MS: '12001' }), 4500);
  assert.equal(processingDeadlineMs({ CONCIERGE_DEADLINE_MS: '8000.5' }), 4500);
});

test('buildPreviewConciergeEnv forwards preview-only synthesis capture', () => {
  const built = buildPreviewConciergeEnv({
    DB: db,
    CONCIERGE_SYNTHESIS_CAPTURE: '1',
  });
  assert.equal(built.env.CONCIERGE_SYNTHESIS_CAPTURE, '1');
  assert.equal(buildPreviewConciergeEnv({ DB: db }).env.CONCIERGE_SYNTHESIS_CAPTURE, undefined);
});

test('AI preview prepare script enables bounded synthesis capture without changing production wrangler', async () => {
  const source = await readFile(new URL('../execution/prepare_concierge_ai_preview.mjs', import.meta.url), 'utf8');
  const production = await readFile(new URL('../wrangler.toml', import.meta.url), 'utf8');
  assert.match(source, /CONCIERGE_SYNTHESIS_CAPTURE = "1"/);
  assert.doesNotMatch(production, /CONCIERGE_SYNTHESIS_CAPTURE/);
  assert.match(production, /CONCIERGE_SYNTHESIS_MODE = "template"/);
});

test('buildPreviewConciergeEnv passes a raised hybrid deadline through to the concierge env', () => {
  const built = buildPreviewConciergeEnv({
    DB: db,
    CONCIERGE_RETRIEVAL_MODE: 'hybrid',
    CONCIERGE_MIN_SIMILARITY: '0.5',
    CONCIERGE_DEADLINE_MS: '8000',
    CONCIERGE_INDEX: { query: async () => ({ matches: [] }) },
  });
  assert.equal(built.env.CONCIERGE_DEADLINE_MS, '8000');
  assert.equal(processingDeadlineMs(built.env), 8000);
});

test('buildPreviewConciergeEnv enables hybrid when index and threshold are configured', () => {
  const index = { query: async () => ({ matches: [] }) };
  const built = buildPreviewConciergeEnv({
    DB: db,
    AI: { run: async () => ({ data: [Array(1024).fill(0.01)] }) },
    CONCIERGE_RETRIEVAL_MODE: 'hybrid',
    CONCIERGE_MIN_SIMILARITY: '0.5',
    CONCIERGE_INDEX: index,
  });
  assert.equal(built.previewTag, 'ai-hybrid-readonly-v1');
  assert.equal(built.env.CONCIERGE_RETRIEVAL_MODE, 'hybrid');
  assert.equal(built.env.CONCIERGE_MIN_SIMILARITY, '0.5');
  assert.equal(built.env.CONCIERGE_INDEX, index);
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

test('AI hybrid preview passes vector bindings through to concierge handler', async () => {
  const calls = [];
  const request = new Request(hybridOrigin + '/api/concierge', { method: 'POST', body: JSON.stringify({ query: 'pizza', language: 'sv' }) });
  const response = await preview.fetch(request, {
    DB: db, ASSETS: { fetch: async () => new Response('asset') },
    CONCIERGE_RETRIEVAL_MODE: 'hybrid',
    CONCIERGE_MIN_SIMILARITY: '0.5',
    CONCIERGE_INDEX: { query: async () => ({ matches: [] }) },
    CONCIERGE_RATE_GATE: { fetch: async () => Response.json({ success: true }) },
    AI: { run: async (model, input) => {
      calls.push({ model, input });
      if (String(model).includes('bge-m3')) return { data: [Array(1024).fill(0.01)] };
      return { response: JSON.stringify({ places: [{ placeId: 1, factIds: ['1:cuisine'] }] }) };
    } },
  });
  const result = await response.json();
  assert.equal(response.headers.get('x-motkarta-preview'), 'ai-hybrid-readonly-v1');
  assert.equal(result.retrievalMode, 'lexical');
  assert.equal(result.synthesisMode, 'constrained');
  assert.ok(calls.some((call) => String(call.model).includes('bge-m3')));
});

test('AI preview rejects unrelated APIs and mutation methods', async () => {
  const env = { DB: db, ASSETS: { fetch: async () => new Response('asset') } };
  for (const route of ['/api/recommendation-events', '/api/reviews', '/api/admin/session', '/admin']) {
    assert.equal((await preview.fetch(new Request(origin + route, { method: 'POST' }), env)).status, 404);
  }
  assert.equal((await preview.fetch(new Request(origin + '/api/concierge', { method: 'PUT' }), env)).status, 405);
});
