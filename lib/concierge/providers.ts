import { scorePlace } from '../scoring.ts';
import { EMBEDDING_MODEL, EMBEDDING_DIMENSIONS, VERSIONS, type AiBinding, type VectorBinding, type ConciergePlace, type QueryContext, type RankedCandidate } from './contracts.ts';
import { documentHash, placeFacts } from './facts.ts';
import { eligiblePlace } from './gates.ts';
import { parseIntent } from './intent.ts';
import { exactNameIds, satisfiesConstraints } from './retrieval.ts';

export async function withinDeadline<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
  if (timeoutMs <= 0) throw new Error('deadline');
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([operation, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('deadline')), timeoutMs); })]); }
  finally { clearTimeout(timer); }
}
export function validateEmbedding(output: unknown): number[] {
  const data = (output as { data?: unknown })?.data;
  const vector = Array.isArray(data) ? data[0] : undefined;
  if (!Array.isArray(vector) || vector.length !== EMBEDDING_DIMENSIONS || !vector.every((n) => typeof n === 'number' && Number.isFinite(n)) || !vector.some((n) => n !== 0)) throw new Error('invalid_embedding');
  return vector;
}
export async function semanticCandidates(query: string, places: ConciergePlace[], context: QueryContext, ai: AiBinding, index: VectorBinding, threshold: number, deadline: number): Promise<RankedCandidate[]> {
  const intent = parseIntent(query, context);
  const embedding = validateEmbedding(await withinDeadline(ai.run(EMBEDDING_MODEL, { text: [query] }), Math.min(1200, deadline - Date.now())));
  const filter: Record<string, unknown> = { corpusVersion: VERSIONS.corpus, eligible: true };
  if (intent.area) filter.area = intent.area;
  // Full current constraints are always checked below, independently of indexed metadata.
  const result = await withinDeadline(index.query(embedding, { topK: 50, returnMetadata: 'all', returnValues: false, filter }), Math.min(800, deadline - Date.now()));
  if (!Array.isArray(result.matches)) throw new Error('invalid_vector_result');
  const catalog = new Map(places.map((place) => [String(place.id), place]));
  const candidates: RankedCandidate[] = [];
  const namedIds = exactNameIds(query, places);
  const seen = new Set<number>();
  const matches = result.matches.slice(0, 50).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  for (const [rank, match] of matches.entries()) {
    const place = catalog.get(match.id);
    if (!place || (namedIds.size && !namedIds.has(place.id)) || seen.has(place.id) || !eligiblePlace(place) || typeof match.score !== 'number' || !Number.isFinite(match.score) || match.score < threshold || match.score > 1) continue;
    if (match.metadata?.corpusVersion !== VERSIONS.corpus) continue;
    const facts = placeFacts(place);
    if (match.metadata.documentHash !== await documentHash(facts.document)) continue;
    seen.add(place.id);
    const candidate: RankedCandidate = { place: scorePlace(place), facts, exact: false, lexicalScore: 0, vectorRank: rank + 1, fusionScore: 0 };
    if (satisfiesConstraints(candidate, intent, context)) candidates.push(candidate);
  }
  return candidates;
}
