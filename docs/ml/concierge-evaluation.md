# Concierge local evaluation — 2026-09-05

Stages 1–4 are implemented locally. This record is not approval to enable cloud
AI. All provider integration tests used mocks. No paid inference or production
traffic was used.

## Reproducible comparison

Baseline commit: `296320dc209ad1042f6eeee3cc8579f6a8786810`.
Fixture version: `concierge-query-fixtures-v1`.
Catalog: `tests/fixtures/concierge/places.json` (20 synthetic venues).
Queries: `tests/fixtures/concierge/queries.json` (128 queries, 32 intent families).
Labels are manually authored against fixture facts and independent of scorer
outputs. They are not collected human preferences or satisfaction outcomes.

The baseline runner preserves the old algorithm and expands only its result
limit from 3 to 50 for candidate comparison. Corrected lexical uses the new
constraints and fact contract. The comparison therefore includes deliberate
policy corrections, not just improvements to token similarity.

| Metric | Historical lexical | Corrected lexical |
| --- | ---: | ---: |
| Recall@50, 84 answerable queries | 0.810 | 0.929 |
| NDCG@5, 84 answerable queries | 0.750 | 0.929 |
| Abstention, 44 unsupported queries | 0% | 100% |
| Exact-name top-result success, 12 queries | 33.3% | 100% |
| Catalog coverage | 85% | 75% |
| Exposure Gini (all 20 fixture venues) | 0.569 | 0.434 |

Coverage falls partly because closed/out-of-scope entries no longer receive
exposure. Exposure metrics are descriptive and do not prove fairness. Independent
status alone is insufficient to detect closed/out-of-scope leaks; eligibility
regression tests separately cover those cases. A perfect fixture abstention result
is not a universal guarantee. Six answerable queries still have no relevant hit.
The synthetic corpus and small slices limit conclusions about production behavior.

The initial 88-query development comparison improved NDCG@5 from 0.741 to 0.946.
The first 40-query holdout comparison improved from 0.769 to 0.893 but had one
unsupported-query false positive. Inspection identified an excluded-chain query
matching an unrelated partial venue name. That case was converted into a safety
regression and fixed. Consequently the final table above is a **regression-set
comparison**, not an untouched holdout result. A separate real-catalog regression
also caught `&food` intercepting general cuisine requests; generic words no longer
establish distinctive exact-name intent.

A fresh holdout and independently reviewed real venue relevance labels are
required before model calibration or production promotion. Thresholds must be
fixed before evaluating that holdout. No claim is made about satisfaction.

## What was not measured

- Real BGE-M3 multilingual/typo retrieval improvement.
- Live Gemma inference quality, refusal/schema rates or latency.
- Cloudflare cold/warm CPU time, total latency, rate-gate behavior or cost.
- Live D1 catalog coverage/identity parity with the public snapshot.
- Any personalized recommendation or behavioral-learning outcome.

The evaluation runner reports `semanticMeasured: false` and omits hybrid quality
metrics unless supplied with authorized captured semantic results. A mock semantic
hit demonstrates that the pipeline can admit a relevant candidate absent from
lexical search, but cannot establish model accuracy.

## Validation and artifacts

- JavaScript suite: 178 tests pass (including provider, HTTP, source-fact and
  exclusion regressions).
- Python suite: 69 tests pass; existing dependency/platform warnings remain.
- Typecheck, lint and production build pass. Existing Vite large-bundle warning
  remains; client JavaScript is about 710 kB before gzip.
- Browser checks: Swedish cards and unknown fields, structured request without
  a venue corpus, missing-location clarification and search refinement, consented coordinates and
  computed distances, and desktop/mobile rendering.
- Index dry-run: 3,180 of 3,245 public records admitted, 65 rejected; estimated
  205,134 embedding input tokens for changed documents; 3,256,320 stored dimensions.
  This is an estimate from text length, not tokenizer usage or an invoice.

Local full reports/logs/screenshots are under `.tmp/rag-review/`, including
`evaluation-final.json`, `index-plan-final.json`, `final-node.log`,
`final-python.log`, `final-build-v2.log`, `concierge-desktop.png` and
`concierge-mobile.png`. These are regenerable intermediates. The commands and
fixtures remain in the repository.

```bash
python3 execution/evaluate_concierge.py \
  --baseline-revision 296320dc209ad1042f6eeee3cc8579f6a8786810 \
  --split all --output .tmp/rag-review/evaluation-final.json
python3 execution/index_concierge.py \
  --index motkarta-concierge-preview-v1 \
  --output .tmp/rag-review/index-plan-final.json
```

For a future authorized semantic capture, provide `--semantic-results FILE` with:

```json
{
  "corpusHash": "SHA-256 of the exact catalog file",
  "model": "@cf/baai/bge-m3",
  "threshold": 0.7,
  "results": {
    "query-fixture-id": [
      {"id": "1", "score": 0.9, "metadata": {
        "corpusVersion": "concierge-facts-v1",
        "documentHash": "SHA-256 from the canonical exporter"
      }}
    ]
  }
}
```

The numeric values above illustrate the schema, not approved thresholds or
measured similarities. Captures must include every evaluated query and must not
be manufactured from the relevance labels. Missing IDs/version/hash mismatches
are rejected or excluded by the same runtime validation used in serving.
