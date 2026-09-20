import { loadPlacesFromD1 } from '../../lib/place-records.ts';
import { filterPublishedPlaces, isClosedPlace, type PlaceIdentity } from '../../lib/place-visibility.ts';
import { VERSIONS, type AiBinding, type ConciergePlace, type QueryContext, type VectorBinding } from '../../lib/concierge/contracts.ts';
import { coordinates } from '../../lib/concierge/gates.ts';
import { plainText, safeUrl, normalize } from '../../lib/concierge/facts.ts';
import { lexicalCandidates, fuseCandidates } from '../../lib/concierge/retrieval.ts';
import { buildResponse } from '../../lib/concierge/response.ts';
import { semanticCandidates, withinDeadline } from '../../lib/concierge/providers.ts';
import { synthesize } from '../../lib/concierge/synthesis.ts';
import { parseAction, parseIntent } from '../../lib/concierge/intent.ts';
import { isProhibitedDomain, filterExternalWebResults, parseDuckDuckGoHtml, PROHIBITED_DOMAINS } from '../../lib/concierge/web-search.ts';

export { extractStructuredFilters } from '../../lib/concierge/filters.ts';
export { retrieveAndSynthesize } from '../../lib/concierge/response.ts';
export { isProhibitedDomain };
export type Env = {
  DB?: Parameters<typeof loadPlacesFromD1>[0]; AI?: AiBinding; CONCIERGE_INDEX?: VectorBinding;
  CONCIERGE_RETRIEVAL_MODE?: string; CONCIERGE_SYNTHESIS_MODE?: string;
  CONCIERGE_MIN_SIMILARITY?: string;
  CONCIERGE_DEADLINE_MS?: string;
  CONCIERGE_RATE_LIMITER?: { limit(input: { key: string }): Promise<{ success: boolean }> };
  CONCIERGE_RATE_GATE?: { fetch(request: Request): Promise<Response> };
  ASSETS?: { fetch(input: Request | string, init?: RequestInit): Promise<Response> };
  BRAVE_SEARCH_API_KEY?: string;
  TAVILY_API_KEY?: string;
};

export const DEFAULT_CONCIERGE_DEADLINE_MS = 4500;
export const MAX_CONCIERGE_DEADLINE_MS = 12000;

/** Production stays at 4.5s unless a preview/explicit env raises the wall budget. */
export function processingDeadlineMs(env: Env = {}): number {
  const raw = Number(env.CONCIERGE_DEADLINE_MS);
  if (!Number.isInteger(raw) || raw < DEFAULT_CONCIERGE_DEADLINE_MS || raw > MAX_CONCIERGE_DEADLINE_MS) {
    return DEFAULT_CONCIERGE_DEADLINE_MS;
  }
  return raw;
}

export async function fetchExternalWebResults(query: string, env: Env, deadline: number): Promise<import('../../lib/concierge/contracts.ts').ExternalWebResult[]> {
  const timeoutMs = Math.max(100, Math.min(1800, deadline - Date.now()));
  if (timeoutMs <= 100) return [];

  // 1. Brave Search API (if configured)
  if (env.BRAVE_SEARCH_API_KEY?.trim()) {
    try {
      const searchUrl = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query + ' Stockholm café restaurang mat')}&count=8`;
      const res = await withinDeadline(
        fetch(searchUrl, {
          headers: {
            'Accept': 'application/json',
            'X-Subscription-Token': env.BRAVE_SEARCH_API_KEY.trim(),
          },
        }),
        timeoutMs,
      );
      if (res.ok) {
        const data = await res.json() as { web?: { results?: Array<{ title?: string; url?: string; description?: string }> } };
        const raw = (data.web?.results ?? []).map((r) => ({
          title: r.title || '',
          url: r.url || '',
          snippet: r.description || '',
          domain: '',
        }));
        const cleaned = filterExternalWebResults(raw);
        if (cleaned.length) return cleaned;
      }
    } catch {
      // fallback
    }
  }

  // 2. Tavily Search API (if configured)
  if (env.TAVILY_API_KEY?.trim()) {
    try {
      const res = await withinDeadline(
        fetch('https://api.tavily.com/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            api_key: env.TAVILY_API_KEY.trim(),
            query: `${query} Stockholm café restaurang`,
            max_results: 8,
          }),
        }),
        timeoutMs,
      );
      if (res.ok) {
        const data = await res.json() as { results?: Array<{ title?: string; url?: string; content?: string }> };
        const raw = (data.results ?? []).map((r) => ({
          title: r.title || '',
          url: r.url || '',
          snippet: r.content || '',
          domain: '',
        }));
        const cleaned = filterExternalWebResults(raw);
        if (cleaned.length) return cleaned;
      }
    } catch {
      // fallback
    }
  }

  // 3. Open Web / DuckDuckGo HTML Fallback (always accessible, zero commercial trackers or API keys required)
  try {
    const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query + ' Stockholm café restaurang mat')}`;
    const res = await withinDeadline(
      fetch(searchUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'sv-SE,sv;q=0.9,en-US;q=0.8,en;q=0.7',
        },
      }),
      timeoutMs,
    );
    if (res.ok) {
      const html = await res.text();
      const cleaned = parseDuckDuckGoHtml(html);
      if (cleaned.length) return cleaned;
    }
  } catch {
    // ignore
  }

  return [];
}
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
  if (Object.keys(body).some((key) => !['query', 'language', 'location', 'radiusKm', 'messages'].includes(key))) throw new Error('unsupported_field');
  if (typeof body.query !== 'string' || !body.query.trim() || body.query.length > 1000) throw new Error('invalid_query');
  if (body.language !== undefined && !['sv', 'en'].includes(String(body.language))) throw new Error('invalid_language');
  if (body.location !== undefined && !coordinates(body.location)) throw new Error('invalid_location');
  if (body.radiusKm !== undefined && (typeof body.radiusKm !== 'number' || !Number.isFinite(body.radiusKm) || body.radiusKm <= 0 || body.radiusKm > 25)) throw new Error('invalid_radius');
  let validMessages: import('../../lib/concierge/contracts.ts').ChatMessage[] | undefined = undefined;
  if (body.messages !== undefined) {
    if (!Array.isArray(body.messages) || body.messages.length > 10) throw new Error('invalid_messages');
    for (const msg of body.messages) {
      if (!msg || typeof msg !== 'object' || Array.isArray(msg)) throw new Error('invalid_messages');
      const m = msg as Record<string, unknown>;
      if (!['user', 'assistant'].includes(String(m.role)) || typeof m.content !== 'string' || !m.content.trim() || m.content.length > 1000) {
        throw new Error('invalid_messages');
      }
      if (m.timestamp !== undefined && typeof m.timestamp !== 'string' && typeof m.timestamp !== 'number') {
        throw new Error('invalid_messages');
      }
    }
    validMessages = body.messages.map((msg) => {
      const m = msg as { role: 'user' | 'assistant'; content: string; timestamp?: string | number };
      return {
        role: m.role,
        content: m.content.trim(),
        ...(m.timestamp !== undefined ? { timestamp: m.timestamp } : {}),
      };
    });
  }
  return {
    query: body.query.trim(),
    context: {
      language: body.language as QueryContext['language'],
      location: body.location as QueryContext['location'],
      radiusKm: body.radiusKm as number | undefined,
      messages: validMessages,
    },
  };
}
export async function requestAiPermit(env: Env, key: string, units: number) {
  if (env.CONCIERGE_RATE_LIMITER) {
    try { return (await withinDeadline(env.CONCIERGE_RATE_LIMITER.limit({ key }), 150)).success; }
    catch { return false; }
  }
  if (!env.CONCIERGE_RATE_GATE) return false;
  try {
    const response = await withinDeadline(env.CONCIERGE_RATE_GATE.fetch(new Request('https://concierge-rate-gate.internal/limit', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ key, units }),
    })), 500);
    if (!response.ok) return false;
    const body = await response.json() as { success?: unknown };
    return body.success === true;
  } catch { return false; }
}
export async function processConciergeQuery(query: string, env: Env = {}, context: QueryContext = {}, allowAI = false, requestUrl?: string) {
  const started = Date.now(), deadline = started + processingDeadlineMs(env);
  let places: ConciergePlace[] = [];
  let blocked: PlaceIdentity[] = [];
  let publicationAvailable = true;
  let sourceNamespace = 'd1';
  if (parseAction(query)) return Response.json(buildResponse(query, [], 0, context, 'action'), { headers });
  try {
    if (env.DB) places = await withinDeadline(loadPlacesFromD1(env.DB), 1200);
    blocked = places.filter(isClosedPlace);
  } catch { publicationAvailable = false; }
  if (env.ASSETS && requestUrl) {
    try {
      const assetRes = await env.ASSETS.fetch(new URL('/data/places.json', requestUrl).toString());
      if (assetRes.ok) {
        const json = await assetRes.json() as ConciergePlace[] | { places?: ConciergePlace[] };
        const assetPlaces = Array.isArray(json) ? json : json.places;
        if (Array.isArray(assetPlaces) && assetPlaces.length > 0) {
          blocked.push(...assetPlaces.filter(isClosedPlace));
          if (!places.length) {
            places = assetPlaces;
            sourceNamespace = 'published_dataset';
          } else {
            const existingIds = new Set(places.map((p) => p.id));
            const existingOsm = new Set(places.map((p) => p.osmIdentity).filter(Boolean) as string[]);
            const existingNameArea = new Set(places.map((p) => `${normalize(p.name)}::${normalize(p.area || '')}`));
            for (const ap of assetPlaces) {
              if (existingIds.has(ap.id)) continue;
              if (ap.osmIdentity && existingOsm.has(ap.osmIdentity)) continue;
              const nameArea = `${normalize(ap.name)}::${normalize(ap.area || '')}`;
              if (nameArea && existingNameArea.has(nameArea)) continue;

              places.push(ap);
              existingIds.add(ap.id);
              if (ap.osmIdentity) existingOsm.add(ap.osmIdentity);
              existingNameArea.add(nameArea);
            }
          }
        }
      }
    } catch {
      // bounded unavailable response below
    }
  }
  places = publicationAvailable ? filterPublishedPlaces(places, blocked) : [];
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
        if (semantic.length) { candidates = fuseCandidates(candidates, semantic, Boolean(intent.area)); hybrid = true; }
        else fallbacks.push('no_current_semantic_matches');
      } catch { fallbacks.push('semantic_unavailable'); }
    } else fallbacks.push('semantic_not_configured');
  }
  let result = buildResponse(query, candidates, places.length, context, sourceNamespace);
  if (!result.cards.length && result.webSearch && deadline - Date.now() > 150) {
    try {
      const externalResults = await fetchExternalWebResults(query, env, deadline);
      if (externalResults.length) {
        result.webSearch.externalResults = externalResults;
      }
    } catch {
      fallbacks.push('external_search_failed');
    }
  }
  if (hybrid) { result.modelVersion = VERSIONS.hybrid; result.retrievalMode = 'hybrid'; }
  if (allowAI && env.CONCIERGE_SYNTHESIS_MODE === 'constrained' && result.cards.length > 0 && result.cards.length <= 5) {
    if (env.AI && deadline - Date.now() > 100) {
      try { result = await synthesize(result, env.AI, intent.language, deadline, context); }
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
  const aiUnits = (env.CONCIERGE_RETRIEVAL_MODE === 'hybrid' ? 1 : 0) + (env.CONCIERGE_SYNTHESIS_MODE === 'constrained' ? 1 : 0);
  if (aiRequested) allowAI = await requestAiPermit(env, request.headers.get('cf-connecting-ip') ?? 'unknown', aiUnits);
  const response = await processConciergeQuery(input.query, env, input.context, allowAI, request.url);
  if (!allowAI && aiRequested && response.ok) {
    const body = await response.json() as { diagnostics: { fallbackReasons: string[] } };
    body.diagnostics.fallbackReasons.push('ai_rate_gate_closed');
    return Response.json(body, { headers });
  }
  return response;
}
export async function onRequestGet({ request, env }: EventContext) {
  const url = new URL(request.url);
  try { const input = validateRequest({ query: url.searchParams.get('q') ?? url.searchParams.get('query') ?? '' }); return processConciergeQuery(input.query, env, input.context, false, request.url); }
  catch { return Response.json({ error: 'invalid_query' }, { headers, status: 400 }); }
}
