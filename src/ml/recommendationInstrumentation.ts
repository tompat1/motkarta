import {
  ANONYMOUS_ID_ROTATION_DAYS,
  MAX_RECOMMENDATION_EVENTS_PER_BATCH,
  RECOMMENDATION_SCORER_VERSION,
  buildRecommendationEventIdempotencyKey,
  queryLengthBucket,
  recommendationCuisineContext,
  recommendationModeForContext,
  recommendationResultSetSignature,
  type QueryContext,
  type QueryContextKind,
  type QueryContextRankingMode,
  type QueryContextSortMode,
  type RecommendationEventType,
  type RecommendationMode,
} from "../../lib/recommendation-events";
import type { EstablishmentFilter, Mode, SortMode } from "../app/shared";

export type RecommendationEventDraft = {
  establishmentId: number;
  eventType: RecommendationEventType;
  resultPosition?: number | null;
  recommendationMode?: RecommendationMode;
  resultSetId?: string;
  queryContext?: QueryContext;
};

type StoredRecommendationIdentity = {
  anonymousUserId: string;
  expiresAt: string;
};

export function getRecommendationAnonymousUserId() {
  if (typeof window === "undefined") return null;

  const now = Date.now();
  try {
    const stored = localStorage.getItem("motkarta_recommendation_identity");
    if (stored) {
      const parsed = JSON.parse(stored) as StoredRecommendationIdentity;
      if (parsed.anonymousUserId && new Date(parsed.expiresAt).getTime() > now) {
        return parsed.anonymousUserId;
      }
    }
  } catch {}

  const anonymousUserId = `anon_${safeRandomId()}`;
  const expiresAt = new Date(now + ANONYMOUS_ID_ROTATION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  try {
    localStorage.setItem("motkarta_recommendation_identity", JSON.stringify({ anonymousUserId, expiresAt }));
  } catch {}
  return anonymousUserId;
}

export function getRecommendationSessionId() {
  if (typeof window === "undefined") return `session_${safeRandomId()}`;

  try {
    const stored = sessionStorage.getItem("motkarta_recommendation_session");
    if (stored) return stored;
  } catch {}

  const sessionId = `session_${safeRandomId()}`;
  try {
    sessionStorage.setItem("motkarta_recommendation_session", sessionId);
  } catch {}
  return sessionId;
}

export function safeRandomId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
}

export function recommendationKindContext(kind: EstablishmentFilter): QueryContextKind {
  const values: Record<EstablishmentFilter, QueryContextKind> = {
    "All places": "all_places",
    Curated: "curated",
    Saved: "saved",
    Latest: "latest",
    Restaurant: "restaurant",
    Bakery: "bakery",
    Café: "cafe",
    "Specialty coffee": "specialty_coffee",
  };
  return values[kind];
}

export function recommendationRankingModeContext(mode: Mode): QueryContextRankingMode {
  const values: Record<Mode, QueryContextRankingMode> = {
    "All recommendations": "all_recommendations",
    "Hidden gems": "hidden_gems",
    "Popular now": "popular_now",
    "Local favourites": "local_favourites",
    "Quality first": "quality_first",
    "Recently opened": "recently_opened",
    "Expert selected": "expert_selected",
    "Most verified": "most_verified",
  };
  return values[mode];
}

export function recommendationSortModeContext(sortMode: SortMode): QueryContextSortMode {
  const values: Record<SortMode, QueryContextSortMode> = {
    "Motkarta score": "motkarta_score",
    Distance: "distance",
    Alphabetical: "alphabetical",
    "Surprise me": "surprise_me",
  };
  return values[sortMode];
}



export {
  MAX_RECOMMENDATION_EVENTS_PER_BATCH,
  RECOMMENDATION_SCORER_VERSION,
  buildRecommendationEventIdempotencyKey,
  queryLengthBucket,
  recommendationCuisineContext,
  recommendationModeForContext,
  recommendationResultSetSignature,
};

export type { QueryContext };
