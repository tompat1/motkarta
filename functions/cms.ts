type PagesAssetFetcher = {
  fetch(input: Request | string, init?: RequestInit): Promise<Response>;
};

type EventContext<Env> = {
  request: Request;
  env: Env;
};

type Env = {
  ASSETS?: PagesAssetFetcher;
};

export async function onRequestGet(context: EventContext<Env>) {
  if (!context.env.ASSETS) {
    return new Response("Site assets are unavailable.", { status: 503 });
  }

  const url = new URL(context.request.url);
  const rootRequest = new Request(new URL("/", url.origin), context.request);
  return context.env.ASSETS.fetch(rootRequest);
}

export async function onRequestHead(context: EventContext<Env>) {
  return onRequestGet(context);
}
