import { recordReviewLabelCheckpoint, reviewEventExportQuery } from "../../../lib/admin-label-exports.ts";
import { requireAdmin, type AdminAuthEnv } from "../../../lib/admin-auth.ts";
import { buildReviewLabelExport, type ReviewEventExportRow } from "../../../lib/review-labels.ts";

type D1Statement = {
  bind(...values: unknown[]): D1Statement;
  all<T = Record<string, unknown>>(): Promise<{ results?: T[] }>;
  run(): Promise<{ success?: boolean; meta?: { changes?: number } }>;
};

type D1Database = {
  prepare(query: string): D1Statement;
};

type EventContext<Env> = {
  request: Request;
  env: Env;
};

type Env = {
  DB?: unknown;
} & AdminAuthEnv;

const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-cache",
};

export async function onRequestGet(context: EventContext<Env>) {
  return exportReviewLabels(context, false);
}

export async function onRequestPost(context: EventContext<Env>) {
  return exportReviewLabels(context, true);
}

async function exportReviewLabels(context: EventContext<Env>, recordExport: boolean) {
  const auth = await requireAdmin(context.request, context.env);
  if (auth) return auth;

  const db = context.env.DB as D1Database | undefined;
  if (!db) {
    return Response.json(
      {
        source: "unavailable",
        error: "No production D1 dataset is bound.",
        labels: [],
        duplicateResolutions: [],
      },
      { headers: jsonHeaders, status: 503 },
    );
  }

  const { results } = await db.prepare(reviewEventExportQuery()).all<ReviewEventExportRow>();
  const output = buildReviewLabelExport(results ?? []);

  if (recordExport) {
    await recordReviewLabelCheckpoint(db, {
      exportedBy: "admin_ui",
      updatedAt: output.updatedAt,
    });
  }

  return Response.json(
    {
      source: "d1",
      exportRecorded: recordExport,
      ...output,
    },
    { headers: jsonHeaders },
  );
}

