import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const hybrid = process.argv.includes('--hybrid');
const apply = process.argv.includes('--apply');
const urlArgument = process.argv.find((value) => /^https:\/\//.test(value));
const defaultOrigin = hybrid
  ? 'https://concierge-ai-hybrid-preview.motkarta.pages.dev'
  : 'https://concierge-ai-preview.motkarta.pages.dev';
const origin = new URL(urlArgument ?? defaultOrigin).origin;
assert.ok(new URL(origin).hostname.endsWith('.motkarta.pages.dev'), 'Use a Pages preview hostname');
const previewTag = hybrid ? 'ai-hybrid-readonly-v1' : 'ai-synthesis-readonly-v1';
const modelVersionForRetrieval = (retrievalMode) =>
  retrievalMode === 'hybrid' ? 'concierge-hybrid-v3' : 'concierge-lexical-v3';

const queries = hybrid
  ? [
      { query: 'bästa pizzeriorna i stan', kind: 'pizza' },
      { query: 'god pasta nära Södermalm', kind: 'pasta' },
      { query: 'Drop Coffee Roasters', name: 'Drop Coffee' },
      { query: 'cozy place to unwind' },
      { query: 'Spiga Madre', name: 'Spiga Madre' },
    ]
  : [
      { query: 'bästa pizzeriorna i stan', kind: 'pizza' },
      { query: 'bästa pizza i Stockholm', kind: 'pizza' },
      { query: 'Drop Coffee Roasters', name: 'Drop Coffee' },
      { query: 'Spiga Madre', name: 'Spiga Madre' },
      { query: 'Sapori Italiani', name: 'Sapori Italiani' },
];
if (!apply) {
  console.log(JSON.stringify({
    apply: false,
    hybrid,
    origin,
    previewTag,
    plannedPaidRequests: queries.length,
    conservativeReservedUsd: queries.length * (hybrid ? 0.015 : 0.01),
  }, null, 2));
  process.exit(0);
}

const root = fileURLToPath(new URL('../', import.meta.url));
const resultsDir = path.join(root, '.tmp/concierge-production-v1');
const ledgerPath = path.join(resultsDir, 'usage-ledger.json');
const reportPath = path.join(resultsDir, hybrid ? 'ai-hybrid-preview-smoke.json' : 'ai-preview-smoke.json');
await mkdir(resultsDir, { recursive: true });
let ledger = { version: 1, limitUsd: 1, reservedUsd: 0, attempts: [] };
try { ledger = JSON.parse(await readFile(ledgerPath, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }

const checks = [];
for (const expected of queries) {
  const reservation = hybrid ? 0.015 : 0.01;
  if (ledger.reservedUsd + reservation > ledger.limitUsd) throw new Error('Local paid-inference ledger exhausted');
  ledger.reservedUsd = Number((ledger.reservedUsd + reservation).toFixed(3));
  ledger.attempts.push({ at: new Date().toISOString(), origin, query: expected.query, reservedUsd: reservation, hybrid });
  await writeFile(ledgerPath, JSON.stringify(ledger, null, 2) + '\n');

  const started = Date.now();
  const response = await fetch(origin + '/api/concierge', {
    method: 'POST', headers: { 'content-type': 'application/json', origin },
    body: JSON.stringify({ query: expected.query, language: expected.query.match(/[åäöÅÄÖ]/) ? 'sv' : 'en' }),
    signal: AbortSignal.timeout(20000),
  });
  if (response.status !== 200) throw new Error(`${expected.query}: HTTP ${response.status}; ${(await response.text()).slice(0, 1000)}`);
  assert.equal(response.headers.get('x-motkarta-preview'), previewTag);
  const result = await response.json();
  assert.equal(result.source, 'd1');
  if (hybrid) {
    // Hybrid preview always runs semantic search, but per-query retrievalMode
    // stays lexical when no current semantic matches survive hydration/gates.
    assert.ok(['hybrid', 'lexical'].includes(result.retrievalMode), expected.query);
    assert.equal(result.modelVersion, modelVersionForRetrieval(result.retrievalMode), expected.query);
  } else {
    assert.equal(result.retrievalMode, 'lexical', expected.query);
    assert.equal(result.modelVersion, modelVersionForRetrieval('lexical'), expected.query);
  }
  assert.equal(result.promptVersion, 'concierge-synthesis-v3');
  assert.ok(result.cards.length > 0, expected.query);
  assert.ok(!result.diagnostics.fallbackReasons.includes('ai_rate_gate_closed'), expected.query);
  if (hybrid) {
    assert.ok(!result.diagnostics.fallbackReasons.includes('semantic_not_configured'), expected.query);
  }
  const check = {
    query: expected.query,
    elapsedMs: Date.now() - started,
    status: result.status,
    retrievalMode: result.retrievalMode,
    synthesisMode: result.synthesisMode,
    ids: result.cards.map((card) => card.id),
    names: result.cards.map((card) => card.name),
    fallbacks: result.diagnostics.fallbackReasons,
    timingsMs: result.diagnostics.timingsMs,
  };
  checks.push(check);
  await writeFile(reportPath, JSON.stringify({ version: 1, capturedAt: new Date().toISOString(), origin, hybrid, conservativeReservedUsd: ledger.reservedUsd, checks }, null, 2) + '\n');
  if (expected.name) assert.match(result.cards[0].name, new RegExp(expected.name, 'i'));
  if (expected.kind === 'pizza') assert.ok(result.cards.some((card) => card.citations.some((fact) => fact.field === 'cuisine' && /pizza/i.test(fact.value))), expected.query);
  if (expected.kind === 'pasta') assert.ok(result.cards.some((card) => /pasta|italian/i.test(card.name + card.citations.map((fact) => fact.value).join(' '))), expected.query);
}
const constrainedCount = checks.filter((check) => check.synthesisMode === 'constrained').length;
const minimumConstrained = hybrid ? 3 : 4;
assert.ok(constrainedCount >= minimumConstrained, `Gemma synthesis must validate for at least ${minimumConstrained} smoke queries`);
if (hybrid) {
  assert.ok(checks.filter((check) => check.retrievalMode === 'hybrid').length >= 3, 'Hybrid retrieval must activate for most smoke queries');
}
const report = { version: 1, capturedAt: new Date().toISOString(), origin, hybrid, conservativeReservedUsd: ledger.reservedUsd, checks };
await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
