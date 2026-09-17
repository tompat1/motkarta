import type { AdminSession } from "./admin-auth.ts";

/** Browser storage may supply a token, but only the server can grant Admin access. */
export async function fetchAdminSession(token = ""): Promise<AdminSession> {
  const response = await fetch("/api/admin/session", {
    credentials: "same-origin",
    cache: "no-store",
    redirect: "manual",
    signal: AbortSignal.timeout(10000),
    headers: { Accept: "application/json", ...(token ? { "x-motkarta-admin-token": token } : {}) },
  });
  if (!response.ok || response.type === "opaqueredirect") throw new Error("Admin authentication required.");
  const session = await response.json() as AdminSession;
  if (session.admin !== true) throw new Error("Admin authentication required.");
  return session;
}
