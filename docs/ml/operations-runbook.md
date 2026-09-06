# ML operations runbook

The [2026-09-06 catalog repair record](concierge-reconciliation.md) documents
applied D1 repairs, guarded rollback and the validated local identity bridge.
Use its repaired D1 snapshot workflow for the next index plan; no AI activation
or code deployment was performed with the data repair.

For concierge preview preparation, first follow the
[live catalog audit](concierge-catalog-readiness.md). It exports D1 through query
mode, checks identity/current fact hashes and creates a canonical index dry-run
input without applying database changes.

## Scope

This runbook covers environment setup, residual-model execution, evaluation,
schema migration, validation, release and rollback. It does not authorize paid
API usage, production data writes or deployment without the relevant task scope.

## Environment setup

From the repository root:

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements-python.txt
npm ci
```

The repository expects Node 22.13 or later and the Python dependencies declared
in `requirements-python.txt`.

If the managed environment injects an unwritable `NPM_CONFIG_CACHE`, use the
repository-local `.npmrc` cache by unsetting only that variable for the command:

```bash
env -u NPM_CONFIG_CACHE npm ci
```

Do not change global `HOME` or system-level npm configuration.

## Baseline validation

Before changing ML code:

```bash
.venv/bin/python -m pytest -q
npm test
npm run typecheck
```

Record pre-existing failures. Do not claim a regression was introduced or fixed
without comparing to baseline.

## Preparing residual-model input

Create an enriched CSV with the required columns documented in
[data contracts](data-contracts.md). Preserve identity and provenance columns.

Minimum header:

```text
name,platform_rating,review_count,price_level,latitude,longitude,category,cuisine,district,chain_status
```

Before training, check:

- Duplicate venue identities
- Stockholm municipality boundary compliance for every curated, scraped and
  candidate-review source row
- Rating range and missing target values
- Negative review counts
- Coordinate validity
- Cuisine/category normalization
- Chain-status vocabulary
- Capture dates and source terms
- Commercial-data quarantine destination

Tasstipset and other country-wide directories may be crawled as acquisition
inputs, but only records passing
`motkarta.stockholm_boundary.is_stockholm_municipality_place` may enter
`public/data/places.json`, the lifecycle candidate queue, model training inputs
or the RAG concierge corpus.

Never commit raw licensed or personal datasets unless their license and repository
policy explicitly permit it.

## Running the residual model

```bash
.venv/bin/python scripts/model_discovery.py \
  enriched_stockholm_places.csv \
  --output data/stockholm_discovery_scores.csv \
  --max-folds 5 \
  --interval-coverage 0.9
```

Expected console output includes model version, validation strategy, MAE and RMSE.

Expected CSV fields are listed in [data contracts](data-contracts.md).

## Post-run checks

Reject or investigate the run if:

- Any row lacks a fold, model version or OOF prediction.
- Predictions are clipped to 1–5; only clipped values are available for validation.
- The validation strategy unexpectedly uses shuffled fallback.
- MAE/RMSE changes materially without an explained data or model change.
- One district/cuisine dominates top candidates.
- Confidence appears high while error radii are implausibly narrow.
- Candidate reasons omit evidence gaps.
- Platform fields appear in intrinsic quality/evidence exports.

Manually inspect samples from:

- Highest positive residuals
- Most negative residuals
- Widest error bands
- Each cuisine and district slice
- New/low-review venues
- Chains and unknown chain status

## Running ranking evaluation

Place the scored CSV at the path expected by the script or adjust the invocation
through a reviewed code change:

```bash
PYTHONPATH=. .venv/bin/python scripts/evaluate_ranking_experiment.py
```

If no independent outcome column exists, `hypothesis_confirmed` must be null.
Representation metrics remain descriptive, not proof of satisfaction.

## Structural anomaly operation

`process_motkarta_gems()` runs inside the pipeline. Treat its flagged rows as a
review/data-quality queue. Appropriate actions include:

- Confirm unusually rich or sparse OSM tagging.
- Check duplicates or coordinate errors.
- Investigate a distinctive venue format.
- Request missing evidence.

Never convert `is_structural_anomaly` into `is_hidden_gem`.

## Database migration

The event schema is introduced by:

```text
drizzle/0007_pale_mikhail_rasputin.sql
```

Event collection controls are introduced by:

```text
drizzle/0009_breezy_tomas.sql
```

For new schema changes:

```bash
npm run db:generate
npm test
npm run typecheck
```

Inspect generated SQL and snapshot changes. Do not apply a production D1
migration merely because it was generated; production writes require explicit
deployment scope and a rollback/backup plan.

Current shadow-mode event collection decisions:

- Position indexing convention: zero-based.
- Impression visibility rule: rendered result rows count as impressions.
- Recommendation-mode vocabulary: `search`, `map`, `list`, `concierge`,
  `nearby`, `saved`, `curated`, `hidden_gems`.
- Session identifier: browser session storage.
- Anonymous identifier rotation: 30 days.
- Retention: default 180 days; endpoint configuration is bounded to 7-365 days.
- Deduplication: `idempotency_key` plus `INSERT OR IGNORE`; impression keys
  include a per-result-set identity and a hash of the complete structured
  context so returning to a previous filter records a distinct exposure.
- Query context: controlled structured buckets only; raw query text and display
  labels under allowlisted keys are rejected.

Outcome attribution window and deletion automation remain future decisions before
any behavioral training dataset is built.

## Shadow event collection operation

Frontend instrumentation posts batches to:

```text
POST /api/recommendation-events
```

The endpoint validates controlled vocabularies, privacy-minimized query context,
model version, zero-based impression positions, idempotency keys and retention
window. Query-context values must match their controlled domains; new or
uncategorized cuisines are bucketed as `other` by frontend instrumentation. The
endpoint also rejects cross-origin browser writes unless the origin is the
request origin or appears in `RECOMMENDATION_EVENT_ALLOWED_ORIGINS`, can require
`RECOMMENDATION_EVENT_INGESTION_TOKEN`, and applies an in-memory per-client
write quota controlled by `RECOMMENDATION_EVENT_RATE_LIMIT_PER_MINUTE`. Without
a D1 binding it returns `source: shadow` and does not persist.

Admin-only data-quality reporting is available at:

```text
GET /api/recommendation-events
```

The report summarizes event counts, event/mode distributions, missing impression
positions, missing idempotency keys, missing receipt/schema/privacy/retention
metadata, expired rows and whether the shadow dataset is structurally ready for
deeper analysis. `qualityReady` does not authorize ranker training by itself.

## Full release validation

```bash
.venv/bin/python -m pytest -q
npm test
npm run typecheck
npm run build
git diff --check
```

Expected state for the documented implementation:

- Python tests pass.
- JavaScript tests pass.
- Typecheck passes.
- Production build passes.
- A Vite large-chunk warning may remain; it is not an ML failure but should be tracked separately.

## Model version changes

Bump `MODEL_VERSION` in `scripts/model_discovery.py` when any of these change:

- Target definition
- Feature list or normalization
- Imputation/encoding
- Spatial grouping/fold construction
- Estimator or hyperparameters
- Residual interval calculation
- Confidence transform
- Output semantics

Update the model card, docs, tests and any downstream allowlist together.

## Rollback

### Offline model

Rollback means regenerating candidates with the prior code/data/model version and
restoring the prior output snapshot. Never relabel new predictions with an old version.

### Ranking policy

Keep the previous deterministic weights/version available. If guardrails fail,
restore the previous scorer/ranker configuration and retain failed-version events
for diagnosis.

### Event collection

If malformed or privacy-sensitive events are detected:

1. Disable ingestion.
2. Preserve only the minimum evidence needed to diagnose safely.
3. Identify affected interval/model/schema version.
4. Quarantine invalid events from training.
5. Apply retention/deletion requirements.
6. Add a regression test and update this runbook.

## Troubleshooting

| Symptom | Likely cause | Action |
| --- | --- | --- |
| `Missing required discovery-model columns` | Input contract drift | Fix upstream export; do not silently default target/features |
| Fewer than four rows | Filter too narrow/test fixture too small | Expand cohort or use a non-ML path |
| Shuffled-fold fallback | All rows mapped to one approximate cell | Verify coordinates and cohort; document if intentional |
| Unknown categorical values | New cuisine/category vocabulary | Encoder tolerates them at prediction, but normalize and review coverage |
| Narrow intervals and excellent error | Leakage or duplicate venues | Recheck entity resolution, folds and future-derived features |
| Many anomalies | Changed OSM completeness/distribution | Treat as data drift; never increase hidden-gem promotion |
| `hypothesis_confirmed: null` | No independent outcomes | Correct behavior; collect/attach valid labels |
| Concierge returns ungrounded text | Retrieval/context or prompt regression | Stop release, inspect source packet and grounding tests |
| `drizzle-kit: not found` | Node dependencies absent | Run `npm ci` in the repo |

## Operational artifacts not yet implemented

Future work should add:

- Durable JSON run manifest
- Serialized model artifact and checksum
- Feature/slice report
- Candidate review report
- Drift comparison against prior run
- Event-quality dashboard
- Model registry or immutable artifact storage

## Concierge RAG operations (2026-09-05)

The [Concierge runbook](concierge-rag.md#local-operations-and-activation) documents
disabled flags, canonical corpus export, dry-run indexing, explicit apply budgets,
metadata-index prerequisites, verified manifests, timeouts and rollback.
AI/index/rate-gate resources and live D1 coverage have not been validated.
Ordinary tests use mocks and need no provider credentials. Never run indexing
`--apply` or enable AI flags as part of routine validation.
