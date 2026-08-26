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
  RECOMMENDATION_EVENT_INGESTION_TOKEN?: string;
  RECOMMENDATION_EVENT_ALLOWED_ORIGINS?: string;
  RECOMMENDATION_EVENT_RATE_LIMIT_PER_MINUTE?: string;
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

const rateLimitWindowMs = 60_000;
const defaultEventRateLimitPerMinute = 240;
const rateLimitBuckets = new Map<string, { resetAt: number; count: number }>();

export async function onRequestPost(context: EventContext<Env>) {
  if (context.env.RECOMMENDATION_EVENTS_DISABLED === "true") {
    return Response.json(
      { source: "disabled", accepted: 0, stored: 0, duplicates: 0, trainingUse: false },
      { headers: jsonHeaders, status: 202 },
    );
  }

  const access = validateIngestionAccess(context.request, context.env);
  if (!access.ok) {
    return Response.json(
      { source: "rejected", accepted: 0, stored: 0, duplicates: 0, error: access.error, trainingUse: false },
      { headers: jsonHeaders, status: access.status },
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

  const quota = reserveEventQuota(context.request, context.env, parsed.events);
  if (!quota.ok) {
    return Response.json(
      {
        source: "rate_limited",
        accepted: 0,
        stored: 0,
        duplicates: 0,
        error: quota.error,
        retryAfterSeconds: quota.retryAfterSeconds,
        trainingUse: false,
      },
      { headers: { ...jsonHeaders, "retry-after": String(quota.retryAfterSeconds) }, status: 429 },
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
    missingReceivedAt,
    missingSchemaVersion,
    missingPrivacyVersion,
    byEventType,
    byMode,
  ] = await Promise.all([
    count(db, "SELECT COUNT(*) AS value FROM recommendation_events"),
    count(db, "SELECT COUNT(*) AS value FROM recommendation_events WHERE occurred_at >= ?", since24h),
    count(db, "SELECT COUNT(*) AS value FROM recommendation_events WHERE expires_at IS NOT NULL AND expires_at <= ?", now),
    count(db, "SELECT COUNT(*) AS value FROM recommendation_events WHERE event_type = 'impression' AND result_position IS NULL"),
    count(db, "SELECT COUNT(*) AS value FROM recommendation_events WHERE idempotency_key IS NULL OR idempotency_key = ''"),
    count(db, "SELECT COUNT(*) AS value FROM recommendation_events WHERE expires_at IS NULL"),
    count(db, "SELECT COUNT(*) AS value FROM recommendation_events WHERE received_at IS NULL"),
    count(db, "SELECT COUNT(*) AS value FROM recommendation_events WHERE schema_version IS NULL OR schema_version = ''"),
    count(db, "SELECT COUNT(*) AS value FROM recommendation_events WHERE privacy_version IS NULL OR privacy_version = ''"),
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
        missingReceivedAt,
        missingSchemaVersion,
        missingPrivacyVersion,
      },
      byEventType,
      byMode,
      qualityReady:
        total > 0 &&
        missingPosition === 0 &&
        missingIdempotency === 0 &&
        missingRetention === 0 &&
        missingReceivedAt === 0 &&
        missingSchemaVersion === 0 &&
        missingPrivacyVersion === 0 &&
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
  const columns = [
    "establishment_id",
    "anonymous_user_id",
    "session_id",
    "event_type",
    "result_position",
    "recommendation_mode",
    "query_context_json",
    "model_version",
    "occurred_at",
    "idempotency_key",
    "received_at",
    "expires_at",
    "schema_version",
    "privacy_version",
  ] as const;
  const values = [
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
  ];

  return db
    .prepare(
      `INSERT OR IGNORE INTO recommendation_events (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`,
    )
    .bind(...values)
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

function validateIngestionAccess(request: Request, env: Env): { ok: true } | { ok: false; status: number; error: string } {
  const origin = request.headers.get("origin");
  if (origin) {
    const allowedOrigins = allowedIngestionOrigins(request, env);
    if (!allowedOrigins.has(origin)) {
      return { ok: false, status: 403, error: "Recommendation event origin is not allowed." };
    }
  }

  const expectedToken = env.RECOMMENDATION_EVENT_INGESTION_TOKEN?.trim();
  if (expectedToken) {
    const authorization = request.headers.get("authorization") ?? "";
    const bearerToken = authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
    const suppliedToken = request.headers.get("x-motkarta-ingestion-token")?.trim() ?? bearerToken;
    if (suppliedToken !== expectedToken) {
      return { ok: false, status: 401, error: "Recommendation event ingestion token is invalid." };
    }
  }

  return { ok: true };
}

function allowedIngestionOrigins(request: Request, env: Env) {
  const requestOrigin = new URL(request.url).origin;
  const configured = (env.RECOMMENDATION_EVENT_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  return new Set([requestOrigin, ...configured]);
}

function reserveEventQuota(
  request: Request,
  env: Env,
  events: RecommendationEventRow[],
): { ok: true } | { ok: false; retryAfterSeconds: number; error: string } {
  const limit = rateLimitFromEnv(env);
  const now = Date.now();
  const key = rateLimitKey(request, events);
  const bucket = rateLimitBuckets.get(key);
  const activeBucket = bucket && bucket.resetAt > now ? bucket : { resetAt: now + rateLimitWindowMs, count: 0 };
  const nextCount = activeBucket.count + events.length;

  if (nextCount > limit) {
    rateLimitBuckets.set(key, activeBucket);
    return {
      ok: false,
      retryAfterSeconds: Math.max(1, Math.ceil((activeBucket.resetAt - now) / 1000)),
      error: "Recommendation event write quota exceeded.",
    };
  }

  activeBucket.count = nextCount;
  rateLimitBuckets.set(key, activeBucket);
  pruneRateLimitBuckets(now);
  return { ok: true };
}

function rateLimitFromEnv(env: Env) {
  const value = Number(env.RECOMMENDATION_EVENT_RATE_LIMIT_PER_MINUTE);
  if (Number.isFinite(value) && value >= MAX_RECOMMENDATION_EVENTS_PER_BATCH && value <= 5_000) {
    return Math.floor(value);
  }
  return defaultEventRateLimitPerMinute;
}

function rateLimitKey(request: Request, events: RecommendationEventRow[]) {
  const clientIp =
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "";
  const eventClientId = events[0]?.anonymousUserId ?? events[0]?.sessionId ?? "unknown";
  return clientIp ? `ip:${clientIp}` : `client:${eventClientId}`;
}

function pruneRateLimitBuckets(now: number) {
  if (rateLimitBuckets.size < 1_000) return;
  for (const [key, bucket] of rateLimitBuckets) {
    if (bucket.resetAt <= now) {
      rateLimitBuckets.delete(key);
    }
  }
}
