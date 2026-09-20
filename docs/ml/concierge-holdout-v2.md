# Concierge holdout v2 — dish/cuisine semantic RAG

Fresh **40-query holdout** for hybrid preview promotion. This split was not used
during the 2026-09-07 trial or threshold sweeps.

## Fixture

- Path: [`tests/fixtures/concierge/holdout-queries-v2.json`](../../tests/fixtures/concierge/holdout-queries-v2.json)
- Version: `concierge-holdout-queries-v2`
- Frozen threshold: **0.5** (preview diagnostic only — set before running; do not tune on this split)

## Query mix

| Family | Count | Purpose |
| --- | ---: | --- |
| `dish_cuisine` | 30 | Dish name → cuisine inference (pierogi, moules-frites, lohikeitto, …) |
| `exact_name` | 2 | Exact venue path still works |
| `baseline` | 4 | Lexical-friendly cuisine queries |
| `abstention` | 2 | Out-of-scope geography / excluded chains |
| `hybrid` | 2 | Name+district fusion and Nordic dish terms |

## Running against preview

After deploying hybrid preview (see [activation checklist](concierge-ai-preview-activation.md)):

```bash
npm run preview:concierge-ai:smoke:hybrid -- --apply https://concierge-ai-hybrid-preview.motkarta.pages.dev
```

Extend smoke or capture script to iterate holdout queries and record:
- `retrievalMode`, `diagnostics.fallbackReasons`, top card IDs, synthesis mode

## Promotion criteria (draft)

- Hybrid retrieval active on ≥ 28/30 dish_cuisine queries (`retrievalMode === 'hybrid'` OR valid lexical fallback with `no_current_semantic_matches`)
- Zero `semantic_not_configured` on preview host
- Constrained synthesis on ≥ 32/40 queries
- No unsupported-query false positives on abstention family
- p95 worker latency ≤ 4.5s with live bindings

Labels in the fixture are **expected cuisine/dish hints** for manual or semi-automated review — not independently collected human judgments. Pair with admin review labels before production promotion.

## Cuisine/dish knowledge source

Dish ↔ cuisine mappings live in [`data/concierge/cuisine-dishes.json`](../../data/concierge/cuisine-dishes.json) and feed:

- Intent parsing (`lib/concierge/intent.ts`)
- Structured filters (`lib/concierge/filters.ts`)
- Retrieval gates (`lib/concierge/retrieval.ts`)
- Catalog enrichment (`execution/enrich_catalog.py`)

Re-run catalog enrichment and vector re-index after expanding the registry.
