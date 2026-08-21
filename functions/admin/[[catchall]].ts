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

export async function onRequest(context: EventContext<Env>) {
  if (context.request.method !== "GET" && context.request.method !== "HEAD") {
    return new Response("Method not allowed", { status: 405 });
  }

  if (!context.env.ASSETS) {
    return new Response("Admin app assets are unavailable.", { status: 503 });
  }

  const url = new URL(context.request.url);
  url.pathname = "/index.html";
  return context.env.ASSETS.fetch(new Request(url.toString(), context.request));
}
