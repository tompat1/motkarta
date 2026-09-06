# ML maintenance and change policy

For the applied catalog data repair and locally implemented admission/identity
changes, see [Concierge reconciliation](concierge-reconciliation.md). Retain its
pre/post snapshots and guarded rollback when reviewing the 454 updates. Public
catalog regeneration must preserve/rebuild full OSM identities and corroborated
aliases, then pass the catalog audit. Neither identity repair nor zero audit
blockers authorizes deployment, paid inference or personalized learning.

## Purpose

ML behavior can change through code, data, labels, features, weights, prompts or
post-processing. This policy ensures those changes remain reviewable and do not
quietly recreate the bias Motkarta is designed to resist.

## Change categories

### Documentation-only

Examples: clearer explanation, corrected link, additional runbook note.

Requirements:

- Verify against current code.
- No model-version bump unless semantics changed.
- Keep directive and index links current.

### Bug fix with unchanged intended behavior

Examples: missing-value crash, incorrect field mapping, non-deterministic test.

Requirements:

- Regression test.
- Before/after behavior explanation.
- Version bump if predictions or stored outputs can change.

### Ranking-policy change

Examples: weight changes, new gate threshold, diversity re-ranking, exposure cap.

Requirements:

- Product rationale.
- Offline comparison and slice metrics.
- User-facing explanation review.
- Ranking/model version bump.
- Rollback plan.

### Model change

Examples: estimator, feature, target, fold, hyperparameter or uncertainty change.

Requirements:

- New immutable model version.
- Updated model card.
- Leakage review.
- Baseline comparison and slice report.
- Tests and reproducible run details.

### Data-source change

Examples: new guide, municipal register, platform audit source or scraper.

Requirements:

- License and terms review.
- Provenance mapping.
- Entity-resolution tests.
- Coverage and representation impact.
- Explicit allowed-use classification.

### Event/target change

Examples: new event type, changed attribution window, new outcome weights.

Requirements:

- Privacy and retention review.
- Schema/data-contract versioning.
- Backward compatibility decision.
- Training exclusion for incompatible historical periods.

## Pull-request checklist

Every ML-related PR should answer:

1. Which subsystem changes?
2. Is it research-only, production ranking, labeling, telemetry or synthesis?
3. Which data sources and allowed-use classes are involved?
4. Can predictions, ranks or user-facing labels change?
5. What leakage, exposure or popularity bias could be introduced?
6. What model/ranking/data-contract version changes?
7. Which aggregate and slice metrics were compared?
8. Are explanations and evidence gates preserved?
9. How is the change rolled back?
10. Which documentation and tests were updated?

## Required review invariants

A reviewer must block the change if it:

- Mixes commercial platform audit data into intrinsic quality/evidence scoring.
- Uses in-sample predictions as candidate scores.
- Treats structural anomaly as quality.
- Uses ranker's own score as satisfaction.
- Trains from clicks without impressions/positions.
- Removes model/version tracking.
- Bypasses hidden-gem gates.
- Stores unnecessary personal or free-text data.
- Improves aggregate accuracy while hiding severe slice degradation.
- Changes output meaning without a contract/version migration.

## Drift monitoring

### Data drift

Compare over time:

- Venue count and source overlap
- Missingness by field
- Cuisine/category distribution
- District distribution
- Chain-status distribution
- Review-volume bands in quarantined research
- OSM tag complexity and coordinate completeness
- Event volume by type/mode/position

### Prediction drift

Compare:

- Expected-rating and residual distributions
- Error-radius distribution
- Candidate count and top-decile composition
- Quality/relevance/discovery/recommendation distributions
- Exposure share and Gini coefficient
- Hidden-gem gate pass/fail reasons

### Performance drift

When independent labels/outcomes exist:

- MAE/RMSE and slice errors for residual model
- NDCG/Recall/calibration for ranker
- Would-return/visit outcomes
- Long-tail and independent-venue exposure
- Dismissals and stale/closed venue exposure

Do not retrain automatically solely because drift is detected. Investigate source,
policy and seasonal causes first.

## Retraining policy

Current residual training is manual/offline. A retraining proposal must include:

- Reason for retraining
- New data interval and source changes
- Duplicate/entity-resolution status
- Prior and candidate model versions
- Same-cohort comparison where possible
- Slice metrics and candidate-review sample
- Promotion and rollback decision

Automatic scheduled retraining is not authorized until run manifests, artifact
storage, drift guardrails and approval workflow exist.

## Compatibility policy

- Additive fields are preferred during migration.
- Keep compatibility aliases only with an owner and removal plan.
- Never reuse an old field name for a new semantic meaning.
- Database migrations must be forward-auditable.
- Historical events remain tied to the model version that generated them.
- Do not backfill guessed result positions or impressions.

Known compatibility debt:

- `expected_platform_rating` aliases the OOF value.
- `gem_index` aliases structural interest.
- `anomaly_score` aliases structural anomaly class.
- Multiple subsystems expose a field named discovery score.

## Documentation maintenance

Update these files in the same PR when applicable:

- `docs/ml/README.md` for status/navigation/invariants
- `docs/ml/architecture.md` for subsystem or flow changes
- `docs/ml/data-contracts.md` for fields/events/labels
- `docs/ml/training-and-evaluation.md` for model/evaluation changes
- `docs/ml/operations-runbook.md` for command/deployment changes
- `docs/ml/maintenance-and-change-policy.md` for governance changes
- `docs/discovery-model-card.md` for residual-model intended use
- `directives/ml_recommendation_system.md` for agent SOP changes
- Root `README.md` for public developer navigation

## Agent handoff format

At the end of ML work, record:

- Goal and scope
- Branch/PR/commit
- Files changed
- Model/data/ranking versions
- Commands run and outcomes
- Metrics and caveats
- Migrations created/applied
- Artifacts created and locations
- Unresolved risks
- Exact recommended next step

Do not leave future agents to infer whether a migration reached production or a
model output was merely generated locally.

## Prioritized next steps

### Completed foundation: shadow event collection

1. Zero-based result positions, rendered-row impressions and controlled
   vocabularies are defined.
2. Rotating anonymous identifiers, session identifiers, minimized query context
   and retention metadata are defined.
3. `POST /api/recommendation-events` validates and ingests shadow events.
4. `src/ml/recommendationInstrumentation.ts` owns frontend event identifiers,
   query-context conversion and result-set helpers; `src/App.tsx` wires them to
   result impressions plus profile, save and direction-request outcomes.
5. Deduplication is enforced with idempotency keys.
6. `GET /api/recommendation-events` exposes admin-only shadow data-quality
   reporting.

This foundation remains shadow mode. It is not training authorization.

### Next: validate shadow collection quality

1. Apply the event-control migration in the target D1 environment.
2. Run shadow collection for a representative interval.
3. Review event volume, missing metadata, duplicate rate, expired-row behavior,
   mode distribution and slice coverage.
4. Decide outcome attribution windows and deletion/cleanup automation.
5. Document real data-quality metrics and any privacy review outcomes.

### Then: ranker dataset and baseline

1. Build impression-outcome attribution dataset.
2. Establish deterministic popularity/relevance baselines.
3. Add chronological and cold-start splits.
4. Train a simple interpretable classifier/ranker.
5. Add exposure/diversity re-ranking and guardrails.
6. Compare accuracy, calibration, long-tail coverage and exposure inequality.

### Later: controlled online experiment

Only after logging quality, privacy, sample size and rollback behavior are proven.

## Concierge maintenance boundary (2026-09-05)

Version corpus serialization, lexical/hybrid retrieval and synthesis prompts
independently of the global scorer. Keep `docs/ml/concierge-rag.md`, the evaluation
record, shared policy fixtures and provider/fallback tests synchronized with
behavior. Cloud activation remains a separate release gate; passing mocked
integration tests does not promote a model or satisfy the fresh-holdout requirement.
