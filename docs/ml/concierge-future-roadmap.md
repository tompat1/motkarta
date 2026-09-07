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

## 3. On-Demand Web Search Enrichment for Unanswered Queries

### Problem Statement
When a user asks about a niche dish, specialty coffee process, or venue that is not yet fully populated in the local catalog, traditional search engines fallback to commercial sponsored ads or generic SEO text.

### Architectural Solution: Grounded Web Search Enrichment
When Concierge detects a partial or ungrounded query (`fallbackReasons` contains `no_current_semantic_matches` or `missing_dish_facts`):

1. **Trigger Targeted Search**: Launch an on-demand scraper (`execution/enrich_catalog.py --scrape` or `execution/enrich_web_search.py`) targeted at official venue websites or open curated registries.
2. **Fact Extraction**: Extract missing `openingHours`, `dish`, `atmosphere`, or `priceSEK` facts from the venue site.
3. **Fact Provenance**: Attribute extracted facts to `source: "Web Search ({domain})"`, `verification: "listed"`, with `capturedAt` UTC timestamp.
4. **Overlay Ingestion**: Append the newly extracted facts to `data/enrichment_overlay.json` and re-run `apply_enrichment.py`, permanently improving the fact bank for all future users.

### Core Value Guardrails
- **No Commercial Ads or Rating Aggregators**: Search enrichment strictly ignores Yelp, TripAdvisor, Google Star ratings, or paid promotion sites.
- **ODbL / CC0 / Fair Use Compliance**: Only venue self-reported facts or open-source data are ingested.
