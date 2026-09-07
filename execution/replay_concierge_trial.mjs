// Offline diagnostics only: no provider calls, credentials, deployment or promotion.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { parseIntent } from '../lib/concierge/intent.ts';
import { VERSIONS, EMBEDDING_MODEL, SYNTHESIS_MODEL } from '../lib/concierge/contracts.ts';
import { lexicalCandidates, fuseCandidates } from '../lib/concierge/retrieval.ts';
import { hydrateSemanticMatches } from '../lib/concierge/providers.ts';
import { buildResponse } from '../lib/concierge/response.ts';
import { buildSynthesisInput, applySynthesisOutput } from '../lib/concierge/synthesis.ts';

const [phase, directory = '.tmp/concierge-trial'] = process.argv.slice(2);
const root = resolve(directory);
const read = async (name) => JSON.parse(await readFile(resolve(root, name), 'utf8'));
const write = async (name, value) => writeFile(resolve(root, name), JSON.stringify(value, null, 2) + '\n');
const rawCatalog = await readFile(resolve(root, 'audit/canonical-d1.json'), 'utf8');
const catalog = JSON.parse(rawCatalog).places;
const corpusHash = createHash('sha256').update(rawCatalog).digest('hex');
const source = JSON.parse(await readFile('tests/fixtures/concierge/queries.json', 'utf8')).queries;
// Fixture relevance IDs refer to synthetic venues and MUST NOT be reused with D1.
const cases = source.map(({ id, query, family, language, context = {} }) => {
  context = { language, ...context };
  const intent = parseIntent(query, context);
  return { id, query, family, context, filter: { corpusVersion: VERSIONS.corpus, eligible: true, ...(intent.area ? { area: intent.area } : {}) } };
});
const casesHash = createHash('sha256').update(JSON.stringify(cases)).digest('hex');
await mkdir(root, { recursive: true });
if (phase === 'prepare') {
  await write('query-cases.json', cases);
  await write('capture-manifest.json', { corpusHash, casesHash, model: EMBEDDING_MODEL, synthesisModel: SYNTHESIS_MODEL, versions: VERSIONS, caseIds: cases.map(c => c.id), purpose: 'Real D1 diagnostic prompts; no relevance labels or holdout claims.' });
  console.log(`Prepared ${cases.length} diagnostic queries`);
} else if (phase === 'report') {
  const manifest = await read('capture-manifest.json');
  if (manifest.corpusHash !== corpusHash || manifest.casesHash !== casesHash || manifest.model !== EMBEDDING_MODEL || JSON.stringify(manifest.versions) !== JSON.stringify(VERSIONS)) throw new Error('Catalog, queries or versions changed since capture preparation');
  const thresholds = [0, 0.4, 0.5, 0.6, 0.7]; // Sensitivity analysis, not calibrated serving thresholds.
  const results = [], packets = [], responses = {};
  for (const row of cases) {
    let capture;
    try { capture = await read(`queries/${row.id}.json`); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (!capture || capture.error) { results.push({ id: row.id, error: capture?.error ?? 'not_captured' }); continue; }
    if (capture.embeddingValidated !== true) throw new Error('Capture lacks a validated real query embedding');
    const intent = parseIntent(row.query, row.context);
    const canRetrieve = !intent.outsideStockholm && !intent.excludedBrandRequested && !intent.openNow && !(intent.near && !row.context.location);
    const lexical = lexicalCandidates(row.query, catalog, row.context);
    const slices = [];
    let response;
    for (const threshold of thresholds) {
      const semantic = canRetrieve ? await hydrateSemanticMatches(row.query, catalog, row.context, capture.matches, threshold) : [];
      const candidates = semantic.length ? fuseCandidates(lexical, semantic) : lexical;
      slices.push({ threshold, semanticCount: semantic.length, top: candidates.slice(0, 3).map(c => ({ id: c.place.id, name: c.place.name })) });
      if (threshold === 0.5) {
        response = buildResponse(row.query, candidates, catalog.length, row.context, 'd1-offline-trial');
        if (semantic.length) { response.retrievalMode = 'hybrid'; response.modelVersion = VERSIONS.hybrid; }
      }
    }
    responses[row.id] = response;
    results.push({ id: row.id, family: row.family, query: row.query, canRetrieve, embeddingMs: capture.embeddingMs, vectorMs: capture.totalMs - capture.embeddingMs, totalMs: capture.totalMs, lexical: lexical.slice(0, 3).map(c => ({ id: c.place.id, name: c.place.name })), rawTop: capture.matches.matches.slice(0, 3).map(m => ({ id: m.id, score: m.score, name: catalog.find(p => String(p.id) === m.id)?.name })), slices });
  }
  // Select varied, answerable families first, then fill remaining slots deterministically.
  const answerable = cases.filter(row => responses[row.id]?.cards.length);
  const families = new Set();
  const diverse = answerable.filter(row => { if (families.has(row.family)) return false; families.add(row.family); return true; });
  for (const row of [...diverse, ...answerable.filter(row => !diverse.includes(row))].slice(0, 32)) packets.push({ id: row.id, input: buildSynthesisInput(responses[row.id], parseIntent(row.query, row.context).language) });
  await write('synthesis-cases.json', packets);
  await write('responses.json', responses);
  const synthesis = [];
  for (const packet of packets) {
    let capture;
    try { capture = await read(`synthesis/${packet.id}.json`); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (!capture) continue;
    try {
      if (capture.error) throw Error(capture.error);
      const row = cases.find(c => c.id === packet.id);
      const rendered = applySynthesisOutput(capture.output, responses[packet.id], parseIntent(row.query, row.context).language);
      synthesis.push({ id: packet.id, valid: true, totalMs: capture.totalMs, withinRuntimeDeadline: capture.totalMs <= 2000, explanations: rendered.cards.map(c => ({ id: c.id, whyItMatches: c.whyItMatches })) });
    } catch (error) { synthesis.push({ id: packet.id, valid: false, totalMs: capture.totalMs, error: error.message }); }
  }
  const completed = results.filter(r => !r.error);
  const usage = await read('usage.json');
  const ids = rows => rows.map(r => r.id).join(',');
  const percentiles = values => { const sorted = [...values].sort((a, b) => a - b); return { p50: sorted[Math.max(0, Math.ceil(sorted.length * 0.5) - 1)] ?? null, p95: sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)] ?? null }; };
  const summary = { modelCostReserveUsd: usage.reservedModelUsd, calls: { index: usage.indexCalls, queries: usage.queryCalls, synthesis: usage.synthesisCalls, vectorQueries: usage.vectorQueries }, latencyMs: { embedding: percentiles(completed.map(r => r.embeddingMs)), vector: percentiles(completed.map(r => r.vectorMs)), retrieval: percentiles(completed.map(r => r.totalMs)), synthesis: percentiles(synthesis.map(r => r.totalMs)) }, captured: completed.length, errorsOrMissing: results.length - completed.length, retrievalAllowed: completed.filter(r => r.canRetrieve).length, embeddingWithin1200ms: completed.filter(r => r.embeddingMs <= 1200).length, vectorWithin800ms: completed.filter(r => r.vectorMs <= 800).length, thresholdSensitivity: thresholds.map(threshold => ({ threshold, newlyAnswered: completed.filter(r => !r.lexical.length && r.slices.find(s => s.threshold === threshold).top.length).length, withSemanticCandidates: completed.filter(r => r.slices.find(s => s.threshold === threshold).semanticCount).length, changedTopThree: completed.filter(r => ids(r.lexical) !== ids(r.slices.find(s => s.threshold === threshold).top)).length })), synthesisCaptured: synthesis.length, synthesisValid: synthesis.filter(r => r.valid).length, synthesisWithin2000ms: synthesis.filter(r => r.totalMs <= 2000).length, synthesisValidWithin2000ms: synthesis.filter(r => r.withinRuntimeDeadline).length };
  await write('report.json', { corpusHash, model: EMBEDDING_MODEL, synthesisModel: SYNTHESIS_MODEL, versions: VERSIONS, caveats: ['Diagnostic prompts have no independently reviewed D1 relevance labels; no NDCG/recall/satisfaction claim.', 'REST timings include client/network overhead; not Workers binding latency.', '0.5 is an exploratory packet-selection threshold, not an approved production setting.'], summary, results, synthesis });
  console.log(JSON.stringify(summary, null, 2));
} else throw Error('Usage: node execution/replay_concierge_trial.mjs prepare|report [trial-directory]');
