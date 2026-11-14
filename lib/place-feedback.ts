import { addUserReview } from "./lazy-media.ts";

export interface FeedbackData {
  targetId: number | string;
  targetName: string;
  isPositive: boolean;
  selectedReasons: string[];
  comment: string;
  timestampMs: number;
}

export const LIKED_PLACE_IDS_STORAGE_KEY = "motkarta_liked_places";
const SAVED_PLACE_IDS_STORAGE_KEY = "motkarta_saved_places";

function feedbackStorage(): Storage | typeof globalThis.localStorage | null {
  if (typeof window !== "undefined" && window.localStorage) return window.localStorage;
  if (typeof globalThis.localStorage !== "undefined") return globalThis.localStorage;
  return null;
}

function numericPlaceId(value: number | string): number | null {
  const parsed = typeof value === "number" ? value : Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function readStoredIds(storage: Storage | typeof globalThis.localStorage, key: string): number[] {
  try {
    const parsed: unknown = JSON.parse(storage.getItem(key) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return Array.from(new Set(parsed.filter((id): id is number => Number.isInteger(id) && id > 0)));
  } catch {
    return [];
  }
}

export function getStoredLikedPlaceIds(): number[] {
  const storage = feedbackStorage();
  if (!storage) return [];

  const explicitlyLiked = readStoredIds(storage, LIKED_PLACE_IDS_STORAGE_KEY);
  let historicalLikes: number[] = [];
  try {
    const parsed: unknown = JSON.parse(storage.getItem("motkarta_rag_learning_feedback") ?? "[]");
    if (Array.isArray(parsed)) {
      historicalLikes = parsed
        .filter((item): item is FeedbackData => Boolean(item && typeof item === "object" && "isPositive" in item && item.isPositive))
        .map((item) => numericPlaceId(item.targetId))
        .filter((id): id is number => id !== null);
    }
  } catch {
    historicalLikes = [];
  }

  return Array.from(new Set([...explicitlyLiked, ...historicalLikes]));
}

function rememberPositivePlace(storage: Storage | typeof globalThis.localStorage, targetId: number | string) {
  const id = numericPlaceId(targetId);
  if (id === null) return { liked: false, addedToSaved: false };

  const likedIds = readStoredIds(storage, LIKED_PLACE_IDS_STORAGE_KEY);
  if (!likedIds.includes(id)) {
    storage.setItem(LIKED_PLACE_IDS_STORAGE_KEY, JSON.stringify([...likedIds, id]));
  }

  const savedIds = readStoredIds(storage, SAVED_PLACE_IDS_STORAGE_KEY);
  const addedToSaved = !savedIds.includes(id);
  if (addedToSaved) {
    storage.setItem(SAVED_PLACE_IDS_STORAGE_KEY, JSON.stringify([...savedIds, id]));
  }

  return { liked: true, addedToSaved };
}

export function savePlaceFeedback(
  data: FeedbackData,
  options?: { isNominateGem?: boolean; lang?: "sv" | "en" }
) {
  if (typeof window === "undefined") return;

  const isNominateGem = Boolean(options?.isNominateGem);
  const lang = options?.lang ?? "sv";
  let positivePreference = { liked: false, addedToSaved: false };

  try {
    if (isNominateGem) {
      const existingRaw = localStorage.getItem("motkarta_user_nominated_gems");
      const existing: Record<string, unknown>[] = existingRaw ? JSON.parse(existingRaw) : [];
      existing.push({
        targetId: data.targetId,
        targetName: data.targetName,
        selectedReasons: data.selectedReasons,
        comment: data.comment,
        timestampMs: data.timestampMs || Date.now(),
      });
      localStorage.setItem("motkarta_user_nominated_gems", JSON.stringify(existing.slice(-100)));
    } else {
      const existingRaw = localStorage.getItem("motkarta_rag_learning_feedback");
      const existing: FeedbackData[] = existingRaw ? JSON.parse(existingRaw) : [];
      existing.push(data);
      localStorage.setItem("motkarta_rag_learning_feedback", JSON.stringify(existing.slice(-100)));
      if (data.isPositive) {
        positivePreference = rememberPositivePlace(localStorage, data.targetId);
      }
    }
  } catch {
    // Ignore storage quota errors
  }

  // Also bridge to user reviews store if numeric place ID
  try {
    const numericId = typeof data.targetId === "number" ? data.targetId : Number.parseInt(String(data.targetId), 10);
    if (!Number.isNaN(numericId) && numericId > 0) {
      const reasonsText = data.selectedReasons.join(" • ");
      const combinedContent = data.comment.trim()
        ? (reasonsText ? `${reasonsText} — "${data.comment.trim()}"` : data.comment.trim())
        : reasonsText;
      if (combinedContent) {
        addUserReview(numericId, {
          author: isNominateGem
            ? (lang === "sv" ? "Lokal besökare (Pärla)" : "Local visitor (Gem)")
            : (lang === "sv" ? "Lokal besökare" : "Local visitor"),
          rating: isNominateGem ? 5.0 : data.isPositive ? 5.0 : 2.5,
          source: "Community Submission",
          content: combinedContent,
        });
      }
    }
  } catch {
    // Ignore review bridge errors
  }

  // Dispatch live update event
  try {
    window.dispatchEvent(
      new CustomEvent("motkarta-feedback-submitted", {
        detail: {
          ...data,
          isNominateGem,
          liked: positivePreference.liked,
          addedToSaved: positivePreference.addedToSaved,
        },
      })
    );
  } catch {
    // Ignore event dispatch errors
  }
}

export function getStoredPlaceFeedback(placeId: number | string | undefined, placeName: string | undefined): FeedbackData[] {
  if (typeof window === "undefined" && typeof globalThis.localStorage === "undefined") return [];
  try {
    const rawFeedback = (typeof window !== "undefined" ? window.localStorage : globalThis.localStorage).getItem(
      "motkarta_rag_learning_feedback"
    );
    const feedbackList: FeedbackData[] = rawFeedback ? JSON.parse(rawFeedback) : [];

    const rawGems = (typeof window !== "undefined" ? window.localStorage : globalThis.localStorage).getItem(
      "motkarta_user_nominated_gems"
    );
    const gemList: Record<string, unknown>[] = rawGems ? JSON.parse(rawGems) : [];

    const normalizedPlaceId = placeId !== undefined && placeId !== null ? String(placeId).trim() : "";
    const normalizedPlaceName = placeName ? String(placeName).trim().toLowerCase() : "";

    const matchedGems: FeedbackData[] = gemList
      .filter((g) => {
        const matchId = Boolean(normalizedPlaceId && String(g.targetId).trim() === normalizedPlaceId);
        const targetNameNorm = typeof g.targetName === "string" ? g.targetName.trim().toLowerCase() : "";
        const matchName = Boolean(normalizedPlaceName && targetNameNorm && targetNameNorm === normalizedPlaceName);
        return matchId || matchName;
      })
      .map((g) => ({
        targetId: (g.targetId as string | number) ?? placeId ?? 0,
        targetName: (g.targetName as string) ?? placeName ?? "",
        isPositive: true,
        selectedReasons: Array.isArray(g.selectedReasons) ? (g.selectedReasons as string[]) : [],
        comment: typeof g.comment === "string" ? g.comment : "",
        timestampMs: typeof g.timestampMs === "number" ? g.timestampMs : Date.now(),
      }));

    const matchedFeedback = feedbackList.filter((f) => {
      const matchId = Boolean(normalizedPlaceId && String(f.targetId).trim() === normalizedPlaceId);
      const targetNameNorm = typeof f.targetName === "string" ? f.targetName.trim().toLowerCase() : "";
      const matchName = Boolean(normalizedPlaceName && targetNameNorm && targetNameNorm === normalizedPlaceName);
      return matchId || matchName;
    });

    return [...matchedGems, ...matchedFeedback].sort(
      (a, b) => (b.timestampMs || 0) - (a.timestampMs || 0)
    );
  } catch {
    return [];
  }
}
