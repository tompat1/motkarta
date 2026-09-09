import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { nextDailyBudget, parseAiGateRequest } from '../lib/concierge/rate-gate.ts';
import { onRequestPost, requestAiPermit } from '../functions/api/concierge.ts';

test('AI gate request accepts only bounded client keys and one or two units', () => {
  assert.deepEqual(parseAiGateRequest({ key: '203.0.113.1', units: 2 }), { key: '203.0.113.1', units: 2 });
  for (const input of [{ key: '', units: 1 }, { key: 'x', units: 0 }, { key: 'x', units: 3 }, { key: 'x', units: 1.5 }]) {
    assert.throws(() => parseAiGateRequest(input), /invalid_gate_request/);
  }
});

test('daily AI budget resets by UTC day and never overspends', () => {
  assert.deepEqual(nextDailyBudget('2026-09-09', 198, '2026-09-09', 2, 200), { allowed: true, day: '2026-09-09', used: 200, remaining: 0 });
  assert.deepEqual(nextDailyBudget('2026-09-09', 200, '2026-09-09', 1, 200), { allowed: false, day: '2026-09-09', used: 200, remaining: 0 });
  assert.deepEqual(nextDailyBudget('2026-09-08', 200, '2026-09-09', 1, 200), { allowed: true, day: '2026-09-09', used: 1, remaining: 199 });
});

test('Pages service-binding gate fails closed and reports requested units', async () => {
  let body;
  const allowed = await requestAiPermit({ CONCIERGE_RATE_GATE: { fetch: async (request) => {
    body = await request.json();
    return Response.json({ success: true });
  } } }, 'test-client', 2);
  assert.equal(allowed, true);
  assert.deepEqual(body, { key: 'test-client', units: 2 });
  assert.equal(await requestAiPermit({ CONCIERGE_RATE_GATE: { fetch: async () => new Response(null, { status: 429 }) } }, 'x', 1), false);
  assert.equal(await requestAiPermit({ CONCIERGE_RATE_GATE: { fetch: async () => { throw new Error('down'); } } }, 'x', 1), false);
});

test('endpoint requests two units for hybrid plus synthesis and falls back when denied', async () => {
  let requestedUnits;
  const env = {
    DB: { prepare: (sql) => ({ bind() { return this; }, all: async () => ({ results: sql.includes('FROM establishments') ? [{ id: 1, name: 'Magari', type: 'Restaurant', district: 'Södermalm', description: '', chain_status: 'independent' }] : sql.includes('FROM establishment_tags') ? [{ establishment_id: 1, tag: 'pizza' }] : [] }) }) },
    CONCIERGE_RETRIEVAL_MODE: 'hybrid',
    CONCIERGE_SYNTHESIS_MODE: 'constrained',
    CONCIERGE_RATE_GATE: { fetch: async (request) => { requestedUnits = (await request.json()).units; return new Response(null, { status: 429 }); } },
  };
  const request = new Request('https://example.test/api/concierge', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query: 'pizza' }) });
  const response = await onRequestPost({ request, env });
  const result = await response.json();
  assert.equal(requestedUnits, 2);
  assert.equal(result.retrievalMode, 'lexical');
  assert.equal(result.synthesisMode, 'template');
  assert.ok(result.diagnostics.fallbackReasons.includes('ai_rate_gate_closed'));
});

test('rate-gate worker cannot receive public workers.dev traffic', async () => {
  const config = await readFile(new URL('../wrangler.concierge-rate-gate.toml', import.meta.url), 'utf8');
  assert.match(config, /workers_dev = false/);
  assert.match(config, /new_sqlite_classes = \["ConciergeDailyBudget"\]/);
  assert.match(config, /limit = 5, period = 60/);
});
