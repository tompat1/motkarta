# Motkarta underexposure model card

This is the component model card for the offline residual model. The canonical
system-wide documentation is the [ML documentation index](ml/README.md), with
full [data contracts](ml/data-contracts.md),
[training and evaluation](ml/training-and-evaluation.md),
[operations](ml/operations-runbook.md) and
[change policy](ml/maintenance-and-change-policy.md).

## Model identity

- Version: `discovery-hgbr-spatial-oof-v1`
- Estimator: scikit-learn `HistGradientBoostingRegressor`
- Purpose: propose venues whose platform rating is unexpectedly high relative
  to comparable structural and exposure conditions
- Prohibited interpretation: objective food quality or automatic hidden-gem status

## Inputs

The quarantined research dataset contains platform rating, logarithmic review
count, price level, coordinates, category, cuisine, district and chain status.
Commercial rating and review-volume fields must not enter Motkarta's intrinsic
quality, evidence confidence or editorial scores.

## Validation

Predictions are out-of-fold. Venues are grouped into approximate Stockholm
spatial cells and an entire cell is held out from each training fold. A
deterministic shuffled K-fold fallback is used only when all rows occupy one
cell, primarily for small fixtures.

Reported diagnostics:

- Mean absolute error
- Root mean squared error
- Validation strategy and fold identifier
- Cross-fitted empirical residual interval calibrated from other folds
- Version attached to every candidate row

Each fold's interval radius is calibrated from the out-of-fold errors belonging
to the other folds. It expresses model uncertainty around algorithmic surprise,
not uncertainty about food quality.

## Permitted use

The output may nominate a `candidate` for research or editorial review. Public
promotion still requires Motkarta's independent evidence, current-existence,
distinctiveness and lifecycle gates.

## Known limitations

- Platform ratings are compressed, selected and affected by unobserved exposure.
- Paid placement and commercial prominence are not observable.
- Sparse cuisines and new venues may receive wide or unstable intervals.
- Geographic cells reduce spatial leakage but do not remove neighbourhood confounding.
- The empirical `underexposure_confidence` is a monotonic confidence aid, not a
  calibrated probability or causal estimate.

## Monitoring and retraining

Keep model versions immutable. Compare new versions on a later temporal holdout,
report errors by cuisine, district, venue type and chain status, and retain score
snapshots for audit. Do not deploy a version that improves aggregate error while
materially worsening long-tail group errors without documented review.

## Recommendation learning prerequisites

The application now records the following event-level data in shadow mode:

- Impressions, including result position
- Profile views, saves and direction requests
- Confirmed visits and `would_return` when explicit UI is added
- Dismissals when explicit UI is added
- Session, recommendation mode and model version

Events use rotating anonymous identifiers and minimized structured query context.
Do not store raw IP addresses, precise device fingerprints or raw free-text
queries. Before training a personalized or contextual ranker, validate shadow
data quality, define attribution windows, implement deletion/cleanup operations
and split evaluation chronologically so future outcomes never leak into training.
