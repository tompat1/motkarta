import { onRequestGet, onRequestPost, type Env } from '../functions/api/concierge.ts';
import { evidenceQuery, placeQuery, tagQuery } from '../lib/place-records.ts';

type PreviewEnv = Env & { ASSETS: { fetch(request: Request): Promise<Response> } };
const catalogQueries = new Set([placeQuery, evidenceQuery, tagQuery]);
const previewHeaders = { 'cache-control': 'no-store', 'x-motkarta-preview': 'lexical-readonly-v1' };

export function readOnlyCatalog(db: Env['DB']): Env['DB'] {
  if (!db) return undefined;
  return {
    prepare(query) {
      if (!catalogQueries.has(query)) throw new Error('preview_query_not_allowed');
      const statement = db.prepare(query);
      // Only expose reads, even if the real binding has run/exec/batch methods.
      return { all: () => statement.all(), bind: (...values) => ({ all: () => statement.bind(...values).all() }) };
    },
  };
}

export default {
  async fetch(request: Request, env: PreviewEnv): Promise<Response> {
    const { pathname, hostname } = new URL(request.url);
    if (!hostname.endsWith('.motkarta.pages.dev') && !['localhost', '127.0.0.1'].includes(hostname)) {
      return Response.json({ error: 'preview_host_required' }, { status: 503, headers: previewHeaders });
    }
    let response: Response;
    if (pathname === '/api/concierge') {
      const handler = request.method === 'POST' ? onRequestPost : request.method === 'GET' ? onRequestGet : null;
      if (!handler) return Response.json({ error: 'method_not_allowed' }, { status: 405, headers: { ...previewHeaders, allow: 'GET, POST' } });
      // Hard-coded modes and a fresh env prevent dashboard flags enabling paid AI.
      response = await handler({ request, env: { DB: readOnlyCatalog(env.DB), CONCIERGE_RETRIEVAL_MODE: 'lexical', CONCIERGE_SYNTHESIS_MODE: 'template' } });
    } else if (/^\/(api|admin)(\/|$|\.html$)/.test(pathname)) {
      response = Response.json({ error: 'not_available_in_concierge_preview' }, { status: 404 });
    } else if (!['GET', 'HEAD'].includes(request.method)) {
      response = Response.json({ error: 'method_not_allowed' }, { status: 405 });
    } else {
      response = await env.ASSETS.fetch(request);
    }
    const result = new Response(response.body, response);
    result.headers.set('x-motkarta-preview', 'lexical-readonly-v1');
    result.headers.set('x-robots-tag', 'noindex');
    return result;
  },
};
