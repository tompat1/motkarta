import { buildReviewLabelExport, type ReviewEventExportRow } from "../../../lib/review-labels.ts";

type D1Statement = {
  all<T = Record<string, unknown>>(): Promise<{ results?: T[] }>;
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
  MOTKARTA_ADMIN_TOKEN?: string;
};

const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-cache",
};

export async function onRequestGet(context: EventContext<Env>) {
  const auth = requireAdmin(context.request, context.env);
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

  return Response.json(
    {
      source: "d1",
      ...output,
    },
    { headers: jsonHeaders },
  );
}

function reviewEventExportQuery() {
  return `
    SELECT
      ev.id AS event_id,
      ev.establishment_id,
      e.name,
      e.candidate_source_type,
      e.candidate_source_id,
      e.duplicate_resolution,
      e.merged_into_establishment_id,
      ev.lifecycle_state,
      ev.validation_label,
      ev.validation_notes,
      ev.action,
      ev.target_establishment_id,
      ev.reviewed_at
    FROM admin_review_events ev
    JOIN establishments e ON e.id = ev.establishment_id
    ORDER BY ev.reviewed_at DESC, ev.id DESC
  `;
}

function requireAdmin(request: Request, env: Env) {
  const configuredToken = env.MOTKARTA_ADMIN_TOKEN?.trim();
  if (!configuredToken) {
    return Response.json(
      { error: "Admin review is not configured." },
      { headers: jsonHeaders, status: 503 },
    );
  }

  const authHeader = request.headers.get("authorization") ?? "";
  const suppliedToken =
    request.headers.get("x-motkarta-admin-token") ??
    authHeader.replace(/^Bearer\s+/i, "").trim();

  if (suppliedToken !== configuredToken) {
    return Response.json(
      { error: "Unauthorized admin review request." },
      { headers: jsonHeaders, status: 401 },
    );
  }

  return null;
}
