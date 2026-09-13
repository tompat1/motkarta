# Motkarta RAG Concierge — Future Roadmap & Continuous Learning Architecture

This document details the architectural roadmap for expanding Motkarta's RAG Concierge into a multi-turn conversational facts bank with automated feedback learning loops and fallback web search enrichment options.

---

## 1. User Feedback Telemetry & Continuous Learning

### Immediate Telemetry Connection
The Concierge UI (`ConciergeAnswerView.tsx`) emits real-time user feedback directly to `/api/recommendation-events`:
- **Thumbs Up ("Ja / Helpful")** $\rightarrow$ Emits event type `would_return` with `mode: "concierge"`.
- **Thumbs Down ("Nej / Not helpful")** $\rightarrow$ Emits event type `dismiss` with `mode: "concierge"`.

### Data Invariants & Privacy Protection
- **Pseudonymous & Privacy-Safe**: Events are stored with 30-day rotating pseudonymous browser IDs. Raw query text is stripped/hashed to protect user privacy.
- **Admin Review Labels**: Admin review tooling (`scripts/export_review_labels.mjs`) exports feedback events to compute precision metrics and flag venues where facts were missing or mismatched.
- **Scoring & Retrieval Optimization**: Positive feedback boosts venue discovery confidence, while negative feedback flags the venue for re-enrichment or ground-truth verification.

---

## 2. Multi-Turn Conversation & Discussion Engine [Implemented]

### Contract Expansion (`QueryContext`)
Extend `lib/concierge/contracts.ts` to support multi-turn conversational turns:

```typescript
export type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: number | string; // Message timestamp (Stockholm 24h format in UI)
};

export type QueryContext = {
  language?: Locale;
  location?: Coordinates;
  radiusKm?: number;
  messages?: ChatMessage[]; // Previous turns in the conversation session
};
```

### Conversational Synthesis & Fact Bank Grounding
- **Fact-Anchored Context**: In multi-turn chat, retrieved `SourceFact` cards from the initial turn remain bound to the chat session context window.
- **Follow-up Handling**: Users can ask natural follow-up questions (e.g., *"Which of these are open on Sundays?"*, *"Do any have outdoor seating?"*, *"Tell me more about 85 Kvadrat"*).
- **Gemma Synthesis Prompting**: The system prompt instructs Gemma 4 to answer follow-up queries using *only* facts retrieved in the current session, maintaining 100% zero-hallucination protection.

---

## 3. On-Demand Web Search Enrichment for Unanswered Queries [Implemented]

### Problem Statement
When a user asks about a niche dish, specialty coffee process, or venue that is not yet populated in the local curated dataset (`cards.length === 0`), traditional search fallback often sends users to ad-heavy search engines or commercial directories with sponsored rankings.

### Architectural Implementation: Zero-Ad Inline Web Enrichment
Concierge now executes an on-demand, non-commercial web enrichment pipeline when no catalog cards match:

1. **Automatic Detection & Trigger**:
   - In `functions/api/concierge.ts`, if `result.cards.length === 0`, Concierge automatically triggers `fetchExternalWebResults(query, env)`.
   - No external paid API key is strictly required: queries utilize Brave Search or Tavily if configured, and seamlessly fallback to direct DuckDuckGo HTML open web scraping via Cloudflare Workers / server-side runtime (bypassing client CORS).

2. **Strict Commercial Signal Elimination (`lib/concierge/web-search.ts`)**:
   - **Prohibited Domain Blocklist**: Rejects review aggregators (`yelp`, `tripadvisor`, `thefork`, `gastrogate`, `bokabord`, `eniro`, `hitta`, `reco`) and commercial fast-food/coffee chains (`starbucks`, `espressohouse`, `mcdonalds`, `max`, `waynescoffee`, `subway`, etc.).
   - **Text Cleansing (`cleanCommercialText`)**: Strips star ratings (`4.5 av 5 stjärnor`, `★★★★☆`), review counts (`142 omdömen`), booking promotional slogans (`Boka bord online`), discount pitches (`20% rabatt`), and sponsored prefixes.
   - **Title Normalization (`cleanCommercialTitle`)**: Strips directory suffixes (`- Tripadvisor`, `- Yelp`, `- Thatsup`), removes top-10 listicle prefixes, and unescapes HTML entities.
   - **Domain Deduplication**: Limits results to maximum 1 result per domain and at most 5 curated cards.

3. **Inline Presentation (`src/components/ConciergeAnswerView.tsx` & `src/styles.css`)**:
   - All results are rendered directly **inline** as structured cards (`.concierge-card.concierge-web-card`) matching native venue card styling.
   - Distinctive electric cyan accent styling (`#38bdf8`) clearly marks external web discoveries.
   - Displays a prominent non-commercial badge: `"Realtidsresultat från öppna webben · Filtrerade utan kommersiella signaler & annonser"`.
   - Links point directly to the venue's official website or editorial article, completely eliminating Google search redirect links and ad exposure.

### Core Value Guardrails
- **No Commercial Ads or Rating Aggregators**: Aggressively filtered via domain blocklists and regex cleaners.
- **Privacy-Preserving**: No search queries are tracked or monetized.
- **Inline Consistency**: Web enrichments feel native to the Concierge experience rather than an external detour.

