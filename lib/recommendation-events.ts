export const RECOMMENDATION_EVENT_SCHEMA_VERSION = "recommendation-events-v1";
export const RECOMMENDATION_EVENT_PRIVACY_VERSION = "privacy-rotation-v1";
export const RECOMMENDATION_SCORER_VERSION = "transparent-scorer-v1";
export const RECOMMENDATION_EVENT_RETENTION_DAYS = 180;
export const ANONYMOUS_ID_ROTATION_DAYS = 30;
export const MAX_RECOMMENDATION_EVENTS_PER_BATCH = 10;

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

export const queryLengthBuckets = ["none", "short", "medium", "long"] as const;
export const queryContextKinds = [
  "all_places",
  "curated",
  "saved",
  "latest",
  "restaurant",
  "bakery",
  "cafe",
  "specialty_coffee",
] as const;
export const queryContextCuisines = [
  "all_cuisines",
  "coffee",
  "cafe",
  "bakery",
  "patisserie",
  "pastry",
  "pizza",
  "schnitzel",
  "burger",
  "polish",
  "eastern_european",
  "mexican",
  "spanish",
  "french",
  "bistro",
  "german",
  "austrian",
  "hungarian",
  "thai",
  "italian",
  "swedish",
  "regional",
  "general",
  "other",
] as const;
export const queryContextRankingModes = [
  "for_you",
  "hidden_gems",
  "popular_now",
  "local_favourites",
  "quality_first",
  "recently_opened",
  "expert_selected",
  "most_verified",
] as const;
export const queryContextSortModes = ["best_match", "distance", "alphabetical", "surprise_me"] as const;
export const queryContextSurfaces = ["results", "map", "place_detail", "concierge"] as const;

export type RecommendationEventType = (typeof recommendationEventTypes)[number];
export type RecommendationMode = (typeof recommendationModes)[number];
export type QueryContextKey = (typeof queryContextKeys)[number];
export type QueryLengthBucket = (typeof queryLengthBuckets)[number];
export type QueryContextKind = (typeof queryContextKinds)[number];
export type QueryContextCuisine = (typeof queryContextCuisines)[number];
export type QueryContextRankingMode = (typeof queryContextRankingModes)[number];
export type QueryContextSortMode = (typeof queryContextSortModes)[number];
export type QueryContextSurface = (typeof queryContextSurfaces)[number];
export type QueryContext = Partial<{
  hasQuery: boolean | null;
  queryLengthBucket: QueryLengthBucket | null;
  kind: QueryContextKind | null;
  cuisine: QueryContextCuisine | null;
  mode: QueryContextRankingMode | null;
  sortMode: QueryContextSortMode | null;
  resultCount: number | null;
  surface: QueryContextSurface | null;
}>;

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
const queryLengthBucketSet = new Set<string>(queryLengthBuckets);
const queryContextKindSet = new Set<string>(queryContextKinds);
const queryContextCuisineSet = new Set<string>(queryContextCuisines);
const queryContextRankingModeSet = new Set<string>(queryContextRankingModes);
const queryContextSortModeSet = new Set<string>(queryContextSortModes);
const queryContextSurfaceSet = new Set<string>(queryContextSurfaces);

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

    const validation = validateQueryContextValue(key as QueryContextKey, raw);
    if (validation.ok) {
      if (validation.value !== undefined) {
        minimized[key] = validation.value;
      }
    } else {
      errors.push(validation.error);
    }
  }

  if (errors.length) {
    return { ok: false, errors };
  }

  return { ok: true, value: Object.keys(minimized).length ? JSON.stringify(minimized) : null };
}

export function queryLengthBucket(query: string): QueryLengthBucket {
  const length = query.trim().length;
  if (length === 0) return "none";
  if (length <= 12) return "short";
  if (length <= 40) return "medium";
  return "long";
}

export function recommendationCuisineContext(value: unknown): QueryContextCuisine {
  const token = normalizeContextToken(value);
  return queryContextCuisineSet.has(token) ? token as QueryContextCuisine : "other";
}

export function recommendationModeForContext(context: QueryContext): RecommendationMode {
  if (context.surface === "map") return "map";
  if (context.surface === "concierge") return "concierge";
  if (context.kind === "saved") return "saved";
  if (context.kind === "curated" || context.mode === "expert_selected") return "curated";
  if (context.mode === "hidden_gems") return "hidden_gems";
  if (context.sortMode === "distance") return "nearby";
  return context.hasQuery ? "search" : "list";
}

export function recommendationResultSetSignature(context: QueryContext, establishmentIds: number[]) {
  const orderedIds = establishmentIds.map((id) => Number(id)).filter(Number.isInteger).join(",");
  return stableHash(`${canonicalizeRecommendationContext(context)}|ids:${orderedIds}`);
}

export function buildRecommendationEventIdempotencyKey({
  sessionId,
  eventType,
  establishmentId,
  resultPosition,
  modelVersion,
  queryContext,
  resultSetId,
}: {
  sessionId: string;
  eventType: RecommendationEventType;
  establishmentId: number;
  resultPosition?: number | null;
  modelVersion: string;
  queryContext: QueryContext;
  resultSetId?: string | null;
}) {
  const contextHash = recommendationContextHash(queryContext);
  return [
    sessionId,
    eventType,
    establishmentId,
    resultPosition ?? "none",
    modelVersion,
    resultSetId ?? "action",
    contextHash,
  ].map(safeIdempotencyPart).join(":");
}

export function recommendationContextHash(context: QueryContext) {
  return stableHash(canonicalizeRecommendationContext(context));
}

export function canonicalizeRecommendationContext(context: QueryContext) {
  const entries = Object.entries(context)
    .filter(([key, value]) => contextKeySet.has(key) && value !== undefined)
    .sort(([left], [right]) => left.localeCompare(right));
  return JSON.stringify(Object.fromEntries(entries));
}

function validateQueryContextValue(
  key: QueryContextKey,
  raw: unknown,
): { ok: true; value?: string | number | boolean | null } | { ok: false; error: string } {
  if (raw === null) {
    return { ok: true, value: null };
  }

  if (key === "hasQuery") {
    return typeof raw === "boolean"
      ? { ok: true, value: raw }
      : { ok: false, error: "queryContext.hasQuery must be a boolean" };
  }

  if (key === "resultCount") {
    const value = Number(raw);
    return Number.isInteger(value) && value >= 0 && value <= 5_000
      ? { ok: true, value }
      : { ok: false, error: "queryContext.resultCount must be an integer between 0 and 5000" };
  }

  if (typeof raw !== "string") {
    return { ok: false, error: `queryContext.${key} must use the controlled string vocabulary` };
  }

  const allowed = contextValueSet(key);
  return allowed.has(raw)
    ? { ok: true, value: raw }
    : { ok: false, error: `queryContext.${key} is not in the controlled vocabulary` };
}

function contextValueSet(key: QueryContextKey) {
  if (key === "queryLengthBucket") return queryLengthBucketSet;
  if (key === "kind") return queryContextKindSet;
  if (key === "cuisine") return queryContextCuisineSet;
  if (key === "mode") return queryContextRankingModeSet;
  if (key === "sortMode") return queryContextSortModeSet;
  if (key === "surface") return queryContextSurfaceSet;
  return new Set<string>();
}

function normalizeContextToken(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function safeIdempotencyPart(value: unknown) {
  return String(value ?? "none")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "none";
}

function stableHash(value: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `h${(hash >>> 0).toString(36)}`;
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
