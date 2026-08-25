# ML data contracts

## Principles

Data contracts protect provenance and prevent signals from leaking across policy
boundaries. A field being technically available does not mean it is allowed in a
model or score.

Every derived dataset should be reconstructable from identified raw sources and
should preserve venue identity, capture time and transformation version.

## Venue identity

Preferred stable identity order:

1. OSM type plus OSM ID when available.
2. Internal `establishments.id` after entity resolution.
3. Explicit reviewed duplicate mapping.

Names alone are not stable identifiers. Renaming, transliteration and multiple
locations make name-only joins unsafe.

## Data classes

| Class | Examples | Allowed use |
| --- | --- | --- |
| Neutral facts | name, address, coordinates, hours, website | Display, matching, context |
| Open structural attributes | cuisine, venue type, OSM tags | Filtering, scoring, modelling with caveats |
| Independent evidence | guide, editorial, inspection, community verification | Quality/confidence and gates |
| Motkarta engagement | impressions, saves, visits, would-return | Exposure-adjusted evaluation and future ranking |
| Commercial platform audit | platform rating, review count, prominence | Quarantined residual research only |
| Computed scores | quality, relevance, discovery, recommendation | Ranking/explanation according to owning subsystem |
| Model outputs | residual, interval, confidence | Candidate research according to model card |
| Lifecycle/admin labels | candidate, verified, featured, validation label | Human governance and supervised labels |

## Residual-model training input

Required CSV columns:

| Column | Type | Rules |
| --- | --- | --- |
| `platform_rating` | float | Required, numeric, 1 through 5; quarantined target |
| `review_count` | integer/float | Required, non-negative after cleaning; transformed with `log1p` |
| `price_level` | numeric | Required column; missing values may be imputed |
| `latitude` | float | Required column; missing values may be imputed but reduce spatial meaning |
| `longitude` | float | Required column; missing values may be imputed but reduce spatial meaning |
| `category` | string | Required; categorical |
| `cuisine` | string | Required; categorical; normalization should precede training |
| `district` | string | Required; categorical |
| `chain_status` | string | Required; expected independent/chain/unknown |

Recommended lineage columns, retained unchanged when present:

- `name`
- internal or OSM identity
- source/capture timestamps
- `independent_evidence_count`
- `current_existence_verified`
- `latest_verified_date`
- `distinctiveness_verified`

Do not add a feature merely because it improves aggregate error. First document
its provenance, bias mechanism and whether it violates quarantine.

## Residual-model output

| Field | Meaning |
| --- | --- |
| `expected_platform_rating_oof` | Prediction from a model that did not train on this venue/fold |
| `expected_platform_rating` | Compatibility alias for the OOF prediction |
| `rating_residual` | Actual platform rating minus OOF expected rating |
| `residual_interval_radius` | Cross-fitted empirical error radius |
| `residual_lower_bound` | Residual minus error radius |
| `residual_upper_bound` | Residual plus error radius |
| `underexposure_confidence` | Monotonic research confidence; not calibrated probability |
| `discovery_percentile` | Percentile rank of residual within this run |
| `ml_fold_id` | Validation fold that produced the prediction |
| `ml_validation_strategy` | Spatial grouping or documented fallback |
| `ml_model_version` | Immutable model behavior identifier |
| `ml_lifecycle_state` | Always `candidate` for model proposals |
| `ml_allowed_use` | Human-readable restriction |
| `source_gap_flags` | Evidence missing before possible promotion |
| `ml_candidate_reason` | Auditable explanation of residual and gaps |

The percentile is run-relative. It is not comparable across independently
filtered datasets unless their cohort definition is identical.

## Model diagnostics

`fit_discovery_model()` attaches `DiscoveryDiagnostics` to the returned
DataFrame's `attrs` during in-process use:

- Model version
- Number of folds
- Validation strategy
- Mean absolute error
- Root mean squared error
- Nominal interval coverage
- Observed interval coverage

CSV does not preserve DataFrame attributes. Operational jobs that need durable
diagnostics must write them to a separate JSON manifest in a future change. Do
not assume the CSV contains run-level diagnostics.

## Structural anomaly output

Canonical fields:

| Field | Meaning |
| --- | --- |
| `spatial_density_300m` | Nearby venue count within approximately 300 metres |
| `tag_complexity` | Count of non-trivial structured tags |
| `opening_hours_score` | Metadata completeness proxy, not service quality |
| `historic_longevity` | OSM-derived stability proxy, not business age proof |
| `structural_interest_index` | Deterministic combination used for review prioritization |
| `structural_anomaly_score` | Isolation Forest class, normally 1 or -1 |
| `is_structural_anomaly` | Unusual record plus above-median structural interest |

Legacy aliases:

- `gem_index` maps to `structural_interest_index`.
- `anomaly_score` maps to `structural_anomaly_score`.
- `is_hidden_gem` is always false when set by this module.

## Recommendation event contract

Table: `recommendation_events`.

| Column | Required | Description |
| --- | --- | --- |
| `id` | Generated | Event primary key |
| `establishment_id` | Yes | Foreign key to venue |
| `anonymous_user_id` | No | Rotating application identifier, never raw IP/fingerprint |
| `session_id` | Yes | Groups one recommendation/search journey |
| `event_type` | Yes | One of the controlled event types below |
| `result_position` | For impressions | Zero-based position in the rendered result set |
| `recommendation_mode` | Yes | One of the controlled recommendation modes below |
| `query_context_json` | No | Minimized structured context; unrestricted user text is rejected |
| `model_version` | Yes | Scorer/ranker version that generated exposure |
| `occurred_at` | Yes | UTC ISO-8601 timestamp |
| `idempotency_key` | Yes for new events | Stable key used to deduplicate repeated renders/actions |
| `received_at` | Yes for new events | UTC ingestion timestamp |
| `expires_at` | Yes for new events | UTC timestamp for retention cleanup eligibility |
| `schema_version` | Yes for new events | Event contract version, currently `recommendation-events-v1` |
| `privacy_version` | Yes for new events | Privacy/identifier contract version, currently `privacy-rotation-v1` |

Allowed event types:

- `impression`
- `profile_view`
- `save`
- `direction_request`
- `confirmed_visit`
- `would_return`
- `dismiss`

Allowed recommendation modes:

- `search`
- `map`
- `list`
- `concierge`
- `nearby`
- `saved`
- `curated`
- `hidden_gems`

Allowed query-context keys:

- `hasQuery`
- `queryLengthBucket`
- `kind`
- `cuisine`
- `mode`
- `sortMode`
- `resultCount`
- `surface`

### Impression rules

- Record every venue actually rendered in a result set.
- Record zero-based position and model version.
- Do not record candidates fetched but never displayed.
- Deduplicate repeated renders caused only by UI reconciliation.
- Current foundation uses rendered result rows as impressions; scrolling into view
  is not required in version `recommendation-events-v1`.
- Associate later outcomes with the most relevant prior impression/session.

### Outcome hierarchy

Signals are not equally strong. Initial interpretation:

```text
would_return > confirmed_visit > direction_request > save > profile_view
dismiss = explicit negative feedback
no action after impression = weak/ambiguous, not a hard negative
```

This hierarchy is policy guidance, not a fixed numeric target. Any target
construction must be documented and versioned.

## Human labels

Admin validation labels include:

- `known_mainstream`
- `known_hidden_gem`
- `not_enough_evidence`
- `closed_wrong_category`

Duplicate-resolution actions are exported separately and must never contaminate
hidden-gem/mainstream training labels.

Human labels require reviewer time and context. Preserve timestamp, notes,
lifecycle transition and label export version.

## Privacy and retention

- Use rotating pseudonymous identifiers.
- Never store raw IP addresses, advertising IDs or precise device fingerprints.
- Minimize query context; avoid storing free text unless necessary and reviewed.
- Do not infer or store sensitive traits from behavior.
- Define retention before enabling collection.
- Provide a deletion/rotation strategy before using persistent user identifiers.
- Aggregate or remove event-level data when its learning purpose expires.

Privacy requirements are product requirements, not optional model cleanup.

Current foundation:

- Browser-generated `anonymous_user_id` values rotate after 30 days.
- `session_id` is session-scoped browser storage.
- Default event retention is 180 days, bounded by endpoint configuration to
  7-365 days.
- New rows include `expires_at`; expired rows are reported by the shadow-quality
  endpoint before any cleanup automation is introduced.
- Raw query text is not accepted in `query_context_json`.

## Versioning

Version separately:

- Raw dataset snapshot/capture date
- Normalization/entity-matching version
- Feature-contract version
- Model version
- Ranking-policy version
- Event schema version
- Label export version

A model version must change when preprocessing, features, target, folds,
hyperparameters or post-processing can alter predictions. Documentation-only
changes do not require a model version bump.
