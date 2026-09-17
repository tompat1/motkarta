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

function hasAccessAuthorizationCookie(request: Request) {
  return /(?:^|;\s*)CF_Authorization=/.test(request.headers.get("cookie") ?? "");
}

export async function onRequestGet(context: EventContext<Env>) {
  const url = new URL(context.request.url);
  if (url.searchParams.has("cms_login")) {
    if (!context.env.ASSETS) {
      return new Response("Site assets are unavailable.", { status: 503 });
    }
    return context.env.ASSETS.fetch(context.request);
  }

  if (hasAccessAuthorizationCookie(context.request)) {
    url.pathname = "/admin";
    url.search = "";
    url.hash = "";
    return Response.redirect(url.toString(), 302);
  }

  if (!context.env.ASSETS) {
    return new Response("Site assets are unavailable.", { status: 503 });
  }

  return context.env.ASSETS.fetch(context.request);
}

export async function onRequestHead(context: EventContext<Env>) {
  return onRequestGet(context);
}
