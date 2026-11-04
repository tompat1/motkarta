import { sendWeeklyAdminDigest } from "../lib/admin-weekly-digest.ts";

type ScheduledContext<Env> = {
  env: Env;
  scheduledTime: number;
  cron: string;
};

/** Scheduled handler for Worker-based deployments. Pages is triggered by GitHub Actions. */
export async function onSchedule(context: ScheduledContext<Record<string, unknown>>) {
  await sendWeeklyAdminDigest(context.env);
}
