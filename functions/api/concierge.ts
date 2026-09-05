import { loadPlacesFromD1 } from '../../lib/place-records.ts';
import { VERSIONS, type AiBinding, type ConciergePlace, type QueryContext, type VectorBinding } from '../../lib/concierge/contracts.ts';
import { coordinates } from '../../lib/concierge/gates.ts';
import { lexicalCandidates, fuseCandidates } from '../../lib/concierge/retrieval.ts';
import { buildResponse } from '../../lib/concierge/response.ts';
import { semanticCandidates, withinDeadline } from '../../lib/concierge/providers.ts';
import { synthesize } from '../../lib/concierge/synthesis.ts';
import { parseAction, parseIntent } from '../../lib/concierge/intent.ts';

export { extractStructuredFilters } from '../../lib/concierge/filters.ts';
export { retrieveAndSynthesize } from '../../lib/concierge/response.ts';
export type Env = {
  DB?: Parameters<typeof loadPlacesFromD1>[0]; AI?: AiBinding; CONCIERGE_INDEX?: VectorBinding;
  CONCIERGE_RETRIEVAL_MODE?: string; CONCIERGE_SYNTHESIS_MODE?: string;
  CONCIERGE_MIN_SIMILARITY?: string;
  CONCIERGE_RATE_LIMITER?: { limit(input: { key: string }): Promise<{ success: boolean }> };
};
type EventContext = { request: Request; env: Env };
const headers = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
const MAX_BODY = 8192;

async function readBody(request: Request): Promise<unknown> {
  if (Number(request.headers.get('content-length')) > MAX_BODY) throw new Error('body_too_large');
  const reader = request.body?.getReader();
  if (!reader) throw new Error('invalid_body');
  const chunks: Uint8Array[] = []; let size = 0;
  const timer = setTimeout(() => { void reader.cancel().catch(() => {}); }, 1000);
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY) { await reader.cancel(); throw new Error('body_too_large'); }
      chunks.push(value);
    }
  } finally { clearTimeout(timer); reader.releaseLock(); }
  const joined = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.length; }
  return JSON.parse(new TextDecoder().decode(joined));
}
export function validateRequest(value: unknown): { query: string; context: QueryContext } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid_body');
  const body = value as Record<string, unknown>;
  if (Object.keys(body).some((key) => !['query', 'language', 'location', 'radiusKm'].includes(key))) throw new Error('unsupported_field');
  if (typeof body.query !== 'string' || !body.query.trim() || body.query.length > 1000) throw new Error('invalid_query');
  if (body.language !== undefined && !['sv', 'en'].includes(String(body.language))) throw new Error('invalid_language');
  if (body.location !== undefined && !coordinates(body.location)) throw new Error('invalid_location');
  if (body.radiusKm !== undefined && (typeof body.radiusKm !== 'number' || !Number.isFinite(body.radiusKm) || body.radiusKm <= 0 || body.radiusKm > 25)) throw new Error('invalid_radius');
  return { query: body.query.trim(), context: { language: body.language as QueryContext['language'], location: body.location as QueryContext['location'], radiusKm: body.radiusKm as number | undefined } };
}
export async function processConciergeQuery(query: string, env: Env = {}, context: QueryContext = {}, allowAI = false) {
  const started = Date.now(), deadline = started + 4500;
  let places: ConciergePlace[] = [];
  if (parseAction(query)) return Response.json(buildResponse(query, [], 0, context, 'action'), { headers });
  try { if (env.DB) places = await withinDeadline(loadPlacesFromD1(env.DB), 1200); } catch { /* bounded unavailable response below */ }
  if (!places.length) {
    const result = buildResponse(query, [], 0, context, 'unavailable');
    result.status = 'unavailable';
    result.intro = context.language === 'sv' ? 'Motkartas katalog är inte tillgänglig just nu. Försök igen senare.' : 'The live Motkarta dataset is unavailable. Please try again later.';
    result.answer = result.intro;
    return Response.json(result, { headers, status: 503 });
  }
  const lexicalStarted = Date.now();
  let candidates = lexicalCandidates(query, places, context);
  const lexicalMs = Date.now() - lexicalStarted;
  let hybrid = false;
  const fallbacks: string[] = [];
  const threshold = Number(env.CONCIERGE_MIN_SIMILARITY);
  const intent = parseIntent(query, context);
  const canRetrieve = !intent.outsideStockholm && !intent.excludedBrandRequested && !intent.openNow && !(intent.near && !context.location);
  if (allowAI && canRetrieve && env.CONCIERGE_RETRIEVAL_MODE === 'hybrid') {
    if (env.AI && env.CONCIERGE_INDEX && env.CONCIERGE_MIN_SIMILARITY?.trim() && Number.isFinite(threshold) && threshold >= 0 && threshold <= 1) {
      try {
        const semantic = await semanticCandidates(query, places, context, env.AI, env.CONCIERGE_INDEX, threshold, deadline);
        if (semantic.length) { candidates = fuseCandidates(candidates, semantic); hybrid = true; }
        else fallbacks.push('no_current_semantic_matches');
      } catch { fallbacks.push('semantic_unavailable'); }
    } else fallbacks.push('semantic_not_configured');
  }
  let result = buildResponse(query, candidates, places.length, context, 'd1');
  if (hybrid) { result.modelVersion = VERSIONS.hybrid; result.retrievalMode = 'hybrid'; }
  if (allowAI && env.CONCIERGE_SYNTHESIS_MODE === 'constrained' && result.cards.length) {
    if (env.AI && deadline - Date.now() > 100) {
      try { result = await synthesize(result, env.AI, intent.language, deadline); }
      catch { fallbacks.push('synthesis_rejected_or_unavailable'); }
    } else fallbacks.push('synthesis_not_available');
  }
  result.diagnostics.fallbackReasons = fallbacks;
  result.diagnostics.timingsMs = { lexical: lexicalMs, total: Date.now() - started };
  return Response.json(result, { headers });
}
export async function onRequestPost({ request, env }: EventContext) {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) return Response.json({ error: 'origin_not_allowed' }, { headers, status: 403 });
  let input;
  try { input = validateRequest(await withinDeadline(readBody(request), 1000)); }
  catch { return Response.json({ error: 'invalid_request', answer: 'Send a query (1–1000 characters) and optional language/location. Venue data is not accepted.' }, { headers, status: 400 }); }
  const aiRequested = env.CONCIERGE_RETRIEVAL_MODE === 'hybrid' || env.CONCIERGE_SYNTHESIS_MODE === 'constrained';
  let allowAI = false;
  if (aiRequested && env.CONCIERGE_RATE_LIMITER) {
    try { allowAI = (await withinDeadline(env.CONCIERGE_RATE_LIMITER.limit({ key: request.headers.get('cf-connecting-ip') ?? 'unknown' }), 100)).success; } catch { /* fail to lexical */ }
  }
  const response = await processConciergeQuery(input.query, env, input.context, allowAI);
  if (!allowAI && aiRequested && response.ok) {
    const body = await response.json() as { diagnostics: { fallbackReasons: string[] } };
    body.diagnostics.fallbackReasons.push('ai_rate_gate_closed');
    return Response.json(body, { headers });
  }
  return response;
}
export async function onRequestGet({ request, env }: EventContext) {
  const url = new URL(request.url);
  try { const input = validateRequest({ query: url.searchParams.get('q') ?? url.searchParams.get('query') ?? '' }); return processConciergeQuery(input.query, env, input.context, false); }
  catch { return Response.json({ error: 'invalid_query' }, { headers, status: 400 }); }
}
