# Layer 1 Directive: Testing & Deployment Verification Gate

## Goal
Enforce mandatory 100% full test coverage verification across all 4 system layers before code completion, pushing commits to remote, deploying to Cloudflare Pages, or syncing dataset updates.

## Mandatory 4-Tier Verification Gate

Every AI agent and contributor working on Motkarta MUST run and verify 100% clean passes across all four testing tiers before declaring work finished, running `git push`, deploying via `npm run deploy:cloudflare`, or committing synced dataset files.

```bash
npm run test:gate
# Equivalent to:
npm run typecheck && npm test && npm run test:python && npm run test:e2e
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
