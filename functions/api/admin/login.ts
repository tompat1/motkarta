import { getAdminSession, type AdminAuthEnv } from "../../../lib/admin-auth.ts";

// Cloudflare Access protects this path and supplies its signed session after login.
// Keep the destination fixed: never accept a redirect URL from user input.
export async function onRequestGet({ request, env }: { request: Request; env: AdminAuthEnv }) {
  const session = await getAdminSession(request, env);
  const destination = new URL("/", request.url);
  destination.searchParams.set("cms_login", session.admin ? "success" : "failed");
  return new Response(null, { status: 302, headers: { location: destination.href, "cache-control": "no-store" } });
}
