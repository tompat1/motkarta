# ML training and evaluation

## Current trained model

The only trained recommendation-adjacent model currently authorized is the
offline residual underexposure model in `scripts/model_discovery.py`.

It answers:

> Given observable platform/exposure and structural characteristics, what rating
> would this platform typically show for a venue like this?

It does not answer:

> Is this restaurant good?

## Training procedure

### 1. Validate input

The script requires all contract columns, at least four rows, ratings between 1
and 5, at least two folds and interval coverage between 0.5 and 1.0.

Review counts are converted with:

```text
log_review_count = log(1 + max(review_count, 0))
```

Numeric missing values use median imputation. Categorical missing values use the
most frequent value, followed by one-hot encoding with unknown-category support.

### 2. Build spatial groups

Approximate cells are derived from:

```text
latitude cell  = floor(latitude / 0.01)
longitude cell = floor(longitude / 0.02)
```

These are pragmatic Stockholm-scale cells, not H3 identifiers. If at least two
cells exist, `GroupKFold` holds whole cells out. If every row occupies one cell,
a deterministic shuffled K-fold fallback is used and clearly named in output.

### 3. Produce out-of-fold predictions

For each fold:

1. Build a fresh preprocessing/model pipeline.
2. Fit only on other folds.
3. Predict the held-out fold.
4. Record the producing fold ID.

Every row must receive exactly one prediction. A missing or duplicate prediction
is a runtime error.

### 4. Calculate residual

```text
rating_residual = platform_rating - expected_platform_rating_oof
```

Positive is higher than the learned platform baseline. Negative is lower.

### 5. Estimate uncertainty

For each fold, the empirical error radius is calculated from absolute OOF errors
belonging to the other folds. The configured quantile uses the conservative
`higher` method.

```text
lower bound = residual - radius
upper bound = residual + radius
```

This is a cross-fitted empirical error band. It is not a causal confidence
interval and does not establish food quality.

`underexposure_confidence` is a bounded monotonic transform of residual relative
to its error radius. It is useful for candidate prioritization but is not a
calibrated probability.

### 6. Apply governance fields

Every output is marked `candidate`, carries model/version/validation metadata and
lists missing evidence gates. No ML row is promoted automatically.

## Why in-sample residuals are prohibited

Training and predicting on the same venue allows the estimator to partially
memorize its target. Residuals become artificially small or optimistic and no
longer approximate unseen behavior. Published predictions must be out-of-fold or
from a later untouched holdout.

## Evaluation layers

### Model fidelity

Minimum diagnostics:

- Mean absolute error
- Root mean squared error
- Fold count and strategy
- Nominal and observed empirical interval coverage
- Residual distribution

Also evaluate by:

- Cuisine
- District/outer versus inner city
- Venue type
- Chain status
- Price level
- Review-volume band
- New versus established records when dates exist

Aggregate error alone can conceal systematic harm to sparse cuisines or outer-city venues.

### Candidate usefulness

Use independent human review to measure:

- Precision among top residual candidates
- Share passing evidence gates
- Share rejected as stale/closed/wrong category
- Cuisine and geographic coverage
- Reviewer disagreement
- Time required per validated candidate

The model is useful only if it improves the review queue, not merely if residuals
look mathematically interesting.

### Ranking evaluation

`motkarta.evaluation.evaluate_ranking_experiment()` compares:

- Ranking A: raw popularity/review volume
- Ranking B: transparent recommendation or discovery score

Representation metrics can be computed without outcomes:

- Cuisine entropy
- Outer-city ratio
- Independent-business ratio
- Unfamiliar-discovery ratio

Satisfaction cannot. The function returns `hypothesis_confirmed = None` unless an
independent outcome column is supplied.

Accepted conventional outcome columns in the CLI workflow:

- `would_return`
- `positive_outcome`
- `human_relevance_label`

Never substitute `discovery_score` as satisfaction for a ranking sorted by
`discovery_score`. That is circular evaluation.

## Future behavioral ranker

Do not train until the event contract is instrumented and validated.

### Candidate training unit

One row should represent a venue impression within a session/query context, with:

- Venue features available at impression time
- User-declared or pseudonymous-history features available at impression time
- Context and result position
- Ranker/model version
- Subsequent outcome within a documented attribution window

Never use features updated after the outcome or future visits.

### Target design

Begin with explicit, interpretable targets rather than raw click-through rate.
Possible graded relevance:

| Outcome | Illustrative relevance |
| --- | ---: |
| Would return | 4 |
| Confirmed visit | 3 |
| Direction request | 2 |
| Save | 2 |
| Profile view | 1 |
| Impression only | 0 or unlabeled/weak negative |
| Dismiss | -1 or explicit negative |

Values above are design candidates, not approved constants. Validate attribution,
class balance and gaming risk before adoption.

### Bias correction

At minimum:

- Include result position/exposure context.
- Train only from actual impressions.
- Consider inverse-propensity weighting once exploration propensities are known.
- Keep a controlled exploration allocation for long-tail venues.
- Cap repeated exposure and audit concentration.
- Use post-ranking diversity constraints rather than expecting the model to learn policy implicitly.

### Splitting

Use chronological splits:

1. Train on earlier events.
2. Validate on a later interval.
3. Test once on the newest untouched interval.

Where possible, also test cold-start venues and sessions/users not represented in
training. Random row splits can leak the same venue/session across sets.

### Offline metrics

Recommended ranking metrics:

- NDCG@K for graded outcomes
- Recall@K for high-value outcomes
- Mean reciprocal rank where one best match is expected
- Calibration/Brier score if predicting outcome probability
- Coverage and catalog exposure
- Novelty and long-tail share
- Cuisine entropy and geographic diversity
- Independent venue exposure share
- Exposure Gini coefficient
- Worst-slice performance

Accuracy improvements are insufficient if exposure becomes materially more concentrated.

### Online evaluation

Do not run an A/B test until assignment, event logging and privacy behavior are
tested. Pre-register:

- Primary outcome
- Guardrail metrics
- Minimum detectable effect/sample requirements
- Experiment duration
- Stopping rule
- Slice analysis
- Rollback rule

Guardrails should include hidden-gem evidence failures, closed venue exposure,
chain exposure, concentration, latency and user dismissals.

## Reproducibility checklist

Record with every run:

- Git commit
- Input snapshot identifier/hash
- Capture interval
- Feature contract version
- Model version
- Random seed
- Fold/group definition
- Dependency versions
- Hyperparameters
- Metrics and slices
- Output artifact hashes
- Reviewer/promotion decisions generated later

The current script writes row-level version/fold data but does not yet persist a
complete run manifest. Adding a JSON manifest is a high-priority maintenance task.

