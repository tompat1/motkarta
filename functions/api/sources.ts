import { DEFAULT_CURATED_SOURCES, loadSourcesFromD1, saveSourceToD1 } from "../../lib/db-sources-prompts.ts";
import type { CuratedSource } from "../../src/app/shared";

type EventContext<Env> = {
  request: Request;
  env: Env;
};

type Env = {
  DB?: unknown;
};

const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-cache",
};

export async function onRequestGet(context: EventContext<Env>) {
  const db = context.env.DB as Parameters<typeof loadSourcesFromD1>[0] | undefined;
  const sources = await loadSourcesFromD1(db);
  return new Response(JSON.stringify({ sources }), { headers: jsonHeaders });
}

export async function onRequestPost(context: EventContext<Env>) {
  try {
    const source = (await context.request.json()) as CuratedSource;
    if (!source || !source.name || !source.url) {
      return new Response(JSON.stringify({ error: "Invalid source data" }), { status: 400, headers: jsonHeaders });
    }

    const db = context.env.DB as Parameters<typeof saveSourceToD1>[0] | undefined;
    await saveSourceToD1(db, source);

    const updated = await loadSourcesFromD1(db);
    return new Response(JSON.stringify({ success: true, sources: updated }), { headers: jsonHeaders });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: jsonHeaders });
  }
}
