# Concierge preview — 2026-09-06

Subsequent [build/deployment repair](../build-deployment-repair.md) adds complete
Functions bundling to the regular build and prevents preview output-directory
drift. The US$1 model trial was approved, then paused at the user's request to
fix builds first. Its isolated index exists empty; no model calls have started.

The lexical concierge is deployed at
[concierge-rag-preview.motkarta.pages.dev](https://concierge-rag-preview.motkarta.pages.dev).
The tested immutable deployment is
[3bb6d7d4.motkarta.pages.dev](https://3bb6d7d4.motkarta.pages.dev).
It serves the current frontend and the existing D1-backed concierge. This is a
controlled integration preview; semantic retrieval and AI synthesis remain off.

## Scope and isolation

`execution/concierge-preview-worker.ts` exposes only concierge GET/POST and static
assets. Other API/admin paths return 404; non-concierge writes return 405.
The D1 facade allows exactly the existing place, evidence and tag SELECT queries,
and exposes no mutation methods. This is deployment isolation with read access
to `motkarta-prod`, not a separate database copy. It cannot submit reviews,
sources or recommendation events. Contribution/admin flows are outside this preview.

The worker constructs a fresh environment with lexical/template modes and no AI,
Vectorize or limiter binding, so incoming dashboard flags cannot enable inference.
The primary production hostnames are refused. Responses identify the preview
with `x-motkarta-preview: lexical-readonly-v1`. No database writes, migrations,
AI calls, Vectorize mutations or plan upgrades were performed in this continuation.
The production canonical deployment was checked before/after and remained unchanged.

## Findings and fixes

1. Recent automatic production builds fail under Cloudflare's Wrangler 3.114.17
   parser on JSON import attributes in `gates.ts` and `intent.ts`. Local Wrangler
   4.92.0 compiles the complete Functions directory. The preview preparation tool
   bundles an advanced-mode worker using that pinned toolchain's esbuild, avoiding
   the legacy parser. Production build configuration still needs this compatibility
   fix before a production rollout; this preview does not repair that pipeline.
2. The first preview produced intermittent HTTP 503 pages with
   `Worker exceeded resource limits`. Execution logs confirmed `exceededCpu`.
   Merely extending a network timeout would not fix this.
3. Retrieval now short-circuits unsupported intents, checks exact-name membership
   before expensive eligibility work, and avoids scoring irrelevant candidates.
   Complete ranked candidates were identical for 128 fixture queries and those
   same 128 queries against captured D1. Ranking/corpus versions remain unchanged.
4. The updated preview explicitly sets `limits.cpu_ms = 1000`, accepted by
   Cloudflare under the existing account configuration. The six-query HTTP suite
   and desktop/mobile browser suite then passed. This is a bounded smoke test,
   not sustained-load or cold-start reliability proof. The runtime still loads
   the whole catalog per request; candidate-specific hydration remains an
   optimization to evaluate before broader traffic.

Cloudflare documents [advanced-mode workers](https://developers.cloudflare.com/pages/functions/advanced-mode/)
and [Pages limits configuration](https://developers.cloudflare.com/pages/functions/wrangler-configuration/).
Worker CPU accounting must be taken from execution telemetry; the response's
wall-clock stage diagnostics are not CPU measurements.

## Validation

- Fresh D1 snapshot: 3,256 records, 3,143 eligible. All eligible records resolve
  to map venues and match the canonical index fact hashes; audit blockers are empty.
- Index dry-run: 3,143 documents, 114,962 estimated input tokens and 3,218,432
  dimensions. Vectorize list returned no existing indexes; none was created.
- 203 JavaScript tests and 70 Python tests pass. Typecheck, lint, frontend build
  and full Functions compilation pass. Existing bundle/Python warnings remain.
- Live HTTP checks: Drop Coffee and Spiga Madre exact IDs; Arirang and Starbucks
  excluded; missing-position clarification; corrected Sapori Italiani nearby ID;
  write/admin route isolation and cross-origin rejection.
- Six successful HTTP query round trips took 533–823 ms from this test runner.
  This small sample is not a latency percentile or service guarantee.
- Browser: live D1 responses, Drop Coffee map selection, Spiga Madre → Spigamadre
  alias and mobile nearby distance with simulated coordinates. No page runtime errors.

## Reproduce and roll back

```bash
npm test
npm run build
node execution/prepare_concierge_preview.mjs
npx wrangler pages deploy dist --cwd .tmp/concierge-preview \
  --project-name motkarta --branch concierge-rag-preview --commit-dirty true
node execution/smoke_concierge_preview.mjs https://concierge-rag-preview.motkarta.pages.dev
```

Preparation is local only; it writes a separate Pages configuration and manifest
under `.tmp/concierge-preview/`, leaving root `wrangler.toml` unchanged. Review its
CPU limit and binding before deployment. Re-run tests/build after source changes.
The output worker ignores the ordinary Functions directory according to Pages
advanced-mode rules. Do not deploy this artifact on `main`.

Artifacts include `manifest.json`, `deployment.json`, the before/after project
checks, `d1.json`, `audit/`, `index-plan.json`, `http-checks.json`,
`ranking-parity.json`, test logs, execution logs and browser screenshots.
Rollback is a replacement deployment to this preview branch or removal of its
specific deployment. No production rollback or catalog reversal is needed.

## Next: one bounded real-model trial (approved, paused for build repair)

Proposed scope is one isolated `motkarta-concierge-preview-v1` index with
1,024-dimensional cosine vectors and metadata indexes for corpus version,
eligibility and area. Index the 3,143 admitted D1 records with BGE-M3; inspect
readiness, IDs, hashes and queryability before use. Cap the index plan at 150,000
estimated input tokens; the existing exporter estimates 114,962. Its three-attempt
HTTP retry bound must be counted in trial usage, not treated as free.

Run at most 128 fixed diagnostic query embeddings/vector searches and 32 Gemma
fact-selection calls, with at most 500 output tokens per synthesis call. Record
actual model/schema/fallback behavior, retrieval differences and latency. Use
private execution with bounded call counts, not a public AI endpoint. These are
diagnostic cases; collect and freeze a fresh independently reviewed holdout before
calibration or production promotion. Do not turn regression labels into a new holdout.

Proposed incremental spending allowance: **US$1 for this trial**, with no plan
upgrade or recurring subscription authorized. Verify current allowances and usage
before applying it. The estimate guard is not a provider-enforced dollar cap.
Any required plan upgrade, credential scope or unexpected usage is a separate
decision before proceeding. Public AI remains disabled until rate/spending controls
and quality gates are validated.

At the checked BGE-M3 list price, the current corpus estimate alone corresponds to
about $0.0014 of embedding model usage before allowances/retries; it excludes
synthesis, Workers and Vectorize. See [Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/)
and [Vectorize pricing](https://developers.cloudflare.com/vectorize/platform/pricing/),
checked 2026-09-06. No account-wide remaining allowance or invoice is asserted.
