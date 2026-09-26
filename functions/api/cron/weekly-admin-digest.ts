import { authorizeCronRequest, sendWeeklyAdminDigest } from "../../../lib/admin-weekly-digest.ts";

type EventContext<Env> = {
  request: Request;
  env: Env;
};

const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

export async function onRequestPost(context: EventContext<Record<string, unknown>>) {
  if (!authorizeCronRequest(context.request, context.env)) {
    return Response.json({ error: "Unauthorized cron request." }, { headers: jsonHeaders, status: 401 });
  }
  const force = context.request.headers.get("x-motkarta-digest-force") === "1";
  const result = await sendWeeklyAdminDigest(context.env, { force });
  return Response.json(result, { headers: jsonHeaders, status: result.sent ? 200 : 202 });
}

export async function onRequestGet(context: EventContext<Record<string, unknown>>) {
  return onRequestPost(context);
}
