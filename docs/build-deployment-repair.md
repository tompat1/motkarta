# Pages build and deployment repair — 2026-09-06

The repaired build is deployed to production: deployment
`d947add9-a120-4ec0-accf-66da3faffc8f`, status `success`.
[motkarta.pages.dev](https://motkarta.pages.dev) passed live asset/catalog and
concierge checks. Pages reports output `dist` and production CPU limit 1,000 ms.
Retrieval/synthesis remain lexical/template; no model calls or migrations occurred.

The supplied log shows Vite completing successfully before Cloudflare's automatic
Wrangler 3.114.17 parser rejects `with { type: 'json' }` in the concierge imports.
The same failure was confirmed in the latest production build log. The imports
are required by the repository's native Node TypeScript execution; removing them
would exchange a deployment error for a test/CLI error.

## Changes

- `npm run build` now compiles all Pages Functions using pinned Wrangler 4.92.0,
  emits executable `dist/_worker.js` and generated `_routes.json`, and validates
  the complete deployable artifact. Pages advanced mode uploads the compiled
  server without reparsing the TypeScript Functions source with the older builder.
- Wrangler 4's `--outfile` emits a multipart upload payload. The build instead
  uses `--outdir`, checks that there is exactly one output module, and copies the
  executable module. Artifact validation imports and exercises that module so a
  multipart file or missing API/admin handlers cannot pass unnoticed.
- Compiled-worker checks cover static asset forwarding, concierge body/origin
  validation, missing-D1 behavior and unauthenticated admin rejection.
- The existing neutral-source validator now recognizes the already-approved
  Tasstipset catalog source. Commercial-value/source exclusions remain intact.
- GitHub CI uses Node 22. The test runner explicitly enables TypeScript stripping
  through inherited `NODE_OPTIONS`, including CLI subprocesses on Node 22.16.0.
- Root Wrangler configuration includes the 1,000 ms CPU limit already validated
  against the live catalog in preview. AI modes remain lexical/template.
- Preview preparation uses `dist` instead of `site`, keeping the project output
  directory consistent with production. A Pages upload can update that shared
  build setting even when the deployment branch is a preview.

## Verification

- Exact Cloudflare runtime from the user's log: Node 22.16.0.
- Complete build and compiled-worker validation pass on that runtime.
- All 203 JavaScript tests pass on Node 22.16.0; 74 Python tests pass (including
  four tests for the separately approved, paused RAG trial).
- Live build preview: [6beccd34.motkarta.pages.dev](https://6beccd34.motkarta.pages.dev).
  Root page and catalog return 200; concierge returns D1-backed lexical/template
  results; closed/chain requests abstain; unauthenticated admin access is rejected.
- Existing Vite bundle-size and Python dependency/platform warnings remain.

Run `npm test` and `npm run build` before deploying. Logs and live-check artifacts
are under `.tmp/build-repair/`. The build remains `npm run build` with Pages output
`dist`; no dashboard workaround for JSON imports is needed once these changes
are committed and pushed to the Git-connected branch.

RAG trial status at the user's reprioritization: one empty isolated Vectorize
index was created; no embeddings, synthesis calls or vector inserts occurred.
The US$1 approval remains recorded for continuation after deployment repair.
