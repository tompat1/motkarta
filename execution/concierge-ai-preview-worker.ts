import { onRequestGet, onRequestPost, type Env } from '../functions/api/concierge.ts';
import { evidenceQuery, placeQuery, tagQuery } from '../lib/place-records.ts';

type PreviewEnv = Env & { ASSETS: { fetch(request: Request): Promise<Response> } };
const catalogQueries = new Set([placeQuery, evidenceQuery, tagQuery]);

export function readOnlyAiCatalog(db: Env['DB']): Env['DB'] {
  if (!db) return undefined;
  return {
    prepare(query) {
      if (!catalogQueries.has(query)) throw new Error('preview_query_not_allowed');
      const statement = db.prepare(query);
      return { all: () => statement.all(), bind: (...values) => ({ all: () => statement.bind(...values).all() }) };
    },
  };
}

function parseSimilarityThreshold(value: string | undefined): number | null {
  if (!value?.trim()) return null;
  const threshold = Number(value);
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) return null;
  return threshold;
}

/** Sandbox concierge env: read-only D1, constrained synthesis, optional hybrid when fully configured. */
export function buildPreviewConciergeEnv(env: PreviewEnv): { env: Env; previewTag: string } {
  const threshold = parseSimilarityThreshold(env.CONCIERGE_MIN_SIMILARITY);
  const hybridReady = env.CONCIERGE_RETRIEVAL_MODE === 'hybrid'
    && Boolean(env.CONCIERGE_INDEX)
    && threshold !== null;
  const previewEnv: Env = {
    DB: readOnlyAiCatalog(env.DB),
    AI: env.AI,
    CONCIERGE_RATE_GATE: env.CONCIERGE_RATE_GATE,
    CONCIERGE_RETRIEVAL_MODE: hybridReady ? 'hybrid' : 'lexical',
    CONCIERGE_SYNTHESIS_MODE: 'constrained',
  };
  if (hybridReady) {
    previewEnv.CONCIERGE_INDEX = env.CONCIERGE_INDEX;
    previewEnv.CONCIERGE_MIN_SIMILARITY = String(threshold);
  }
  return {
    env: previewEnv,
    previewTag: hybridReady ? 'ai-hybrid-readonly-v1' : 'ai-synthesis-readonly-v1',
  };
}

export default {
  async fetch(request: Request, env: PreviewEnv): Promise<Response> {
    const { pathname, hostname } = new URL(request.url);
    if (!hostname.endsWith('.motkarta.pages.dev') && !['localhost', '127.0.0.1'].includes(hostname)) {
      return Response.json({ error: 'preview_host_required' }, { status: 503, headers: { 'cache-control': 'no-store', 'x-motkarta-preview': 'ai-synthesis-readonly-v1' } });
    }
    const { env: conciergeEnv, previewTag } = buildPreviewConciergeEnv(env);
    const previewHeaders = { 'cache-control': 'no-store', 'x-motkarta-preview': previewTag };
    let response: Response;
    if (pathname === '/api/concierge') {
      const handler = request.method === 'POST' ? onRequestPost : request.method === 'GET' ? onRequestGet : null;
      if (!handler) return Response.json({ error: 'method_not_allowed' }, { status: 405, headers: { ...previewHeaders, allow: 'GET, POST' } });
      response = await handler({ request, env: conciergeEnv });
    } else if (/^\/(api|admin)(\/|$|\.html$)/.test(pathname)) {
      response = Response.json({ error: 'not_available_in_concierge_preview' }, { status: 404 });
    } else if (!['GET', 'HEAD'].includes(request.method)) {
      response = Response.json({ error: 'method_not_allowed' }, { status: 405 });
    } else {
      response = await env.ASSETS.fetch(request);
    }
    const result = new Response(response.body, response);
    result.headers.set('x-motkarta-preview', previewTag);
    result.headers.set('x-robots-tag', 'noindex');
    return result;
  },
};
