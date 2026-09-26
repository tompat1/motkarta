import { sendWeeklyAdminDigest } from "../lib/admin-weekly-digest.ts";

type ScheduledContext<Env> = {
  env: Env;
  scheduledTime: number;
  cron: string;
};

/** Cloudflare Pages scheduled handler — Mondays 08:00 UTC. */
export async function onSchedule(context: ScheduledContext<Record<string, unknown>>) {
  await sendWeeklyAdminDigest(context.env);
}
