import type { ChatMessage, ConciergeResponse } from "../../lib/concierge/contracts.ts";

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
