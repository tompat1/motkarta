# Layer 1 Directive: Testing & Deployment Verification Gate

## Goal
Enforce mandatory 100% full test coverage verification across all 4 system layers before code completion, pushing commits to remote, deploying to Cloudflare Pages, or syncing dataset updates.

## Mandatory 4-Tier Verification Gate

Every AI agent and contributor working on Motkarta MUST run and verify 100% clean passes across all four testing tiers before declaring work finished, running `git push`, deploying via `npm run deploy:cloudflare`, or committing synced dataset files.

```bash
npm run test:gate
# Equivalent to:
npm run typecheck && npm run lint && npm test && npm run test:python && npm run test:e2e
```

### The 4 Tiers

1. **Tier 1 — TypeScript & Static Types (`npm run typecheck`):**
   - Compiles TypeScript without emitting output (`tsc --noEmit`).
   - Ensures strict prop types, component interface compliance, and backend/frontend type safety.

2. **Tier 2 — React & Core Logic Unit Tests (`npm test`):**
   - Executes Vitest unit tests (`node scripts/run-tests.mjs`).
   - Tests React components, state hooks, Bayesian scoring, distance calculations, filter logic, and concierge handlers.

3. **Tier 3 — Python ML & Data Pipeline Suite (`npm run test:python`):**
   - Executes Pytest suite (`python3 -m pytest tests_python`).
   - Tests OpenStreetMap ingestion, place deduplication, residual ML discovery models, OpenGraph photo scrapers, and data normalization.

4. **Tier 4 — Playwright E2E Integration Suite (`npm run test:e2e`):**
   - Executes Playwright cross-browser tests (`playwright test`).
   - Verifies real browser behavior on Desktop Chromium, Mobile Chrome (Pixel 5), and Mobile Safari (iPhone 12).
   - Validates page rendering, category filter pills, search input, mobile bottom sheet controls (VISA, SORTERA, Formula modal), hamburger menu, scroll-to-top, list/map view toggle, and device sync modal.

### Lint quality gate

`npm run lint` is part of `npm run test:gate`. It runs ESLint (`eslint.config.mjs`) and Ruff (`pyproject.toml`) for the former Sourcery categories: refactoring, bug risk, performance, and security. Ignore catalog dumps under `public/data`. Advisory AI PR comments belong in Cursor Bugbot, not a quota-limited review SaaS.

---

## When to Run the Gate

| Action | Required Gate Command |
| :--- | :--- |
| **Completing Any Task** | `npm run test:gate` |
| **Building Production Assets** | `npm run build` (Automatically triggers full gate in `scripts/build-verified.sh`) |
| **Git Push / Syncing Commits** | `npm run test:gate && git push` |
| **Cloudflare Pages Deployment** | `npm run deploy:cloudflare` |
| **Dataset Enrichment & Sync** | `npm run test:gate` after running sync scripts (`sync_curated_sources.py`, `google_places_monthly_sync.py`, `fetch_place_photos.py`, `verify_and_clean_photos.py`) |

---

## Self-Annealing & Troubleshooting Protocol

If any tier fails during execution:

1. **Stop & Read Stack Trace:** Never ignore a failure or try to bypass it.
2. **Isolate the Failing Tier:** Run the specific command (e.g. `npx playwright test tests_e2e/mobile-controls.spec.ts`) to reproduce.
3. **Fix Root Cause:** Fix the code logic or update the test contract if business logic intentionally evolved. Never mock out or comment out broken tests to force a pass.
4. **Re-run the Combined Gate:** Verify `npm run test:gate` passes completely.
5. **Update Living Docs:** Record edge cases or newly discovered test requirements in this directive.

## Local browser test isolation

Playwright uses port 4173 and `node_modules/.vite-e2e` (via `MOTKARTA_E2E=1`).
It starts its own server instead of reusing an active development server. A
shared Vite cache produced HTTP 504 `Outdated Optimize Dep` failures before any
application code ran; inspect browser network errors when a page stays blank.
Keep screenshots under `testInfo.outputPath(...)`, not absolute paths in a
developer home directory. Photo-loading regressions use local image fixtures
with one failing URL and one working URL, and scroll beyond result 25.

## Node TypeScript import resolution

The JavaScript unit suite runs with Node's native TypeScript stripping, without
Vite's module resolver. Modules imported by these tests (including transitive
imports and re-exports) must use explicit `.ts` extensions for local runtime
dependencies. Use `import type` for type-only dependencies. TypeScript's
`moduleResolution: bundler` can accept extensionless imports that fail at runtime
with `ERR_MODULE_NOT_FOUND`; a passing typecheck alone does not verify them.
The cuisine-label tests in `tests/place-filtering.test.mjs` exercise a direct
import of `src/app/shared.ts` and catch this build regression.

## Admin publication controls

Removal must be tested across the static-first public loader, D1/API fallback,
and concierge union. Do not verify only the admin success message. Use isolated
SQLite and browser fixtures for removal/restoration; never modify production
venues as a test. Verify full OSM identity across differing public/D1 IDs and
that a failed status read cannot resurrect a stale static record. Deploy the
visibility endpoint and its client together. See `docs/ml/operations-runbook.md`.

## Public photo persistence

For map-card uploads, verify the actual handlers against isolated SQLite:
image bytes and metadata must persist together, a different public/D1 ID must
resolve through full OSM identity, authenticated Admin deletion must remove the
bytes, and malformed/oversized/over-limit uploads must fail without a success
response. Never test uploads against production venues. Browser fixtures must
exercise failed upload/retry and retrieval from a new browser context, including
a venue that already has a static website photo. Do not assert permanent
in-memory caching of public photo lists: those lists must refresh to observe
uploads and Admin deletions. Run `npm run test:gate` after changes.

## CMS authentication

CMS tests must authorize through `/api/admin/session` fixtures, never by seeding
`motkarta_cms_auth` or using a demo password. Keep explicit negative coverage for
forged localStorage/sessionStorage, failed/redirected session responses and
expired sessions. Cloudflare return parameters are navigation state only; test
that the server must still authorize editing. Use locally generated signing
keys for JWT tests, including missing issuer/expiration and invalid signatures;
do not generate real login emails or change production Access policies in tests.

## Enrichment accuracy and synchronization

Test numeric SEK prices separately from dollar symbols, split daily hours,
JSON-LD graphs, same-name branches, failed/limited scrapes, stale fact refreshes,
and OSM Wi-Fi fee states. Coverage zeroes and missing tables must remain visible
in both API and browser. Validate D1 repair SQL against isolated SQLite, including
idempotency, ID remapping, admin-edit guards and stale Wi-Fi retries. Use additive
photo migrations and guarded updates; never use the full destructive seed as an
enrichment repair. See `docs/enrichment-repair.md`.
