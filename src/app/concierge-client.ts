import type { ChatMessage, ConciergeResponse } from "../../lib/concierge/contracts.ts";
import { parseIntent } from "../../lib/concierge/intent.ts";

export type FollowUpChip = { label: string; query: string };

/** Generate contextual follow-up query chips dynamically based on the current query, area and results. */
export function buildFollowUpChips(
  query: string,
  response?: ConciergeResponse,
  messages?: ChatMessage[],
  lang: "sv" | "en" = "sv",
): FollowUpChip[] {
  const effectiveQuery =
    query ||
    response?.query ||
    (messages && [...messages].reverse().find((m) => m.role === "user")?.content) ||
    "";
  const intent = effectiveQuery ? parseIntent(effectiveQuery, { messages }) : null;
  const currentArea = intent?.area;
  const hasCards = (response?.cards && response.cards.length > 0) || false;

  const chips: FollowUpChip[] = [];

  // 1. Pagination or scope broadening
  if (hasCards) {
    chips.push({
      label: lang === "sv" ? "Fler förslag" : "More places",
      query: lang === "sv" ? "Ge mig fler ställen" : "Show more places",
    });
  } else if (currentArea) {
    chips.push({
      label: lang === "sv" ? "I hela stan?" : "Across the city?",
      query: lang === "sv" ? "I hela Stockholm då?" : "Across all of Stockholm?",
    });
  }

  // 2. Adaptive alternative district (never suggest the same district already queried)
  if (currentArea === "sodermalm") {
    chips.push({
      label: lang === "sv" ? "På Östermalm då?" : "In Östermalm?",
      query: lang === "sv" ? "På Östermalm då?" : "In Östermalm?",
    });
  } else if (currentArea === "ostermalm") {
    chips.push({
      label: lang === "sv" ? "I Vasastan då?" : "In Vasastan?",
      query: lang === "sv" ? "I Vasastan då?" : "In Vasastan?",
    });
  } else {
    // For Vasastan, Kungsholmen, Gamla Stan, or general queries: suggest Södermalm
    chips.push({
      label: lang === "sv" ? "På Söder då?" : "In Södermalm?",
      query: lang === "sv" ? "På Södermalm då?" : "In Södermalm?",
    });
  }

  // 3. Price or feature refinement
  const hasPriceConstraint =
    intent?.priceMax != null || /under|billig|cheap|budget|max/i.test(effectiveQuery);
  if (!hasPriceConstraint) {
    chips.push({
      label: lang === "sv" ? "Billigare" : "Budget friendly",
      query: lang === "sv" ? "Något billigare alternativ?" : "More affordable options?",
    });
  } else {
    chips.push({
      label: lang === "sv" ? "Med uteservering?" : "Outdoor seating?",
      query: lang === "sv" ? "Har de uteservering?" : "Do they have outdoor seating?",
    });
  }

  return chips;
}

/** Text shown in the concierge answer panel for a structured API response. */
export function conciergeDisplayAnswer(response: ConciergeResponse): string {
  if (response.action) {
    return response.intro || response.answer;
  }
  return response.answer || response.intro;
}

export function appendConciergeTurn(
  previousMessages: ChatMessage[],
  queryText: string,
  response: ConciergeResponse,
  userMessageTimestamp: number,
): ChatMessage[] {
  return [
    ...previousMessages,
    { role: "user" as const, content: queryText.trim(), timestamp: userMessageTimestamp },
    { role: "assistant" as const, content: response.intro || response.answer, timestamp: Date.now() },
  ].slice(-10);
}

/** Apply a successful concierge query to client-visible state. */
export function buildConciergeQuerySuccess(
  previousMessages: ChatMessage[],
  queryText: string,
  response: ConciergeResponse,
  userMessageTimestamp: number,
) {
  return {
    answer: conciergeDisplayAnswer(response),
    response,
    chatMessages: appendConciergeTurn(previousMessages, queryText, response, userMessageTimestamp),
  };
}

export function conciergeModeLabel(
  response: ConciergeResponse,
  lang: "sv" | "en",
): string {
  const retrieval =
    response.retrievalMode === "hybrid"
      ? lang === "sv"
        ? "Hybridsökning"
        : "Hybrid search"
      : lang === "sv"
        ? "Lexikalsökning"
        : "Lexical search";
  const synthesis =
    response.synthesisMode === "constrained"
      ? lang === "sv"
        ? "AI-faktaurval"
        : "AI fact selection"
      : lang === "sv"
        ? "Malltext"
        : "Template";
  const matched = response.cards.length;
  const searched = response.totalSearchSpace;
  const count =
    lang === "sv"
      ? `${matched} träffar av ${searched.toLocaleString("sv-SE")}`
      : `${matched} matches of ${searched.toLocaleString("en-US")}`;
  return `${retrieval} · ${synthesis} · ${count}`;
}
