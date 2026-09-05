import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { eligiblePlace } from '../lib/concierge/gates.ts';
import { placeFacts, documentHash, normalize } from '../lib/concierge/facts.ts';
import { VERSIONS, EMBEDDING_MODEL, EMBEDDING_DIMENSIONS } from '../lib/concierge/contracts.ts';

export async function exportCorpus(input) {
  const raw = await readFile(input, 'utf8');
  const parsed = JSON.parse(raw), places = parsed.places ?? parsed;
  if (!Array.isArray(places)) throw new Error('Expected a canonical places array');
  const documents = [], seen = new Set();
  for (const place of places) {
    if (seen.has(place.id)) throw new Error(`Duplicate canonical ID: ${place.id}`);
    seen.add(place.id);
    if (!eligiblePlace(place)) continue;
    const facts = placeFacts(place);
    documents.push({ id: String(place.id), document: facts.document,
      metadata: { documentHash: await documentHash(facts.document), corpusVersion: VERSIONS.corpus, eligible: true, area: normalize(place.area), kind: place.kind } });
  }
  documents.sort((a, b) => Number(a.id) - Number(b.id));
  return { corpusVersion: VERSIONS.corpus, model: EMBEDDING_MODEL, dimensions: EMBEDDING_DIMENSIONS, metric: 'cosine', inputHash: createHash('sha256').update(raw).digest('hex'), inputCount: places.length, admittedCount: documents.length, rejectedCount: places.length - documents.length, documents };
}
if (process.argv[1]?.endsWith('export_concierge.mjs')) {
  const [input, output] = process.argv.slice(2);
  if (!input || !output) throw new Error('Usage: node execution/export_concierge.mjs canonical-places.json output.json');
  const corpus = await exportCorpus(input);
  await writeFile(output, `${JSON.stringify(corpus, null, 2)}\n`);
  console.log(JSON.stringify({ admitted: corpus.admittedCount, rejected: corpus.rejectedCount, corpusVersion: corpus.corpusVersion }));
}
