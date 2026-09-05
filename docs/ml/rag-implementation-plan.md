# Multilingual, evidence-grounded RAG concierge

Status: proposal, 2026-09-05. Implementation awaits the repository's required
plan approval. This document describes proposed behavior, not deployed capability.

## Outcome

Improve Swedish, English, mixed-language and misspelled venue queries while
preserving exact-name lookup, explicit constraints, Stockholm scope and
deterministic evidence gates. Return useful explanations tied to actual source
facts, with honest unknowns and an operational fallback when AI is unavailable.

Primary owner: concierge retrieval/synthesis. Production ranking within the
concierge changes; global scorer weights, hidden-gem policy, residual research,
personalization and behavioral training do not change. Python corpus and CLI
paths require the same grounding and exclusion contracts, but need not acquire
a second production vector service.

## Verified current state

| Finding | Evidence / consequence |
| --- | --- |
| The Pages endpoint is lexical retrieval plus template text | `functions/api/concierge.ts`; `Env` only declares `DB`; `wrangler.toml` only binds D1. There is no embedding/vector/generation integration in this endpoint. |
| Browser records take precedence over D1 | `src/App.tsx:askWithQuery` sends the entire `places` array; POST accepts it as the search corpus. A client can supply its own supposed evidence. |
| Empty-match fallback can return excluded chains | Reproduced `retrieveAndSynthesize('specialty coffee', [Starbucks])` returning Starbucks despite its -9999 penalty. |
| Constraints are incomplete | Price/transit filters are extracted but not enforced; negation is discarded as a stopword; location intent changes map sorting but coordinates are not sent to the concierge. |
| The corpus is larger and sparser than the supplied assessment | Local `public/data/places.json`: 3,245 records; 1,761 with cuisine; 53 with source URLs; four with `lastUpdated`; zero with structured `openingHours` or nonempty `priceLevel`. These counts do not describe live D1. |
| Missing lifecycle is common | 3,191 local records omit lifecycle; existing policy treats missing as baseline. Do not convert baseline to verified, or drop nearly the entire catalog by requiring verified status for every result. |
| Default values can become false claims | `lib/place-records.ts` converts missing price to tier 2. Template output conflates general confidence/freshness with hours verification, and supplies universal source/license claims. |
| Python corpus text manufactures evidence | `motkarta/rag.py` calls records verified and independent without checking supporting facts, adds community-stability claims, and treats a hidden-gem boolean as proof of gates. Do not embed this text unchanged. |
| UI parsing also invents confidence | `lib/concierge-parser.ts` supplies verified hours, medium price confidence and recent verification for legacy bullet responses. Cards are primarily matched back to places by name. |
| Multiple retrieval implementations exist | Python concierge and FastAPI paths differ from Pages. The ML architecture must explicitly identify Pages as the production app endpoint and document deliberate offline differences. |

## Corrections to the supplied proposal

- Use a multilingual embedding candidate. BAAI identifies `bge-base-en-v1.5`
  as English; `bge-m3` is multilingual with 1,024 dimensions. Language and typo
  failures still need measured tests; no embedding removes all of them.
  [BAAI model card](https://huggingface.co/BAAI/bge-m3).
- Keep lexical retrieval alongside vectors. Names, addresses, negation and
  precise requirements need explicit treatment. Similarity is a relevance
  signal, not proof that a venue serves a dish or has an amenity.
- Changing the candidate pool changes exposure even if the final sorter is
  deterministic. Evaluate the whole pipeline, not just the generation step.
- Workers AI's free allowance is 10,000 **neurons/day**, not requests/day.
  Cost depends on model and input/output size; the quoted $0.01/query and 1.5s
  latency are not established measurements.
  [Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/).
- Pages supports both AI and Vectorize bindings, but provisioned indexes,
  metadata indexes, corpus synchronization and monitoring are still new
  operational responsibilities.
  [Pages bindings](https://developers.cloudflare.com/pages/functions/bindings/).

## Architecture and contracts

```text
Query + language + optional consented coordinates / explicit filters
  -> bounded request validation and explicit action routing
  -> trusted server catalog and structured intent
  -> lexical candidates + multilingual vector candidates
  -> ID reconciliation and current fact/evidence hydration
  -> lifecycle, validation, chain, geography and explicit-constraint gates
  -> versioned deterministic relevance fusion and ranking
  -> fixed ordered result IDs + source fact packets
  -> constrained LLM synthesis + output validation
  -> structured cards / citations, or deterministic fallback
```

1. **Trusted records.** Production accepts query/context, never client-authored
   venue facts. Use D1 as the canonical runtime source, and reconcile IDs,
   coverage and source lineage with the public export before switching traffic.
   If D1 coverage is insufficient, complete the reviewed catalog synchronization
   before enabling RAG. A server-controlled published snapshot may support an
   explicitly configured fallback; never silently promote arbitrary POST data.
   Browser-only Vite development retains a pure local retriever against the
   bundled snapshot with the same gates. Server failure remains visible.

2. **Fact contract.** Add `ConciergePlaceFacts` and `SourceFact` contracts beside
   the scorer types. Keep nullable source values separate from scoring defaults.
   A source fact has stable fact/place IDs, field, value, source identity, optional
   URL/license, capture time, and field-specific verification status/time.
   Read available D1 evidence URLs/summaries and chain status instead of dropping
   them in mapping. Do not treat a generic source summary as verification of every
   attribute. Unknown source/license/time stays unknown. Source timestamps and
   actual verification timestamps have distinct meanings.

3. **Corpus.** Produce one compact factual document per venue initially: name,
   aliases, type, cuisine, district/address and attributable attributes. Exclude
   platform ratings/reviews/prominence, engagement, computed quality/popularity,
   residual/anomaly values and synthetic praise from embedding text. Keep gate
   results and scorer outputs separate. Add per-source chunks only when evidence
   volume requires them, deduplicating results by canonical venue ID.

4. **Intent and location.** Preserve negation, exact venue names, cuisine versus
   specific dish, soft preferences versus hard requirements, and requested
   locale. Retain a small normalization vocabulary for deterministic constraints.
   An optional future intent model must return a validated schema; it cannot
   silently add hard filters. Use consented coordinates for server-computed
   distance and radius checks, not an embedding of 'near me'. Missing location
   triggers a district/location clarification. Approximate bounds are not proof
   of municipality membership. Reuse Stockholm boundary policy and shared fixtures.

5. **Hybrid retrieval/ranking.** Start with up to 50 lexical and 50 vector
   candidates, plus explicit exact-name candidates. Union by stable ID and use
   equal-weight reciprocal-rank fusion with proposed constant 60. After hard
   gates, sort exact-name matches first where requested, then fused relevance,
   then existing `scorePlace` recommendation, then stable ID. Record component
   ranks/reasons; this is `concierge-hybrid-v1`, not `transparent-scorer-v1.1`.
   Apply supported geographic/category metadata filters before vector search and
   all gates again against current canonical records afterward. Explicit dish,
   dog-friendly, price and hours requirements cannot pass through similarity
   alone. Unknown hard requirements produce a clarification/partial-match state,
   never an asserted match. Define relevance admission thresholds on a development
   set and freeze them before holdout evaluation; RRF alone is not confidence.
   Broaden candidate budgets within service limits when filtering removes hits,
   without relaxing the user's hard constraints. Empty valid pools return no
   recommendations rather than resurfacing rejected records.

6. **Grounded generation.** The server selects three to five ordered results.
   Prototype `@cf/google/gemma-3-12b-it` for multilingual synthesis, accepting it
   only after Swedish/English and schema tests. Input is a bounded fact packet;
   user text and source text are untrusted data, not instructions. Output schema
   contains ordered place IDs, allowed fact/reason IDs and bounded connective
   text. Validate IDs, order, citations and field references; reject invalid
   output and render deterministic text. Render hours, prices, addresses,
   verification, source links and hidden-gem labels from server facts, outside
   free-form generation. Citation existence alone does not prove a generated
   paraphrase is supported: assess entailment in the holdout and constrain
   factual statements to approved fact rendering for initial release. No tools
   or write actions are available to the synthesis model. Explicit add/review/
   photo/rating actions remain separately parsed and cannot be triggered by
   model text. Missing facts remain visible in both languages.

7. **Response/UI.** Retain legacy `answer`, `recommendedPlaces`, `source` and
   `totalSearchSpace` during migration. Add schema version, structured cards
   with IDs/citations, status (`ok`, `partial`, `clarification`, `unavailable`),
   retrieval/synthesis modes and behavior versions. Render cards by ID; avoid
   fuzzy name joins across Pascal locations. Remove invented legacy parser
   defaults. Pass language/location from the client, cancel obsolete requests,
   and prevent slow earlier answers replacing a newer query. Move shared local
   logic into `lib/concierge/`; do not import a server endpoint into the bundle.

8. **Index lifecycle.** Use `@cf/baai/bge-m3` dense embeddings with a separate
   1,024-dimensional cosine index for each promoted corpus/model generation.
   Store canonical ID, document hash, corpus version and filter metadata. Create
   metadata indexes before upserting. Dry-run indexing reports admitted/rejected
   counts, dimensions and estimated tokens. Incremental sync skips unchanged
   documents, removes deleted/ineligible records, retries bounded batches and
   persists a manifest. Wait for asynchronous mutations to become queryable and
   verify sample IDs/counts before promotion. Fetch current facts at request time
   and reject stale document hashes; fall back to lexical retrieval during lag.
   Never mix embedding models or dimensions. Keep the prior index for rollback.

9. **Operations/privacy.** Independent flags: `CONCIERGE_RETRIEVAL_MODE` and
   `CONCIERGE_SYNTHESIS_MODE`, defaulting to lexical/template until validated.
   Bound body/query/context sizes, model output tokens, remote calls and overall
   latency. Apply abuse controls before AI calls; an isolate-local quota alone
   is not a global spending cap. Report stage latency, counts, versions and
   fallback reasons without raw queries or precise coordinates. Do not add raw
   query storage, stable query hashes or new personal identifiers to event logs.
   Preserve existing shadow telemetry rules; document existing browser query
   history separately. Use POST for AI requests; legacy GET stays deterministic
   during migration. No user-query embedding persistence or shared personalized
   answer cache in v1. Model usage in Wrangler development also uses the account;
   ordinary tests must mock providers.

## Implementation sequence

| Stage | Concrete files/work | Exit condition |
| --- | --- | --- |
| 1. Trust and grounding | `lib/concierge/{contracts,facts,gates,retrieval}.ts`, `functions/api/concierge.ts`, `lib/place-records.ts`, `motkarta/rag.py`, Python concierge/FastAPI safety adapters, parser fixes | Chain-only fallback returns none; closed/wrong-category and candidate records never leak; missing facts stay unknown; client facts rejected; shared fixtures pass. |
| 2. Structured client contract | `src/App.tsx`, `src/components/ConciergeAnswerView.tsx`, `lib/concierge-parser.ts`, pure local fallback | Stable-ID cards/actions, language/location, unavailable/partial states and cancellation work; server and browser modules remain separate. |
| 3. Semantic retrieval | `lib/concierge/{embeddings,vector-retrieval,ranking}.ts`, `execution/index_concierge.py`, versioned fixtures, configuration examples | Mocked API tests, deterministic fusion, dry-run manifest and corpus coverage checks pass. Provisioning commands are reviewable; no implicit cloud writes. |
| 4. Synthesis and evaluation | `lib/concierge/{synthesis,validation}.ts`, `execution/evaluate_concierge.py`, held-out query/label fixtures, benchmark report | Schema/grounding/fallback tests pass; authorized provider evaluation meets frozen release criteria. |
| 5. Controlled activation | Preview AI/Vectorize bindings, corpus sync, measured smoke tests, versioned runbook | Approved preview resources and spending, successful data reconciliation/index readiness, then separately authorized production deployment. |

Search `execution/` and existing corpus/export scripts before adding tools; keep
indexing/evaluation orchestration in deterministic scripts. Update affected ML
README, architecture, data contracts, evaluation and runbook in each behavior PR.
Maintain governance documentation only where its procedures change. Preserve
the existing transparent scorer version unless its own behavior changes.
Add immutable corpus, retrieval, prompt and response-schema versions. If
concierge events are instrumented, carry the actual pipeline version and preserve
historical scorer events; never silently reuse the old version for new exposures.

No D1 migration is presumed necessary for the initial fact adapter. New durable
field-level evidence storage or event fields, if required after schema mapping,
need an explicit additive contract/migration included in the implementation PR.
Generate and inspect migrations locally; do not apply them implicitly.

## Evaluation and release gates

- Build at least 120 independently labeled queries, split by intent family into
  development and untouched holdout sets (paraphrases stay in one split).
  Include Swedish, English, Swenglish, Polish, typos, exact names/branches,
  neighborhoods, negation, rare cuisines, absent dishes, unknown hours/prices,
  explicit dog constraints, nearby without coordinates, and prompt injection.
  Independent labels must be based on source facts, never the scorer's score.
- Compare current lexical, corrected lexical and hybrid on the same corpus:
  Recall@50, NDCG@5, exact-name success and unsupported-query abstention. Report
  results by language, cuisine, geography, type, chain status and metadata richness;
  include coverage, independent exposure and exposure concentration. No claim of
  user satisfaction without independent outcomes.
- Proposed promotion thresholds: at least 10% relative NDCG@5 improvement over
  corrected lexical on multilingual/typo holdout; no more than 0.02 absolute
  NDCG@5 loss on sufficiently sized slices; 100% exact-name fixture success;
  zero forbidden-venue or hard-constraint leaks and zero unsupported protected
  facts in the release test suite. Publish counts and uncertainty; expand tiny
  slices rather than pretending their estimates are reliable. These are targets,
  not results or guarantees against every future hallucination.
- Add meaningful regression tests for chain-only/no-match pools; bogus client
  datasets; baseline versus verified lifecycle; gold-standard coffee branches and
  restaurant false positives; current closure overriding stale vectors; unknown
  price versus default tier; invalid IDs, reordered/duplicated model results,
  fabricated citations, source-text instructions, provider timeout/429/malformed
  response, empty index, wrong dimensions and partial indexing.
- Proposed preview service targets: retrieval p95 <= 1 second and total p95 <=
  4 seconds, with a 5-second response deadline and bounded fallback. Measure
  cold/warm requests and location; do not describe these targets as current speed.
  Deadline races must not trigger repeated paid requests in the background.

## Cost and provider verification

At the documented BGE-M3 price of $0.012 per million input tokens, 3,245 documents
averaging 300 tokens would use 973,500 tokens, about $0.0117 in embedding model
usage before allowances. This is an illustrative token assumption, not a measured
invoice. [Cloudflare BGE-M3](https://developers.cloudflare.com/workers-ai/models/bge-m3/).

One vector per current local record uses 3,322,880 stored dimensions. Vectorize
currently includes five million stored dimensions on Free; query allowances,
other account usage and future evidence chunks must be counted separately.
[Vectorize pricing](https://developers.cloudflare.com/vectorize/platform/pricing/).

Estimate synthesis separately from measured input/output tokens, then add Workers,
D1 and Vectorize usage and account plan charges. Record model IDs and price date
with the benchmark; no flat per-query promise. Cloudflare's BGE-M3 usage example
and rendered parameter section currently differ, so verify the provider request/
response shape and actual 1,024-dimensional output in an authorized preview
smoke test before provisioning/promotion assumptions are treated as proven.

Relevant implementation references:

- [Vectorize metadata indexes and filtering](https://developers.cloudflare.com/vectorize/reference/metadata-filtering/)
- [Vectorize limits](https://developers.cloudflare.com/vectorize/platform/limits/) — at most 50 results when requesting metadata; 100 without metadata/values.
- [Workers AI JSON mode](https://developers.cloudflare.com/workers-ai/features/json-mode/)
- [Gemma model candidate](https://developers.cloudflare.com/workers-ai/models/gemma-3-12b-it/)

## Baseline and handoff

Reviewed on branch `main`, initially clean working tree. No cloud account state
or live D1 coverage was inspected; no paid inference, resources, data mutations,
migrations, deployments, commits or PRs were created.

- `.venv/bin/python -m pytest -q`: 60 passed, three existing warnings.
- `npm test`: 154 passed.
- `npm run build`: passed, including its typecheck and lint commands; existing
  large-bundle warning remains.
- Logs: `.tmp/rag-review/{pytest,npm-test,build}.log`.
- The chain-only fallback reproduction returns `Starbucks`; this is a confirmed
  defect despite the passing baseline tests.

Rollback after eventual activation: turn synthesis to template; if retrieval
fails guardrails, turn retrieval to the corrected lexical implementation. Keep
new hard gates and honest unknown handling active. Revert index alias/config to
the previously validated version when needed; never roll back to the known chain
fallback bug. Recheck current lifecycle at serving time throughout rollback.

Next step: approve stages 1–4 for local implementation and mocked validation.
Cloud provisioning, billable provider evaluation and production deployment remain
explicit activation steps with a concrete configuration, cost budget and rollback
review. The present deliverable is this plan and baseline review only.
