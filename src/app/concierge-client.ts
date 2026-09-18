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
  return `${retrieval} · ${synthesis}`;
}
