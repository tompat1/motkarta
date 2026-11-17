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

  // 3. Concept-specific narrowing for broad queries
  const isPizza = intent?.cuisineKinds.includes("pizza");
  const isBurger = intent?.cuisineKinds.includes("burger");
  const isChinese = intent?.cuisineKinds.includes("chinese");
  const isBarOrPub = intent?.bar || intent?.pub;
  const isWine = intent?.wineBar;
  const isDinner = intent?.dinner;

  if (isPizza) {
    chips.push({
      label: lang === "sv" ? "Napolitansk pizza" : "Neapolitan pizza",
      query: lang === "sv" ? "Napolitansk pizza" : "Neapolitan pizza",
    });
  } else if (isWine) {
    chips.push({
      label: lang === "sv" ? "Naturvin" : "Natural wine",
      query: lang === "sv" ? "Vinbar med naturvin" : "Wine bar with natural wine",
    });
  } else if (isBarOrPub) {
    if (!intent?.cocktail) {
      chips.push({
        label: lang === "sv" ? "Cocktailbar" : "Cocktail bar",
        query: lang === "sv" ? "Bästa cocktailbaren" : "Best cocktail bar",
      });
    }
    chips.push({
      label: lang === "sv" ? "Hantverksöl & pub" : "Craft beer & pub",
      query: lang === "sv" ? "Hantverksöl och pub" : "Craft beer and pub",
    });
  } else if (isBurger) {
    chips.push({
      label: lang === "sv" ? "Smashburgare" : "Smash burgers",
      query: lang === "sv" ? "Smashburgare" : "Smash burgers",
    });
  } else if (isChinese) {
    chips.push({
      label: lang === "sv" ? "Dumplings & dim sum" : "Dim sum & dumplings",
      query: lang === "sv" ? "Dumplings och dim sum" : "Dumplings and dim sum",
    });
  } else if (isDinner) {
    chips.push({
      label: lang === "sv" ? "Kvarterskrog" : "Neighborhood bistro",
      query: lang === "sv" ? "Mysig kvarterskrog" : "Cozy neighborhood bistro",
    });
  }

  // 4. Missing venue or fallback suggestions
  const cleanedPlaceName = effectiveQuery
    .replace(/^(hitta|sök|var ligger|bästa|find|where is|tipsa om|lägg till ställe)\s+/i, "")
    .trim();
  const isGenericCategory = Boolean(
    intent &&
    (intent.cuisineKinds.length > 0 ||
      intent.dishes.length > 0 ||
      intent.specialty ||
      intent.bakery ||
      intent.dinner ||
      intent.hiddenGem ||
      intent.atmosphere)
  );
  const hasExactPlaceMatch = Boolean(
    response?.cards &&
    response.cards.some((c) => {
      const cNorm = c.name.toLowerCase().trim();
      const qNorm = cleanedPlaceName.toLowerCase().trim();
      return cNorm === qNorm || (qNorm.length > 3 && cNorm.startsWith(qNorm));
    })
  );

  const isSpecificPlaceSearch = Boolean(cleanedPlaceName && !isGenericCategory && !hasExactPlaceMatch);
  if (isSpecificPlaceSearch) {
    const chipLabel =
      lang === "sv"
        ? (cleanedPlaceName.length <= 18 ? `Tipsa om "${cleanedPlaceName}"` : "Tipsa om ställe")
        : (cleanedPlaceName.length <= 18 ? `Suggest "${cleanedPlaceName}"` : "Suggest place");
    chips.push({
      label: chipLabel,
      query: `Lägg till ställe ${cleanedPlaceName}`,
    });
  } else if (!hasCards && !currentArea && !isGenericCategory) {
    chips.push({
      label: lang === "sv" ? "Bästa baren i stan" : "Best bar in town",
      query: lang === "sv" ? "Bästa baren i stan" : "Best bar in town",
    });
    chips.push({
      label: lang === "sv" ? "Godaste pizzan" : "Best pizza",
      query: lang === "sv" ? "Bästa pizzerian" : "Best pizza",
    });
    chips.push({
      label: lang === "sv" ? "Mysigt fik" : "Cozy café",
      query: lang === "sv" ? "Mysigt fik" : "Cozy café",
    });
  }

  // 5. Price or feature refinement
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

  if (!hasCards && !isSpecificPlaceSearch && !chips.some((c) => c.label.includes("Tipsa om"))) {
    chips.push({
      label: lang === "sv" ? "Tipsa om ställe" : "Suggest missing place",
      query: `Lägg till ställe ${cleanedPlaceName || effectiveQuery}`,
    });
  }

  return chips.slice(0, 5);
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
