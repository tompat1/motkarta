import type { AdminSession } from "./admin-auth.ts";

/** Browser storage may supply a token, but only the server can grant Admin access. */
export async function fetchAdminSession(token = ""): Promise<AdminSession> {
  const tryEndpoint = async (endpoint: string): Promise<{ session: AdminSession | null; wasRedirected: boolean }> => {
    try {
      const response = await fetch(endpoint, {
        credentials: "same-origin",
        cache: "no-store",
        redirect: "manual",
        signal: AbortSignal.timeout(10000),
        headers: { Accept: "application/json", ...(token ? { "x-motkarta-admin-token": token } : {}) },
      });
      if (response.type === "opaqueredirect" || (response.status >= 300 && response.status < 400)) {
        return { session: null, wasRedirected: true };
      }
      if (!response.ok) return { session: null, wasRedirected: false };
      const session = await response.json() as AdminSession;
      return { session: session.admin === true ? session : null, wasRedirected: false };
    } catch {
      return { session: null, wasRedirected: true };
    }
  };

  const adminResult = await tryEndpoint("/api/admin/session");
  if (adminResult.session) return adminResult.session;

  if (adminResult.wasRedirected && token) {
    const cmsResult = await tryEndpoint("/api/cms-session");
    if (cmsResult.session) return cmsResult.session;
  }

  throw new Error("Admin authentication required.");
}
