import { DEFAULT_CONCIERGE_PROMPTS, loadPromptsFromD1, savePromptToD1 } from "../../lib/db-sources-prompts.ts";

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
  const db = context.env.DB as Parameters<typeof loadPromptsFromD1>[0] | undefined;
  const prompts = await loadPromptsFromD1(db);
  return new Response(JSON.stringify({ prompts }), { headers: jsonHeaders });
}

export async function onRequestPost(context: EventContext<Env>) {
  try {
    const payload = (await context.request.json()) as { prompt?: string };
    const prompt = payload.prompt?.trim();
    if (!prompt) {
      return new Response(JSON.stringify({ error: "Missing prompt parameter" }), { status: 400, headers: jsonHeaders });
    }

    const db = context.env.DB as Parameters<typeof savePromptToD1>[0] | undefined;
    await savePromptToD1(db, prompt);

    const updated = await loadPromptsFromD1(db);
    return new Response(JSON.stringify({ success: true, prompts: updated }), { headers: jsonHeaders });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: jsonHeaders });
  }
}
