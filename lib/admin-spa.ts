type PagesAssetFetcher = {
  fetch(input: Request | string, init?: RequestInit): Promise<Response>;
};

export type AdminSpaEnv = {
  ASSETS?: PagesAssetFetcher;
};

export type AdminSpaEventContext<Env extends AdminSpaEnv = AdminSpaEnv> = {
  request: Request;
  env: Env;
};

export async function serveAdminSpa(context: AdminSpaEventContext) {
  if (context.request.method !== "GET" && context.request.method !== "HEAD") {
    return new Response("Method not allowed", { status: 405 });
  }

  if (!context.env.ASSETS) {
    return new Response("Admin app assets are unavailable.", { status: 503 });
  }

  const url = new URL(context.request.url);
  url.pathname = "/";
  return context.env.ASSETS.fetch(new Request(url.toString(), context.request));
}
