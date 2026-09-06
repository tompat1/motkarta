# ML recommendation system directive

## Goal

Safely build, evaluate and maintain Motkarta's scoring, underexposure research,
structural anomaly detection, recommendation telemetry and future personalized
ranking without recreating commercial popularity or exposure bias.

## Mandatory reading order

Before any ML/ranking change, read:

1. [`docs/ml/README.md`](../docs/ml/README.md)
2. [`docs/ml/architecture.md`](../docs/ml/architecture.md)
3. [`docs/ml/data-contracts.md`](../docs/ml/data-contracts.md)
4. [`docs/ml/training-and-evaluation.md`](../docs/ml/training-and-evaluation.md)
5. [`docs/ml/operations-runbook.md`](../docs/ml/operations-runbook.md)
6. [`docs/ml/maintenance-and-change-policy.md`](../docs/ml/maintenance-and-change-policy.md)
7. The relevant model card and current implementation/tests

For Specialty Coffee data or labels, also read
[`specialty_coffee_gold_standard.md`](specialty_coffee_gold_standard.md).

## Trigger

Use this directive for requests involving:

- Machine learning or model training
- Recommendation ranking or personalization
- Discovery/quality/popularity/relevance score changes
- Hidden-gem logic
- Residual or underexposure analysis
- Isolation Forest/anomaly logic
- Recommendation events, impressions or outcomes
- Ranking experiments, metrics, A/B tests or drift
- Concierge candidate retrieval when it changes ranking semantics

## Step 1: classify the subsystem

Identify exactly one primary owner:

| Subsystem | Owner |
| --- | --- |
| OSM additive discovery | `motkarta/pipeline.py` |
| Production multi-signal scoring | `lib/scoring.ts` |
| Python scoring workflow | `motkarta/scoring.py` |
| Residual underexposure research | `scripts/model_discovery.py` |
| Structural anomaly review | `motkarta/outliers.py` |
| Hidden-gem gates | `lib/scoring.ts` plus admin lifecycle |
| Ranking evaluation | `motkarta/evaluation.py` |
| Event schema | `db/schema.ts` and Drizzle migrations |
| Concierge retrieval/synthesis | `motkarta/concierge.py`, `motkarta/rag.py`, `scripts/api_endpoint.py` |

If the request spans multiple subsystems, state each boundary and update all
affected contracts. Never assume fields with the same name have the same meaning.

## Step 2: establish baseline

Inspect repository instructions and current code. Run:

```bash
.venv/bin/python -m pytest -q
npm test
npm run typecheck
```

If dependencies are missing, follow the operations runbook. Record pre-existing
failures before editing.

## Step 3: protect data boundaries

Classify every input as neutral fact, structural open data, independent evidence,
Motkarta engagement, commercial audit data, computed score, model output or
human/admin label.

Block any design that:

- Adds commercial platform signals to quality/evidence scoring.
- Uses unexposed items as hard negatives.
- Stores raw personal identifiers or unrestricted query text without review.
- Mixes duplicate-resolution actions into preference/quality labels.
- Uses future-derived features.

## Step 4: choose the correct method

### Deterministic scoring change

Use for explicit product policy. Keep formula explainable. Update TypeScript and
Python implementations when parity is intended. Add boundary and regression tests.

### Residual-model change

Keep platform inputs quarantined. Use out-of-fold or untouched-holdout
predictions. Preserve spatial/temporal leakage protection. Bump model version for
behavior changes. Update model card and slice evaluation.

### Structural anomaly change

Treat output as data/review assistance. Never set hidden-gem status. Document
feature proxies and likely OSM contributor bias.

### Behavioral ranker change

Require validated impression and result-position data. Use chronological splits,
document targets and attribution, and evaluate exposure/diversity guardrails.
Do not begin because the event table merely exists.

### LLM/Concierge change

Keep retrieval grounded and deterministic enough to audit. The LLM synthesizes
from retrieved facts; it cannot invent features or override lifecycle/evidence gates.

## Step 5: implement with versioning

Use immutable versions for model/ranking behavior. Store versions with predictions
and recommendation events. Preserve compatibility aliases until a documented
migration removes them.

For schema changes:

```bash
npm run db:generate
```

Inspect generated SQL before any application. Production migration/deployment
requires explicit authority.

## Step 6: evaluate honestly

Minimum evaluation:

- Relevant predictive error/ranking metrics
- Cuisine, geography, venue type and chain-status slices
- Long-tail/catalog coverage
- Independent venue exposure
- Exposure concentration
- Uncertainty/calibration where applicable
- Evidence-gate failures and stale/closed venue guardrails

Never use a ranking score as satisfaction for the ranking created by that score.
If independent outcomes are absent, report that satisfaction is not evaluated.

## Step 7: validate

Run the full applicable suite:

```bash
.venv/bin/python -m pytest -q
npm test
npm run typecheck
npm run build
git diff --check
```

Review generated migrations and all changed documentation links.

## Step 8: update documentation

Update every affected canonical document listed in
[`docs/ml/maintenance-and-change-policy.md`](../docs/ml/maintenance-and-change-policy.md).

Documentation must state:

- What changed and why
- Data lineage and allowed use
- Input/output contract
- Model/ranking version
- Evaluation and known limitations
- Operations and rollback
- Current implementation status
- Next safe step

## Step 9: handoff

Report:

- Branch/PR/commit
- Tests/build results
- Model/data/schema versions
- Migration state: generated versus actually applied
- Metrics and caveats
- Exact next step

## Invariants

1. Platform data stays quarantined.
2. Residual does not mean quality.
3. Anomaly does not mean hidden gem.
4. Hidden-gem gates remain deterministic and mandatory.
5. No self-referential satisfaction metric.
6. No behavioral learning without impressions and positions.
7. No prediction without model version.
8. No automatic retraining without drift, artifact and approval infrastructure.
9. No user-facing factual claim generated without grounded evidence.
10. Documentation and tests change with behavior.

## Edge cases and learned constraints

- Tiny datasets: the residual model requires at least four rows, but such a run
  is suitable only for tests, not meaningful research.
- One spatial cell: training falls back to shuffled K-fold and labels the strategy.
  Investigate before using output beyond tests.
- CSV diagnostics: DataFrame `attrs` are not preserved by CSV. A durable run
  manifest remains future work.
- OSM metadata richness: tag count, record version and hours detail are contributor
  activity/completeness proxies, not venue quality.
- Multiple discovery scores: always identify module/field owner in code and docs.
- Python/TypeScript drift: update both only when parity is intended; otherwise
  document the deliberate difference.
- Result position: the schema exists but zero-based versus one-based convention is
  not yet approved. Decide before instrumentation.
- No-outcome evaluation: `hypothesis_confirmed = None` is correct, not a failure.
- Dependency cache: in managed environments with unwritable injected npm cache,
  follow the operations runbook without modifying global system settings.

## Current next step

Validate the shadow-mode event collection foundation described in
[`docs/ml/maintenance-and-change-policy.md`](../docs/ml/maintenance-and-change-policy.md):
apply the event-control migration in the target D1 environment, collect a
representative shadow interval, inspect data-quality reporting, document
duplicate/missing/expired-event behavior, and decide attribution/deletion
operations. Do not train the personalized ranker before that foundation is
validated with real collection metrics.

## Concierge implementation notes (2026-09-05)

- Production Pages retrieval/synthesis is owned by `functions/api/concierge.ts`
  and `lib/concierge/`; Python is a conservative offline adapter. Follow
  [`docs/ml/concierge-rag.md`](../docs/ml/concierge-rag.md) for actual contracts.
- Client place arrays are untrusted. Hydrate server facts and recheck eligibility
  after vector retrieval, including document hashes and current closure labels.
- A citation ID is not proof of arbitrary generated prose. Initial synthesis
  selects existing fact IDs; protected facts are rendered deterministically.
- Index API acceptance is asynchronous. Verify hashes/deletions/count and a
  preview query before activation; dry-run indexing must not call providers.
- Local test mocks do not establish multilingual model quality. The initial
  synthetic holdout was used in safety debugging; collect a fresh one before
  calibration/promotion. Global scorer and shadow event versions are unchanged.
- The live concierge catalog audit found separate public/D1 ID namespaces and
  differing normalized facts. Run `execution/audit_concierge_catalog.mjs` before
  preview. Use Wrangler query mode (`--command`) for row exports; its bulk-file
  path returns execution summaries. Keep the source IDs and lifecycle conflicts
  explicit; do not automatically renumber or overwrite records from public defaults.
- The 2026-09-06 reconciliation preserves both numeric namespaces and uses full
  OSM identities plus validated existing duplicate aliases for map actions.
  Source locality must survive derived region labels; impossible coordinates
  and explicit outside localities still reject. Missing CSV numbers are NULL,
  not zero. Source-field repairs require identity/state/timestamp guards and
  post-write verification. See `docs/ml/concierge-reconciliation.md` for the
  applied repair, current versions and remaining deployment/evaluation boundaries.
- Nearby discovery should request browser location on explicit actions only.
  Share pending map/concierge requests and distinguish timeout from permission
  denial. Bound client waits and ignore late callbacks; do not retry automatically
  from mount effects, language changes or query keystrokes.
- Cloudflare Pages' automatic Functions builder can use an older Wrangler than
  the repository. Check deployed build logs; JSON import attributes failed under
  3.114.17 while pinned 4.92.0 compiled them. Compile the preview worker locally.
  Verify CPU limits with execution telemetry: wall-clock deadlines cannot prevent
  `exceededCpu`. See `docs/ml/concierge-preview.md` for the tested preview setup.
