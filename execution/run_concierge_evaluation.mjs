import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { lexicalCandidates, fuseCandidates } from '../lib/concierge/retrieval.ts';
import { semanticCandidates } from '../lib/concierge/providers.ts';
import { EMBEDDING_MODEL, EMBEDDING_DIMENSIONS } from '../lib/concierge/contracts.ts';

const [catalogPath, queryPath, outputPath, legacyPath, semanticPath] = process.argv.slice(2);
const raw = await readFile(catalogPath, 'utf8');
const catalog = JSON.parse(raw).places;
const queries = JSON.parse(await readFile(queryPath, 'utf8')).queries;
const historical = legacyPath !== '-' ? await import(pathToFileURL(legacyPath).href) : undefined;
const semantic = semanticPath !== '-' ? JSON.parse(await readFile(semanticPath, 'utf8')) : undefined;
if (semantic && (semantic.corpusHash !== createHash('sha256').update(raw).digest('hex') || semantic.model !== EMBEDDING_MODEL || typeof semantic.threshold !== 'number' || semantic.threshold < 0 || semantic.threshold > 1 || !Number.isFinite(semantic.threshold))) throw new Error('Invalid captured semantic manifest');
const results = [];
for (const item of queries) {
  const context = item.context ?? {};
  const start = performance.now();
  const lexical = lexicalCandidates(item.query, catalog, context);
  const row = { id: item.id, corrected: lexical.slice(0, 50).map((c) => c.place.id), latencyMs: performance.now() - start };
  if (historical) row.legacy = historical.retrieveAndSynthesize(item.query, catalog).recommendedPlaces.map((p) => p.id);
  if (semantic) {
    if (!Array.isArray(semantic.results[item.id])) throw new Error(`Missing captured query ${item.id}`);
    const vectors = await semanticCandidates(item.query, catalog, context,
      { run: async () => ({ data: [Array(EMBEDDING_DIMENSIONS).fill(0.1)] }) },
      { query: async () => ({ matches: semantic.results[item.id] }) }, semantic.threshold, Date.now() + 5000);
    row.hybrid = fuseCandidates(lexical, vectors).slice(0, 50).map((c) => c.place.id);
  }
  results.push(row);
}
await writeFile(outputPath, JSON.stringify({ results, semanticMeasured: Boolean(semantic), corpusHash: createHash('sha256').update(raw).digest('hex') }));
