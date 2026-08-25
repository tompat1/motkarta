import { requireAdmin, type AdminAuthEnv } from "../../lib/admin-auth.ts";
import {
  MAX_RECOMMENDATION_EVENTS_PER_BATCH,
  RECOMMENDATION_EVENT_RETENTION_DAYS,
  recommendationEventTypes,
  recommendationModes,
  validateRecommendationEvent,
  type RecommendationEventRow,
} from "../../lib/recommendation-events.ts";

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
  RECOMMENDATION_EVENTS_DISABLED?: string;
  RECOMMENDATION_EVENT_RETENTION_DAYS?: string;
} & AdminAuthEnv;

type CountRow = {
  value: number | null;
};

type GroupCountRow = {
  key: string | null;
  value: number | null;
};

const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-cache",
};

export async function onRequestPost(context: EventContext<Env>) {
  if (context.env.RECOMMENDATION_EVENTS_DISABLED === "true") {
    return Response.json(
      { source: "disabled", accepted: 0, stored: 0, duplicates: 0, trainingUse: false },
      { headers: jsonHeaders, status: 202 },
    );
  }

  const retentionDays = retentionDaysFromEnv(context.env);
  const parsed = await parseEventBatch(context.request, retentionDays);
  if (!parsed.ok) {
    return Response.json(
      { source: "validation", accepted: 0, stored: 0, duplicates: 0, errors: parsed.errors, trainingUse: false },
      { headers: jsonHeaders, status: 400 },
    );
  }

  const db = context.env.DB as D1Database | undefined;
  if (!db) {
    return Response.json(
      {
        source: "shadow",
        accepted: parsed.events.length,
        stored: 0,
        duplicates: 0,
        retentionDays,
        trainingUse: false,
        warning: "No D1 binding; events validated but not persisted.",
      },
      { headers: jsonHeaders, status: 202 },
    );
  }

  try {
    let stored = 0;
    for (const event of parsed.events) {
      const result = await insertEvent(db, event);
      stored += Number(result.meta?.changes ?? 0);
    }

    return Response.json(
      {
        source: "d1",
        mode: "shadow",
        accepted: parsed.events.length,
        stored,
        duplicates: parsed.events.length - stored,
        retentionDays,
        trainingUse: false,
      },
      { headers: jsonHeaders, status: 202 },
    );
  } catch (error) {
    console.error("Failed to ingest recommendation events", error);
    return Response.json(
      {
        source: "unavailable",
        accepted: parsed.events.length,
        stored: 0,
        duplicates: 0,
        error: "Recommendation event storage is unavailable or missing the latest migration.",
        trainingUse: false,
      },
      { headers: jsonHeaders, status: 503 },
    );
  }
}

export async function onRequestGet(context: EventContext<Env>) {
  const auth = await requireAdmin(context.request, context.env);
  if (auth) return auth;

  const db = context.env.DB as D1Database | undefined;
  if (!db) {
    return Response.json(
      { source: "unavailable", error: "No production D1 dataset is bound." },
      { headers: jsonHeaders, status: 503 },
    );
  }

  const now = new Date().toISOString();
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const [
    total,
    last24h,
    expired,
    missingPosition,
    missingIdempotency,
    missingRetention,
    byEventType,
    byMode,
  ] = await Promise.all([
    count(db, "SELECT COUNT(*) AS value FROM recommendation_events"),
    count(db, "SELECT COUNT(*) AS value FROM recommendation_events WHERE occurred_at >= ?", since24h),
    count(db, "SELECT COUNT(*) AS value FROM recommendation_events WHERE expires_at IS NOT NULL AND expires_at <= ?", now),
    count(db, "SELECT COUNT(*) AS value FROM recommendation_events WHERE event_type = 'impression' AND result_position IS NULL"),
    count(db, "SELECT COUNT(*) AS value FROM recommendation_events WHERE idempotency_key IS NULL OR idempotency_key = ''"),
    count(db, "SELECT COUNT(*) AS value FROM recommendation_events WHERE expires_at IS NULL OR privacy_version IS NULL"),
    groupCount(db, "SELECT event_type AS key, COUNT(*) AS value FROM recommendation_events GROUP BY event_type"),
    groupCount(db, "SELECT recommendation_mode AS key, COUNT(*) AS value FROM recommendation_events GROUP BY recommendation_mode"),
  ]);

  return Response.json(
    {
      source: "d1",
      mode: "shadow",
      generatedAt: now,
      trainingUse: false,
      controlledVocabularies: {
        eventTypes: recommendationEventTypes,
        recommendationModes,
      },
      retentionDays: retentionDaysFromEnv(context.env),
      counts: {
        total,
        last24h,
        expired,
        missingPosition,
        missingIdempotency,
        missingRetention,
      },
      byEventType,
      byMode,
      qualityReady:
        total > 0 &&
        missingPosition === 0 &&
        missingIdempotency === 0 &&
        missingRetention === 0 &&
        expired === 0,
    },
    { headers: jsonHeaders },
  );
}

async function parseEventBatch(request: Request, retentionDays: number) {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 64_000) {
    return { ok: false as const, errors: ["event batch is too large"] };
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return { ok: false as const, errors: ["request body must be valid JSON"] };
  }

  const rawEvents = Array.isArray(payload)
    ? payload
    : payload && typeof payload === "object" && Array.isArray((payload as { events?: unknown }).events)
      ? (payload as { events: unknown[] }).events
      : null;

  if (!rawEvents) {
    return { ok: false as const, errors: ["body must contain an events array"] };
  }

  if (!rawEvents.length || rawEvents.length > MAX_RECOMMENDATION_EVENTS_PER_BATCH) {
    return { ok: false as const, errors: [`events array must contain 1-${MAX_RECOMMENDATION_EVENTS_PER_BATCH} events`] };
  }

  const now = new Date();
  const events: RecommendationEventRow[] = [];
  const errors: string[] = [];
  rawEvents.forEach((rawEvent, index) => {
    const result = validateRecommendationEvent(rawEvent, now, retentionDays);
    if (result.ok) {
      events.push(result.event);
    } else {
      errors.push(...result.errors.map((error) => `events[${index}]: ${error}`));
    }
  });

  if (errors.length) {
    return { ok: false as const, errors };
  }

  return { ok: true as const, events };
}

async function insertEvent(db: D1Database, event: RecommendationEventRow) {
  return db
    .prepare(
      `INSERT OR IGNORE INTO recommendation_events (
        establishment_id,
        anonymous_user_id,
        session_id,
        event_type,
        result_position,
        recommendation_mode,
        query_context_json,
        model_version,
        occurred_at,
        idempotency_key,
        received_at,
        expires_at,
        schema_version,
        privacy_version
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      event.establishmentId,
      event.anonymousUserId,
      event.sessionId,
      event.eventType,
      event.resultPosition,
      event.recommendationMode,
      event.queryContextJson,
      event.modelVersion,
      event.occurredAt,
      event.idempotencyKey,
      event.receivedAt,
      event.expiresAt,
      event.schemaVersion,
      event.privacyVersion,
    )
    .run();
}

async function count(db: D1Database, query: string, ...values: unknown[]) {
  const { results } = await db.prepare(query).bind(...values).all<CountRow>();
  return Number(results?.[0]?.value ?? 0);
}

async function groupCount(db: D1Database, query: string) {
  const { results } = await db.prepare(query).all<GroupCountRow>();
  return Object.fromEntries((results ?? []).map((row) => [row.key ?? "unknown", Number(row.value ?? 0)]));
}

function retentionDaysFromEnv(env: Env) {
  const value = Number(env.RECOMMENDATION_EVENT_RETENTION_DAYS);
  if (Number.isFinite(value) && value >= 7 && value <= 365) {
    return Math.floor(value);
  }
  return RECOMMENDATION_EVENT_RETENTION_DAYS;
}
