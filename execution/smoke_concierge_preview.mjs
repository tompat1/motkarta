import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

const origin = new URL(process.argv[2] ?? 'https://concierge-rag-preview.motkarta.pages.dev').origin;
assert.ok(new URL(origin).hostname.endsWith('.motkarta.pages.dev'), 'Use a Pages preview hostname');
const checks = [];
const queries = [
  { query: 'Drop Coffee Roasters', first: 1640 },
  { query: 'Spiga Madre', first: 2880 },
  { query: 'Arirang', empty: true },
  { query: 'Starbucks', empty: true },
  { query: 'polska pierogi nära mig', empty: true },
  { query: 'Sapori Italiani nära mig', first: 677, location: { latitude: 59.2800606, longitude: 18.1081759 } },
];
for (const { first, empty, ...body } of queries) {
  const started = Date.now();
  const response = await fetch(origin + '/api/concierge', { method: 'POST', headers: { 'content-type': 'application/json', origin }, body: JSON.stringify({ ...body, language: 'sv' }), signal: AbortSignal.timeout(10000) });
  if (response.status !== 200) {
    throw new Error(`${body.query}: HTTP ${response.status}; preview=${response.headers.get('x-motkarta-preview')}; ${(await response.text()).slice(0,1000)}`);
  }
  assert.equal(response.headers.get('x-motkarta-preview'), 'lexical-readonly-v1');
  const result = await response.json();
  assert.equal(result.source, 'd1');
  assert.equal(result.modelVersion, 'concierge-lexical-v2');
  assert.equal(result.retrievalMode, 'lexical');
  assert.equal(result.synthesisMode, 'template');
  if (first) assert.equal(result.cards[0]?.id, first, body.query);
  if (empty) assert.equal(result.cards.length, 0, body.query);
  checks.push({ query: body.query, elapsedMs: Date.now() - started, status: result.status, ids: result.cards.map((card) => card.id), timingsMs: result.diagnostics.timingsMs });
}
for (const route of ['/api/recommendation-events', '/api/reviews', '/api/sources', '/api/admin/session', '/admin']) {
  const response = await fetch(origin + route, { method: 'POST', signal: AbortSignal.timeout(10000) });
  assert.equal(response.status, 404, route);
  assert.equal((await response.json()).error, 'not_available_in_concierge_preview');
}
const denied = await fetch(origin + '/api/concierge', { method: 'POST', headers: { origin: 'https://example.org' }, body: JSON.stringify({ query: 'coffee' }), signal: AbortSignal.timeout(10000) });
assert.equal(denied.status, 403);
await mkdir('.tmp/concierge-preview', { recursive: true });
await writeFile('.tmp/concierge-preview/http-checks.json', JSON.stringify({ origin, checkedAt: new Date().toISOString(), checks, isolationPassed: true }, null, 2) + '\n');
console.log(`Passed ${checks.length} live catalog queries and API isolation checks at ${origin}`);
