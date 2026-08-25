export const RECOMMENDATION_EVENT_SCHEMA_VERSION = "recommendation-events-v1";
export const RECOMMENDATION_EVENT_PRIVACY_VERSION = "privacy-rotation-v1";
export const RECOMMENDATION_SCORER_VERSION = "transparent-scorer-v1";
export const RECOMMENDATION_EVENT_RETENTION_DAYS = 180;
export const ANONYMOUS_ID_ROTATION_DAYS = 30;
export const MAX_RECOMMENDATION_EVENTS_PER_BATCH = 50;

export const recommendationEventTypes = [
  "impression",
  "profile_view",
  "save",
  "direction_request",
  "confirmed_visit",
  "would_return",
  "dismiss",
] as const;

export const recommendationModes = [
  "search",
  "map",
  "list",
  "concierge",
  "nearby",
  "saved",
  "curated",
  "hidden_gems",
] as const;

export const queryContextKeys = [
  "hasQuery",
  "queryLengthBucket",
  "kind",
  "cuisine",
  "mode",
  "sortMode",
  "resultCount",
  "surface",
] as const;

export type RecommendationEventType = (typeof recommendationEventTypes)[number];
export type RecommendationMode = (typeof recommendationModes)[number];
export type QueryContextKey = (typeof queryContextKeys)[number];
export type QueryContext = Partial<Record<QueryContextKey, string | number | boolean | null>>;

export type RecommendationEventInput = {
  establishmentId: number;
  anonymousUserId?: string | null;
  sessionId: string;
  eventType: RecommendationEventType;
  resultPosition?: number | null;
  recommendationMode: RecommendationMode;
  queryContext?: QueryContext | null;
  modelVersion: string;
  occurredAt: string;
  idempotencyKey: string;
};

export type RecommendationEventRow = RecommendationEventInput & {
  queryContextJson: string | null;
  receivedAt: string;
  expiresAt: string;
  schemaVersion: string;
  privacyVersion: string;
};

export type RecommendationEventValidationResult =
  | { ok: true; event: RecommendationEventRow }
  | { ok: false; errors: string[] };

const eventTypeSet = new Set<string>(recommendationEventTypes);
const modeSet = new Set<string>(recommendationModes);
const contextKeySet = new Set<string>(queryContextKeys);

export function validateRecommendationEvent(
  value: unknown,
  now = new Date(),
  retentionDays = RECOMMENDATION_EVENT_RETENTION_DAYS,
): RecommendationEventValidationResult {
  const errors: string[] = [];
  const event = value && typeof value === "object" ? value as Record<string, unknown> : null;

  if (!event) {
    return { ok: false, errors: ["event must be an object"] };
  }

  const establishmentId = Number(event.establishmentId);
  if (!Number.isInteger(establishmentId) || establishmentId <= 0) {
    errors.push("establishmentId must be a positive integer");
  }

  const eventType = String(event.eventType ?? "");
  if (!eventTypeSet.has(eventType)) {
    errors.push("eventType is not in the controlled vocabulary");
  }

  const recommendationMode = String(event.recommendationMode ?? "");
  if (!modeSet.has(recommendationMode)) {
    errors.push("recommendationMode is not in the controlled vocabulary");
  }

  const sessionId = cleanIdentifier(event.sessionId);
  if (!sessionId) {
    errors.push("sessionId is required");
  }

  const anonymousUserId = event.anonymousUserId == null ? null : cleanIdentifier(event.anonymousUserId);
  if (event.anonymousUserId != null && !anonymousUserId) {
    errors.push("anonymousUserId must be a short rotating application identifier");
  }

  const idempotencyKey = cleanIdempotencyKey(event.idempotencyKey);
  if (!idempotencyKey) {
    errors.push("idempotencyKey is required");
  }

  const resultPosition =
    event.resultPosition === undefined || event.resultPosition === null
      ? null
      : Number(event.resultPosition);
  if (eventType === "impression" && (resultPosition === null || !Number.isInteger(resultPosition) || resultPosition < 0)) {
    errors.push("impression events require a zero-based resultPosition");
  } else if (resultPosition !== null && (!Number.isInteger(resultPosition) || resultPosition < 0)) {
    errors.push("resultPosition must be a zero-based non-negative integer when provided");
  }

  const modelVersion = cleanVersion(event.modelVersion);
  if (!modelVersion) {
    errors.push("modelVersion is required");
  }

  const occurredAt = parseIsoDate(event.occurredAt);
  if (!occurredAt) {
    errors.push("occurredAt must be an ISO-8601 timestamp");
  } else {
    const ageMs = now.getTime() - occurredAt.getTime();
    const futureSkewMs = occurredAt.getTime() - now.getTime();
    if (ageMs > retentionDays * 24 * 60 * 60 * 1000) {
      errors.push("occurredAt is outside the retention window");
    }
    if (futureSkewMs > 5 * 60 * 1000) {
      errors.push("occurredAt cannot be more than five minutes in the future");
    }
  }

  const queryContextResult = serializeQueryContext(event.queryContext);
  if (!queryContextResult.ok) {
    errors.push(...queryContextResult.errors);
  }

  if (errors.length) {
    return { ok: false, errors };
  }

  const receivedAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + retentionDays * 24 * 60 * 60 * 1000).toISOString();

  return {
    ok: true,
    event: {
      establishmentId,
      anonymousUserId,
      sessionId: sessionId!,
      eventType: eventType as RecommendationEventType,
      resultPosition,
      recommendationMode: recommendationMode as RecommendationMode,
      queryContext: event.queryContext as QueryContext | null | undefined,
      queryContextJson: queryContextResult.ok ? queryContextResult.value : null,
      modelVersion: modelVersion!,
      occurredAt: occurredAt!.toISOString(),
      idempotencyKey: idempotencyKey!,
      receivedAt,
      expiresAt,
      schemaVersion: RECOMMENDATION_EVENT_SCHEMA_VERSION,
      privacyVersion: RECOMMENDATION_EVENT_PRIVACY_VERSION,
    },
  };
}

export function serializeQueryContext(value: unknown): { ok: true; value: string | null } | { ok: false; errors: string[] } {
  if (value === undefined || value === null) {
    return { ok: true, value: null };
  }

  if (typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, errors: ["queryContext must be a minimized object"] };
  }

  const errors: string[] = [];
  const minimized: Record<string, string | number | boolean | null> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!contextKeySet.has(key)) {
      errors.push(`queryContext.${key} is not allowed`);
      continue;
    }

    if (raw === null || typeof raw === "string" || typeof raw === "number" || typeof raw === "boolean") {
      if (typeof raw === "string" && raw.length > 80) {
        errors.push(`queryContext.${key} is too long`);
      } else {
        minimized[key] = raw;
      }
    } else {
      errors.push(`queryContext.${key} has an unsupported value type`);
    }
  }

  if (errors.length) {
    return { ok: false, errors };
  }

  return { ok: true, value: Object.keys(minimized).length ? JSON.stringify(minimized) : null };
}

export function queryLengthBucket(query: string) {
  const length = query.trim().length;
  if (length === 0) return "none";
  if (length <= 12) return "short";
  if (length <= 40) return "medium";
  return "long";
}

function cleanIdentifier(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return /^[a-zA-Z0-9:_-]{8,96}$/.test(trimmed) ? trimmed : null;
}

function cleanIdempotencyKey(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return /^[a-zA-Z0-9:._-]{16,160}$/.test(trimmed) ? trimmed : null;
}

function cleanVersion(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return /^[a-zA-Z0-9._:-]{3,80}$/.test(trimmed) ? trimmed : null;
}

function parseIsoDate(value: unknown) {
  if (typeof value !== "string") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
