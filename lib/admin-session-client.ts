import type { AdminSession } from "./admin-auth.ts";

/** Browser storage may supply a token, but only the server can grant Admin access. */
export async function fetchAdminSession(token = ""): Promise<AdminSession> {
  const tryEndpoint = async (endpoint: string): Promise<AdminSession | null> => {
    try {
      const response = await fetch(endpoint, {
        credentials: "same-origin",
        cache: "no-store",
        redirect: "manual",
        signal: AbortSignal.timeout(10000),
        headers: { Accept: "application/json", ...(token ? { "x-motkarta-admin-token": token } : {}) },
      });
      if (!response.ok || response.type === "opaqueredirect") return null;
      const session = await response.json() as AdminSession;
      return session.admin === true ? session : null;
    } catch {
      return null;
    }
  };

  let session = await tryEndpoint("/api/admin/session");
  if (!session && token) {
    session = await tryEndpoint("/api/cms-session");
  }
  if (!session) throw new Error("Admin authentication required.");
  return session;
}
