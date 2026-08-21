import type { PlaceInput, PlaceLifecycleState } from "../../../lib/scoring.ts";

type D1RunResult = {
  success?: boolean;
  meta?: {
    changes?: number;
  };
};

type D1Statement = {
  bind(...values: unknown[]): D1Statement;
  all<T = Record<string, unknown>>(): Promise<{ results?: T[] }>;
  run(): Promise<D1RunResult>;
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

type ValidationLabel = NonNullable<PlaceInput["validationLabel"]>;
type CandidateStateFilter = PlaceLifecycleState | "all";

type CandidateRow = {
  id: number;
  name: string;
  kind: string;
  area: string;
  note: string;
  lifecycleState: PlaceLifecycleState;
  validationLabel: ValidationLabel | null;
  validationNotes: string | null;
  updatedAt: string | null;
  createdAt: string | null;
  evidenceCount: number | null;
  evidenceSourceTypes: string | null;
  latestEvidenceAt: string | null;
};

const lifecycleStates: PlaceLifecycleState[] = ["baseline", "candidate", "verified", "featured"];
const stateFilters: CandidateStateFilter[] = [...lifecycleStates, "all"];
const validationLabels: ValidationLabel[] = [
  "known_mainstream",
  "known_hidden_gem",
  "not_enough_evidence",
  "closed_wrong_category",
];

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
      { source: "unavailable", candidates: [], error: "No production D1 dataset is bound." },
      { headers: jsonHeaders, status: 503 },
    );
  }

  const url = new URL(context.request.url);
  const stateParam = url.searchParams.get("state") ?? "candidate";
  if (!isStateFilter(stateParam)) {
    return Response.json(
      { error: `Invalid state '${stateParam}'.` },
      { headers: jsonHeaders, status: 400 },
    );
  }

  const limit = clampLimit(url.searchParams.get("limit"));
  const rows = await loadCandidates(db, stateParam, limit);

  return Response.json(
    { source: "d1", state: stateParam, candidates: rows.map(candidateFromRow) },
    { headers: jsonHeaders },
  );
}

export async function onRequestPost(context: EventContext<Env>) {
  const auth = requireAdmin(context.request, context.env);
  if (auth) return auth;

  const db = context.env.DB as D1Database | undefined;
  if (!db) {
    return Response.json(
      { source: "unavailable", error: "No production D1 dataset is bound." },
      { headers: jsonHeaders, status: 503 },
    );
  }

  let payload: Record<string, unknown>;
  try {
    payload = (await context.request.json()) as Record<string, unknown>;
  } catch {
    return Response.json(
      { error: "Invalid JSON body." },
      { headers: jsonHeaders, status: 400 },
    );
  }

  const id = numericId(payload.id);
  const requestedState = payload.lifecycleState ?? payload.state;
  const lifecycleState = typeof requestedState === "string" && isLifecycleState(requestedState) ? requestedState : null;
  const validationLabel = normalizeValidationLabel(payload.validationLabel);
  const validationNotes = normalizeNotes(payload.validationNotes);

  if (!id) {
    return Response.json(
      { error: "Missing or invalid establishment id." },
      { headers: jsonHeaders, status: 400 },
    );
  }

  if (!lifecycleState) {
    return Response.json(
      { error: "Missing or invalid lifecycle state." },
      { headers: jsonHeaders, status: 400 },
    );
  }

  if (validationLabel === "invalid") {
    return Response.json(
      { error: "Invalid validation label." },
      { headers: jsonHeaders, status: 400 },
    );
  }

  if ((lifecycleState === "verified" || lifecycleState === "featured") && validationLabel === "closed_wrong_category") {
    return Response.json(
      { error: "Closed or wrong-category records cannot be promoted to verified or featured." },
      { headers: jsonHeaders, status: 400 },
    );
  }

  const updatedAt = new Date().toISOString();
  const updateResult = await db
    .prepare(
      `UPDATE establishments
       SET lifecycle_state = ?, validation_label = ?, validation_notes = ?, updated_at = ?
       WHERE id = ?`,
    )
    .bind(lifecycleState, validationLabel, validationNotes, updatedAt, id)
    .run();

  if (updateResult.meta?.changes === 0) {
    return Response.json(
      { error: "Establishment not found." },
      { headers: jsonHeaders, status: 404 },
    );
  }

  await recordReviewEvent(db, {
    establishmentId: id,
    lifecycleState,
    validationLabel,
    validationNotes,
    reviewedAt: updatedAt,
  });

  return Response.json(
    {
      success: true,
      id,
      lifecycleState,
      validationLabel,
      validationNotes,
      reviewedAt: updatedAt,
    },
    { headers: jsonHeaders },
  );
}

async function loadCandidates(db: D1Database, state: CandidateStateFilter, limit: number) {
  const select = `
    SELECT
      e.id,
      e.name,
      e.type AS kind,
      e.district AS area,
      e.description AS note,
      e.lifecycle_state AS lifecycleState,
      e.validation_label AS validationLabel,
      e.validation_notes AS validationNotes,
      e.updated_at AS updatedAt,
      e.created_at AS createdAt,
      COUNT(DISTINCT ev.id) AS evidenceCount,
      GROUP_CONCAT(DISTINCT ev.source_type) AS evidenceSourceTypes,
      MAX(ev.captured_at) AS latestEvidenceAt
    FROM establishments e
    LEFT JOIN evidence_sources ev ON ev.establishment_id = e.id
  `;
  const order = `
    GROUP BY e.id
    ORDER BY
      CASE WHEN MAX(ev.captured_at) IS NULL THEN 1 ELSE 0 END ASC,
      MAX(ev.captured_at) DESC,
      e.updated_at DESC,
      e.name ASC
    LIMIT ?
  `;

  if (state === "all") {
    const { results } = await db.prepare(`${select}${order}`).bind(limit).all<CandidateRow>();
    return results ?? [];
  }

  const { results } = await db
    .prepare(`${select}WHERE e.lifecycle_state = ? ${order}`)
    .bind(state, limit)
    .all<CandidateRow>();
  return results ?? [];
}

async function recordReviewEvent(
  db: D1Database,
  event: {
    establishmentId: number;
    lifecycleState: PlaceLifecycleState;
    validationLabel: ValidationLabel | null;
    validationNotes: string | null;
    reviewedAt: string;
  },
) {
  try {
    await db
      .prepare(
        `INSERT INTO admin_review_events
          (establishment_id, lifecycle_state, validation_label, validation_notes, reviewed_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .bind(
        event.establishmentId,
        event.lifecycleState,
        event.validationLabel,
        event.validationNotes,
        event.reviewedAt,
      )
      .run();
  } catch (error) {
    console.warn("Could not write admin_review_events audit row", error);
  }
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

function candidateFromRow(row: CandidateRow) {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    area: row.area,
    note: row.note,
    lifecycleState: row.lifecycleState,
    validationLabel: row.validationLabel ?? null,
    validationNotes: row.validationNotes ?? null,
    updatedAt: row.updatedAt,
    createdAt: row.createdAt,
    evidenceCount: Number(row.evidenceCount ?? 0),
    evidenceSourceTypes: parseEvidenceSources(row.evidenceSourceTypes),
    latestEvidenceAt: row.latestEvidenceAt,
  };
}

function isLifecycleState(value: string): value is PlaceLifecycleState {
  return lifecycleStates.includes(value as PlaceLifecycleState);
}

function isStateFilter(value: string): value is CandidateStateFilter {
  return stateFilters.includes(value as CandidateStateFilter);
}

function normalizeValidationLabel(value: unknown): ValidationLabel | null | "invalid" {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  if (typeof value === "string" && validationLabels.includes(value as ValidationLabel)) {
    return value as ValidationLabel;
  }

  return "invalid";
}

function normalizeNotes(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, 2_000) : null;
}

function numericId(value: unknown) {
  const id = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isInteger(id) && id > 0 ? id : null;
}

function clampLimit(value: string | null) {
  const parsed = Number(value ?? 100);
  if (!Number.isFinite(parsed)) {
    return 100;
  }

  return Math.min(200, Math.max(1, Math.floor(parsed)));
}

function parseEvidenceSources(value: string | null) {
  if (!value) {
    return [];
  }

  return value.split(",").map((item) => item.trim()).filter(Boolean);
}
