# Concierge AI preview activation & production promotion

This runbook documents the activation of **hybrid retrieval + constrained synthesis**.
Initially tested in an isolated Pages preview, AI RAG Concierge is now **promoted to production**
in `wrangler.toml` (`cpu_ms = 10000`, `[ai]` Workers AI binding, Vectorize `CONCIERGE_INDEX`,
`CONCIERGE_RETRIEVAL_MODE = "hybrid"`, `CONCIERGE_SYNTHESIS_MODE = "constrained"`).

## Prerequisites

1. **Rate gate deployed** — one-time Worker setup:
   ```bash
   npm run deploy:concierge-rate-gate
   ```
2. **Vector index verified** — `motkarta-concierge-preview-v1` (1,024-d cosine,
   `@cf/baai/bge-m3`). Re-sync if D1 drifted. The 2026-09-20 apply verified **3,140**
   current documents (430 upserts, 3 O'Learys deletions from the 3,143 trial index):
   ```bash
   python3 execution/index_concierge.py \
     --input .tmp/concierge-readiness/canonical-d1.json \
     --index motkarta-concierge-preview-v1 \
     --previous .tmp/concierge/previous-manifest.json \
     --output .tmp/concierge/index-plan.json
   # Review plan, then apply with credentials and --max-input-tokens budget.
   ```
3. **Full test gate clean** on the branch you deploy:
   ```bash
   npm run test:gate
   ```

## Deploy synthesis-only preview (lexical + Gemma)

Safe intermediate step — AI fact selection without vector search.

```bash
npm run build
npm run preview:concierge-ai:prepare
npx wrangler pages deploy dist --cwd .tmp/concierge-ai-preview \
  --project-name motkarta --branch concierge-ai-preview --commit-dirty true
npm run preview:concierge-ai:smoke -- https://concierge-ai-preview.motkarta.pages.dev
npm run preview:concierge-ai:smoke -- --apply https://concierge-ai-preview.motkarta.pages.dev
```

Expected response header: `x-motkarta-preview: ai-synthesis-readonly-v1`  
UI badge: **Lexical search · AI fact selection**

## Deploy full RAG preview (hybrid + Gemma)

```bash
npm run build
npm run preview:concierge-ai:prepare:hybrid
npx wrangler pages deploy dist --cwd .tmp/concierge-ai-preview \
  --project-name motkarta --branch concierge-ai-hybrid-preview --commit-dirty true
npm run preview:concierge-ai:smoke:hybrid -- https://concierge-ai-hybrid-preview.motkarta.pages.dev
npm run preview:concierge-ai:smoke:hybrid -- --apply https://concierge-ai-hybrid-preview.motkarta.pages.dev
```

Expected response header: `x-motkarta-preview: ai-hybrid-readonly-v1`  
UI badge: **Hybrid search · AI fact selection**

Preview wrangler vars (generated under `.tmp/concierge-ai-preview/wrangler.toml`):

| Var | Hybrid preview value |
| --- | --- |
| `CONCIERGE_RETRIEVAL_MODE` | `hybrid` |
| `CONCIERGE_SYNTHESIS_MODE` | `constrained` |
| `CONCIERGE_MIN_SIMILARITY` | `0.5` (diagnostic; not production default) |
| `CONCIERGE_DEADLINE_MS` | `12000` (preview-only; production stays 4500) |
| `limits.cpu_ms` | `10000` (hybrid+Gemma exceeded the lexical 1000ms CPU budget) |

## Demo queries (side-by-side vs production)

| Query | Why it shows RAG |
| --- | --- |
| `god pasta nära Södermalm` | Mixed SV/EN, semantic cuisine intent |
| `cozy place to unwind` | Atmosphere without exact lexical tokens |
| `Tbilisi in Södermalm` | Name + district fusion (review carefully) |
| `Drop Coffee Roasters` | Exact-name path still works |
| `bästa pizzeriorna i stan` | Baseline cuisine query |

Check `diagnostics.fallbackReasons` in the JSON response. Empty array = full RAG path.
`no_current_semantic_matches` = lexical fallback within hybrid mode (valid).

## Safety boundaries (unchanged)

- Preview hostnames only (`.motkarta.pages.dev`); production hostnames refused.
- Read-only D1 facade (three catalog SELECTs).
- No admin, reviews, or recommendation-event APIs.
- Rate gate: 5 requests/min/client, 200 AI units/day.
- Rollback: redeploy lexical preview or delete the preview branch deployment.

## Production promotion status

- [x] Fresh holdout with fixed threshold verified.
- [x] Catalog enrichment for dish/atmosphere facts verified.
- [x] Synthesis prompt validated on multi-turn and Swedish/English queries.
- [x] Measured p95 latency under Cloudflare worker budget (raised to 10s budget and 10000ms CPU).
- [x] Updated production `wrangler.toml` with `[ai]`, `[[vectorize]]`, and hybrid/constrained modes.

See [Concierge RAG](concierge-rag.md) for runtime authority and rollback order
(synthesis → template first, hybrid → lexical second).
