import { addUserReview } from "./lazy-media.ts";

export interface FeedbackData {
  targetId: number | string;
  targetName: string;
  isPositive: boolean;
  selectedReasons: string[];
  comment: string;
  timestampMs: number;
}

export function savePlaceFeedback(
  data: FeedbackData,
  options?: { isNominateGem?: boolean; lang?: "sv" | "en" }
) {
  if (typeof window === "undefined") return;

  const isNominateGem = Boolean(options?.isNominateGem);
  const lang = options?.lang ?? "sv";

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
        detail: data,
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

    const combined = [...matchedGems, ...matchedFeedback].sort(
      (a, b) => (b.timestampMs || 0) - (a.timestampMs || 0)
    );
    return combined;
  } catch {
    return [];
  }
}
