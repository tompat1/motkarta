# Frontend ML Surface

This folder is the frontend home for ML-adjacent behavior. Keep production
scoring, model training and RAG retrieval governed by the canonical docs in
`docs/ml/`.

## Current Files

- `recommendationInstrumentation.ts`: shadow-mode recommendation event helpers,
  browser/session identifiers, result-set IDs and query-context token mapping.

## Intended Growth

- Add OpenStreetMap/Overpass-derived feature views here only when they support
  frontend display, event attribution or model-status inspection.
- Keep hidden-gem model output as candidate/review assistance. It must not bypass
  deterministic hidden-gem gates in `lib/scoring.ts`.
- Keep expert RAG Concierge UI and telemetry grounded in retrieved facts. The LLM
  should synthesize from evidence packets, not become the ranker of record.

## Boundary

Raw training, residual modeling, structural anomaly detection and evaluation
remain in the Python/data workflow unless a reviewed change introduces a
frontend-facing artifact. Do not store raw free-text queries or personal
identifiers here.
