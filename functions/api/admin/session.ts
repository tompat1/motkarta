import { getAdminSession, type AdminAuthEnv } from "../../../lib/admin-auth.ts";

type EventContext<Env> = {
  request: Request;
  env: Env;
};

type Env = AdminAuthEnv;

const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-cache",
};

export async function onRequestGet(context: EventContext<Env>) {
  const session = await getAdminSession(context.request, context.env);
  return Response.json(
    {
      admin: session.admin,
      authMode: session.authMode ?? "none",
      email: session.email,
      reason: session.reason,
      configured: session.configured,
    },
    { headers: jsonHeaders, status: session.admin ? 200 : session.status ?? 401 },
  );
}
