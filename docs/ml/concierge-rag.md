# Concierge RAG: local implementation

The subsequent [live catalog audit](concierge-catalog-readiness.md) found zero
shared numeric IDs between D1 and the public map, differing fact hashes and
unreconciled closure/location data. Reconcile those before preview activation;
use the audit's D1-normalized export for the next index dry run.

Stages 1–4 were approved for local implementation and testing on 2026-09-05.
The Cloudflare integrations are implemented behind disabled flags. No index,
paid inference, migration or deployment has been performed. The release gates
in the [implementation plan](rag-implementation-plan.md) still apply to activation.

## Runtime authority

`functions/api/concierge.ts` is the production Pages API. Pure, browser-safe
retrieval, facts, intent, gates and response rendering live in `lib/concierge/`.
The client no longer imports the server endpoint or sends its place collection.
D1 is the trusted server catalog. Its coverage and stable IDs must be reconciled
with the public export before deployment; local tests do not establish live D1
coverage. Missing D1 returns a typed 503 with no recommendations.

`motkarta/concierge.py` and `scripts/api_endpoint.py` are conservative offline
lexical adapters. They no longer enable Gemini automatically when an environment
key is present or use synthetic/anomaly-enriched payloads as facts. Their lexical
ranking intentionally differs from TypeScript; shared exclusions, geography and
unknown-value policies apply. Python does not evaluate live hours, nearby queries,
price limits or hidden-gem intent; it abstains on these unsupported requests.

## Data and grounding

`ConciergePlace` adds source facts, evidence records, source URLs, chain status
and nullable `sourcePriceLevel` to the existing scorer input. The global scorer
still receives its compatibility price default; concierge does not use that
number as a source price. D1 evidence URLs and capture times survive hydration.
A source record is not proof that every venue attribute has been verified.

`SourceFact` carries a stable fact ID and place ID, field/value, named source,
optional URL/license/capture time, and field-specific verification information.
Only explicit, valid verification dates can retain verified status. The response
never synthesizes a venue-wide last-verification date from scoring freshness.
Unknown prices, hours and verification dates remain unknown in Swedish and English.
URLs allow only HTTP(S) without embedded credentials. Markdown/control characters
are removed from values used by the legacy text renderer.

Embedding documents contain name, kind, area, address, cuisine, listed tags and
allowlisted source facts. Notes, generic evidence summaries, quality/popularity
scores, commercial platform signals, engagement, residuals, anomalies and invented
praise are excluded. Source evidence record links remain available in response
citations without making their summaries embedding features. One vector represents
one venue. Canonical IDs must be unique in every index input.

`lib/concierge/policy.json` shares exclusion/locality/coffee-brand vocabularies
with the Python RAG adapter. Localities are derived from the existing Stockholm
source-boundary policy. RAG admission is deliberately stricter than the importer's
coordinate-only fallback: it requires locality evidence and rejects explicit
outside-municipality addresses/URLs. Baseline and legacy active records may be
listed; only candidate/closed/invalid records are rejected. A baseline record is
never called verified solely because it can be listed.

## Retrieval and constraints

The lexical retriever uses normalized token/alias overlap, conservative one-edit
typo matching and deterministic tie-breaks. It is not BM25 or a trained model.
Existing cuisine aliases remain for compatibility; they are not a promise of
complete language support. Distinctive full venue names constrain exact-name
lookup; generic venue names such as `&food` cannot capture generic cuisine queries.

Explicit dishes require listed dish/tag/cuisine evidence for that dish, not just
a related cuisine. Exclusions, requested district, restaurant/bakery intent,
specialty eligibility, hidden-gem gates, dog attributes, price and transit evidence
are checked before candidates are admitted. Near-me queries require consented
coordinates and use great-circle distance (default 3 km, explicit radius <=25 km).
Missing coordinates produce clarification. The frontend waits for a requested
position before sending a near-me query. Open-now requests currently abstain
because no live hours evaluator exists. Unsupported constraints are not silently
relaxed. An explicitly requested excluded chain also abstains; partial name matches
cannot substitute an unrelated business.

Hybrid mode embeds the query with BGE-M3 and queries up to 50 metadata-bearing
Vectorize matches. It requires a configured, calibrated minimum cosine similarity;
there is intentionally no guessed production default. Vectors must contain 1,024
finite values and a nonzero norm. Current corpus version and SHA-256 document
hash must match freshly hydrated D1 facts. Unknown IDs, duplicates, stale documents,
invalid scores and current exclusions are rejected. Metadata filters include
corpus version, eligibility and a requested normalized area. Final constraints run
again regardless of index metadata. The v1 vector budget is one 50-result query;
if post-filtering exhausts it, lexical fallback/clarification applies rather than
unbounded retry or relaxation. Candidate-budget expansion is deferred pending
preview recall and cost measurements.

Candidates merge by ID using equal-weight reciprocal-rank fusion with constant 60.
Exact names precede fused relevance, then the unchanged production recommendation
score, then stable ID. The result response includes three cards. Retrieval mode
and version describe the actual path, including fallback to lexical when vectors
are unavailable or no current semantic matches survive.

## Constrained synthesis

The initial Gemma adapter generates a JSON selection of 1–3 supplied fact IDs per
fixed result. Its role is query-sensitive explanation selection. The server
renders the selected facts with localized connective text. Arbitrary generated
prose is intentionally not accepted: schema-valid citations do not prove factual
entailment. This is narrower than free-form conversational RAG.

The validator rejects added keys, invented fact IDs, duplicate IDs, added/missing
venues and order changes. Protected fields—hours, prices, dates, addresses, links
and hidden-gem labels—come only from server facts/gates. Model output has no action
or tool authority. Explicit anchored user action commands retain their separate
structured `action` field and legacy text marker. Query/source instructions never
become an action through generation. Failure or invalid JSON preserves the
original deterministic result cards.

## API and client contract

POST accepts only `query` (1–1000 characters), `language` (`sv`/`en`), optional
`location` with finite latitude/longitude, and optional positive `radiusKm` <=25.
Bodies are bounded to 8 KiB, including streamed requests. Unknown keys—including
`places`—are rejected. Cross-origin browser requests are rejected. GET remains
lexical/template regardless of AI flags. Responses are `no-store`.

The additive response includes `cards`, `intro`, `status`, `action`, schema/corpus/
model/prompt versions, actual retrieval/synthesis modes and minimized diagnostics.
Legacy `answer`, `recommendedPlaces`, `source`, `totalSearchSpace` and
`structuredFilters` remain. `partial` is reserved by the schema; v1 uses
`ok`, `clarification` or `unavailable` and never labels a partial match as exact.
The legacy filter extractor remains a compatibility field; `parseIntent` is the
constraint authority and preserves negation that the legacy summary cannot express.

The UI uses structured IDs for cards/map actions and displays source links. If a
server ID is absent from the browser's dataset, the map button is disabled rather
than guessing another branch by name. New requests abort old ones and stale
responses cannot replace the current answer. Only Vite development can fall back
to the published static snapshot, never the augmented user-submission collection.
Production failures are visible. Legacy parser defaults no longer invent verified
hours, medium prices or recent verification.

## Versions and telemetry

| Concern | Version |
| --- | --- |
| Response | `concierge-response-v1` |
| Corpus | `concierge-facts-v1` |
| Corrected lexical | `concierge-lexical-v1` |
| Hybrid ranking | `concierge-hybrid-v1` |
| Synthesis prompt | `concierge-synthesis-v1` |
| Python offline ranking | `concierge-python-lexical-v1` |
| Global scorer (unchanged) | `transparent-scorer-v1.1` |

No recommendation-event schema or learning behavior changes. Existing shadow
telemetry remains unchanged; response diagnostics contain counts, timings, versions,
controlled fallback reasons and each selected ID's exact-match flag, lexical score,
component ranks, fusion score and recommendation score. These explain the
deterministic ordering without exposing model reasoning. Query text is transient request/response data;
it is not newly persisted. Existing browser-local concierge history remains a
separate pre-existing feature. No query embeddings, precise coordinates, IPs or
stable query hashes are stored by this feature. The rate-gate key is passed only
to the configured limiter. Concierge-specific impression attribution remains a
separate follow-up; do not label hybrid exposures as the old scorer version.

## Local operations and activation

Defaults in `wrangler.toml` are `CONCIERGE_RETRIEVAL_MODE=lexical` and
`CONCIERGE_SYNTHESIS_MODE=template`. Activation additionally needs AI/Vectorize
bindings, a calibrated `CONCIERGE_MIN_SIMILARITY`, and a rate-gate binding exposing
`limit({key}) -> {success}`. Without a working rate gate, POST stays deterministic.
The limiter must be provided through a supported deployment binding (for example
an RPC service); this change does not provision one or assume Pages supports every
Worker-only binding type. A per-client limiter is not an account-wide budget cap.
Before public activation, configure global spending/abuse controls and validate
CPU, wall-time, rate-gate and binding behavior in preview.

A reviewed preview configuration would add:

```toml
[ai]
binding = "AI"

[[vectorize]]
binding = "CONCIERGE_INDEX"
index_name = "motkarta-concierge-preview-v1"
```

These are examples, not applied configuration. Do not activate hybrid or constrained
synthesis until preview resource, spending and quality approval is in place.
Runtime remote stages have bounded waits and no automatic retries. The post-body
processing deadline is 4.5 seconds; D1 is bounded at 1.2 seconds, embedding at 1.2,
vector query at 0.8 and synthesis at 2 seconds within the remaining deadline.
Workers binding calls cannot necessarily be cancelled remotely; timeout does not
promise cancellation of an already billed call, but no new stage continues from
its late result. Browser network timeout is six seconds; initial location permission
may take up to ten additional seconds. These are configured bounds, not measured
Cloudflare latency/CPU guarantees.

Dry-run the canonical fact exporter/index plan without credentials:

```bash
python3 execution/index_concierge.py \
  --input public/data/places.json \
  --index motkarta-concierge-preview-v1 \
  --output .tmp/concierge/index-plan.json
```

The public snapshot is useful for dry-run auditing. An activated index must be
built from the same normalized canonical records D1 serves; different defaults,
attributes or IDs will fail document-hash hydration. `export_concierge.mjs` uses
the runtime fact/gate implementation so hashes are byte-identical.

Before any later `--apply`, create an isolated 1,024-dimensional cosine index and
metadata indexes for `corpusVersion` (string), `eligible` (boolean) and `area`
(string). Apply requires `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN` and an
explicit `--max-input-tokens` estimate budget. Review the estimate, source snapshot
and destination first. The estimate is not tokenizer-exact or a billing hard cap.
New embedding model/dimensions/corpus versions require a new index/manifest.

A verified previous manifest supports incremental upserts and deletions. Upserts
are batched at 16 embedding inputs; changed/deleted IDs are reconciled, unchanged
hashes skip embedding, HTTP retries are bounded, and all expected hashes, deleted
IDs and total vector count are checked before a manifest becomes `verified`.
A failed/partial sync leaves the old manifest intact and does not promote anything.
A separate preview query smoke test is still mandatory: get-by-ID readiness alone
does not establish nearest-neighbor recall or metadata-index behavior. Extra vectors
from an untracked initial index prevent successful verification; use a fresh index.
The script never creates resources, deploys or promotes an index.

## Evaluation and rollback

See the [evaluation record](concierge-evaluation.md) and run:

```bash
python3 execution/evaluate_concierge.py \
  --baseline-revision 296320dc209ad1042f6eeee3cc8579f6a8786810 \
  --split development --output .tmp/concierge/evaluation.json
```

The 128-query synthetic source-labeled suite is grouped by intent family. Labels
are independent of ranking scores, but not independently collected human judgments.
The original holdout was examined during safety debugging; treat it as regression
coverage now and collect a fresh untouched holdout before production promotion.
The runner reports legacy/corrected lexical metrics, slice counts, exposure and
coverage. It never calls a provider. `--semantic-results` can evaluate previously
authorized captures with model, corpus hash, threshold and per-query matches;
without them, hybrid quality remains explicitly unmeasured. Mock integration tests
prove control flow and guardrails, not multilingual model quality.

Rollback synthesis to template first; rollback hybrid to corrected lexical if
retrieval guardrails fail. Keep the new trust boundary, exclusions and honest
unknowns active. Never roll back to the known chain fallback bug. The prior vector
index may be rebound only after the same current-record hydration checks.
