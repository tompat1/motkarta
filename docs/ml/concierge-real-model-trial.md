# Concierge real-model trial — 2026-09-07

The approved US$1 diagnostic trial is complete. All 3,143 eligible D1 records are
indexed and verified; 128 real semantic queries and 32 Gemma 4 responses were
captured. Strict synthesis validation accepted 23 responses; nine require the
existing template fallback. Public production and the lexical preview remain
lexical/template. No database mutation, deployment or plan upgrade occurred.

## Scope and lineage

- Index: `motkarta-concierge-preview-v1`, cosine, 1,024 dimensions.
- Embeddings: `@cf/baai/bge-m3`; constrained fact selection:
  `@cf/google/gemma-4-26b-a4b-it`.
- Refreshed D1 snapshot: 3,256 records; 3,143 eligible, 113 rejected. All eligible
  records pass the public map identity bridge and canonical fact/hash comparison.
- Documents come from `execution/export_concierge.mjs` using canonical D1 facts,
  retaining D1 IDs. Public presentation JSON is not the embedding corpus.
- Metadata filters `corpusVersion`, `eligible`, `area` were created before writes.
- Maximum 150,000 estimated corpus input tokens, 128 diagnostic query embeddings
  and searches, 32 synthesis calls with 500 maximum output tokens each.

`execution/run_concierge_trial.py` records every attempted model call before
network access, including failed calls, and refuses requests beyond its call and
conservative spending reserves. This is a local trial allowance, not a
Cloudflare billing cap or account-wide invoice. Venue embedding batches are
cached for safe resumption; raw query vectors and credentials are not persisted.
A changed diagnostic input cannot silently reuse an earlier capture under its ID.

## Reproduction

Refresh the catalog through the read-only audit workflow in
[the readiness record](concierge-catalog-readiness.md), then export canonical D1
facts. Supply the existing authenticated Cloudflare account/token through process
environment variables; never print or commit them.

```bash
node execution/export_concierge.mjs \
  .tmp/concierge-trial/audit/canonical-d1.json .tmp/concierge-trial/corpus.json
node execution/replay_concierge_trial.mjs prepare
.venv/bin/python -m execution.run_concierge_trial index \
  --input .tmp/concierge-trial/corpus.json --output .tmp/concierge-trial --apply
.venv/bin/python -m execution.run_concierge_trial queries \
  --input .tmp/concierge-trial/query-cases.json --output .tmp/concierge-trial --apply
node execution/replay_concierge_trial.mjs report
.venv/bin/python -m execution.run_concierge_trial synthesis \
  --input .tmp/concierge-trial/synthesis-cases.json --output .tmp/concierge-trial --apply
node execution/replay_concierge_trial.mjs report
```

Commands using `--apply` consume the already approved trial allowance. Retain the
same usage ledger across restarts; deleting it does not restore authorization or
spending allowance. Stop and inspect provider failures before further calls.
Do not rerun this paid trial after its scope is exhausted without new authority.

`replay_concierge_trial.mjs` makes no network calls. Its query prompts come from
the 128-case regression fixture, but it deliberately discards that fixture's
synthetic relevance IDs. Those IDs must never be treated as D1 relevance labels.
It checks catalog, case and version fingerprints, replays actual captured vector
matches through the production hydration helper, and uses the exact production
synthesis packet and validator. No placeholder query vectors are needed.

The report explores thresholds 0, 0.4, 0.5, 0.6 and 0.7; 0.5 is used solely to
select diagnostic synthesis packets. None is a calibrated serving threshold.
REST round-trip timings include local/network overhead and cannot establish
Workers binding latency. Compare them with the runtime's 1,200 ms embedding,
800 ms vector query and 2,000 ms synthesis deadlines without conflating them.

## Findings and limitations

Cloudflare's live catalog no longer lists the originally planned Gemma 3 model,
and [its model page](https://developers.cloudflare.com/workers-ai/models/gemma-3-12b-it/)
marks it deprecated on 2026-05-30. The trial substitutes the available
[Gemma 4 model](https://developers.cloudflare.com/workers-ai/models/gemma-4-26b-a4b-it/)
within the same call/output/budget caps. Listed prices are lower: US$0.10/M input
and US$0.30/M output tokens, compared with the original US$0.345/US$0.556 reserves.
The higher original cost reserves remain in the ledger. No Gemma 3 call was made.

The adapter accepts Gemma 4's single completed chat response, rejects truncation,
refusals and tool calls, then applies the existing strict fact-ID validation.
Thinking is disabled for this bounded selection task. No arbitrary generated
prose reaches cards and place order remains server-controlled.

The real metadata-list API returns `String` and `Bool` enum values, whereas CLI
creation flags use `string` and `boolean`. The index configuration checker now
accepts the actual REST enums and still rejects wrong filter types. Real embedding
batches and raw NDJSON upserts succeeded for all 3,143 records. The live
`get_by_ids` limit is 20; verification now respects it, with a read-only `verify`
phase that resumes without repeating embeddings or upserts. Run it with
`--input .tmp/concierge-trial/corpus.json --output .tmp/concierge-trial --apply`. Full hash/count
verification passed at `2026-09-07T07:31:43Z`. A fresh D1 read at 07:35 UTC
confirmed all indexed documents were unchanged.

The current corpus contains one Polish-tagged venue (85 Kvadrat, D1 ID 1574),
but no explicit pierogi facts and no cozy/intimate attributes. It contains ramen
and specialty-coffee facts. Embeddings cannot establish missing dish or atmosphere
claims; the source-fact gates must continue to abstain where evidence is absent.

This diagnostic run has no independently reviewed real-catalog relevance labels
or untouched holdout. Candidate changes and valid fact selections are measurable;
NDCG, recall improvement, satisfaction and universal multilingual accuracy are
not established by these captures. No public AI activation follows automatically.

## Measured results

| Measure | Result |
| --- | ---: |
| Index records verified by ID, hash and count | 3,143 / 3,143 |
| Venue embedding calls | 197 batches |
| Estimated venue input tokens | 114,962 |
| Successful real query captures | 128 / 128 |
| Successful synthesis API responses | 32 / 32 |
| Synthesis outputs accepted by the fact-ID validator | 23 / 32 |
| Accepted synthesis outputs also within 2 seconds | 22 / 32 |

Nine synthesis outputs were rejected: seven contained an empty fact selection
for at least one card, one inserted extra objects into the result list, and one
was truncated at the output limit. The validator was not weakened to accept
these. Invalid model output retains deterministic cards and template text. Valid
citations establish source grounding, not that a recommendation fits the query.

| REST timing | Median | 95th percentile |
| --- | ---: | ---: |
| Query embedding | 262 ms | 615 ms |
| Vector search | 440 ms | 590 ms |
| Embedding plus vector search | 713 ms | 1,090 ms |
| Constrained synthesis | 1,239 ms | 4,106 ms |

127/128 embeddings were within 1,200 ms, all vector queries within 800 ms, and
30/32 synthesis requests within 2 seconds. These are sequential local REST
measurements, not end-to-end Workers/D1/HTTP binding benchmarks; the runtime's
shared deadline can cause additional fallback.

| Exploratory threshold | Queries with admitted semantic candidates | Changed top three | Previously empty lexical results gaining cards |
| --- | ---: | ---: | ---: |
| 0.0 | 66 | 55 | 9 |
| 0.4 | 61 | 50 | 7 |
| 0.5 | 48 | 35 | 2 |
| 0.6 | 14 | 10 | 0 |
| 0.7 | 1 | 1 | 0 |

At 0.5, the two newly answered queries were `Tbilisi in Södermalm` and
`cozy place to unwind`. Their candidates lack the requested geographic/name or
atmosphere support, so these are review findings, not demonstrated recall wins.
For the atmosphere request, Gemma selected no facts and the synthesis validator
rejected it. Similarity alone cannot supply missing evidence.

English and Swedish Polish-food prompts retrieved 85 Kvadrat with similarities
around 0.50–0.60 and passed the current cuisine gate. The illustrative 0.70
threshold would reject these valid candidates. The corrected lexical baseline
already finds this venue too; this is integration evidence, not a new accuracy
claim. Pierogi requests still abstain because no dish facts support them.

## Spending and artifacts

The persistent model-cost reserve is **US$0.050299** for all 197 venue embedding,
128 query embedding and 32 synthesis calls. It deliberately overestimates token
use and retains the original, higher Gemma 3 unit prices. Gemma 4 reported 14,448
prompt tokens and 1,980 completion tokens, approximately US$0.002039 at its listed
rates before allowances. The reserve is not an account invoice or provider cap.

The published [Vectorize pricing formula](https://developers.cloudflare.com/vectorize/platform/pricing/)
puts 3,143 stored 1,024-dimension vectors and 128 similarity queries at about
US$0.0351 for a full month before allowances, excluding additional verification
reads. The remaining US$0.50 non-model reserve covers this small diagnostic
workload. No account-wide free allowance or final billed amount is asserted.
The 128-query and 32-synthesis allowances are exhausted even though the dollar
budget has headroom; another paid diagnostic run needs a new scoped allowance.

Artifacts under `.tmp/concierge-trial/` include the usage ledger, verified index
manifest, original/current D1 snapshots, canonical corpus, capture fingerprints,
128 query results, 32 synthesis results, rendered responses, and `report.json`.
The canonical catalog SHA-256 is
`86923991d11f0cd10f0437cd449576f9a8efb99a0ae0d22b828e9dc376f13a9c`.
Keep the ledger and manifests for any authorized resumption; do not reset quotas
by deleting them. Run only one trial process against this ledger at a time.

## Validation and next step

Shared hydration helpers preserve retrieval behavior (`concierge-hybrid-v2`).
Synthesis is now `concierge-synthesis-v2` for Gemma 4 and its chat-completion
envelope. Tests cover live/offline parity, citation and completion rejection,
REST enum handling, 20-ID verification batches and safe capture resumption.
All 206 JavaScript tests and 77 Python tests pass; the production build passes.
The exact Cloudflare Node 22.16 test/build check is recorded with the local logs.
Existing bundle-size and Python platform/deprecation warnings remain.

Next work is local schema/prompt hardening for the nine rejected selections,
independently reviewed D1 relevance labels, and verified dish/atmosphere source
enrichment. Re-test a fixed threshold and synthesis contract on a fresh holdout
before public activation. Do not promote this index or infer an accuracy gain
from the changed rankings. Template synthesis and corrected lexical retrieval
remain the deployed fallback modes.
