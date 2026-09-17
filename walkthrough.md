# Cloudflare CMS login repair — 2026-09-16

The screenshot's CMS dialog used hard-coded demo passwords and local browser
flags. It now offers **Sign in with Cloudflare**, using the site's existing
Access-protected `/api/admin/login` path and a verified return to the public
editor. The token alternative also verifies credentials against the server.

Removed the demo bypass and local-storage authorization helpers. CMS checks its
session on load, focus and authentication changes; expired sessions disable
editing. Token login synchronizes the public Admin controls. Cloudflare logout
clears the Access session. JWT verification now requires issuer and expiration,
rejects malformed tokens and safely handles malformed cookies. Session responses
are not cached. The dialog accurately states that CMS copy edits remain local
to the browser; this change does not add shared CMS publishing.

Read-only production checks confirmed that the custom domain already redirects
Admin paths to Cloudflare Access and has JWT verification and an email allowlist
configured. No new account or policy is needed for the integration. Existing
allowed-email settings were not changed. See `docs/admin-login.md` for login,
configuration and rollout details.

Verification: `npm run test:gate` passed TypeScript checking, all 365 JavaScript
tests, all 146 Python tests and all 93 browser tests across desktop Chrome,
mobile Chrome and mobile Safari. The new browser coverage includes successful
token login, forged local flags, rejected demo passwords, the Cloudflare login
button, verified return to the editor and expired-session rejection. The
production build and its required repeated verification gate are running.

No production deployment, credential change or Access-policy write has been
performed. Deploy the API and frontend together through the normal Pages release
workflow to activate the new public CMS login button.

---

# Persistent public map-card photo uploads — 2026-09-16

The public map-card uploader now saves image bytes and metadata in D1 through
`POST /api/photo-upload`. It waits for a successful write before showing success
and leaves a failed submission available for retry. New map uploads no longer
write image data to browser storage.

- Added the additive, rerunnable `drizzle/0011_public_photo_uploads.sql` migration
  and the matching Drizzle schema. A separate upload table prevents website
  scraper seeds and cleanup jobs from erasing community images.
- Added size-bounded request reading, JPG/PNG/WebP signature checks, caption
  validation, cross-origin checks and an atomic limit of 20 uploads per venue
  in a rolling day. Images are limited to 1 MiB after browser optimization.
- Resolved public/D1 ID differences through full OSM identity. Admin lists
  uploaded and scraped photos together; authenticated upload deletion removes
  the bytes and metadata in one operation.
- Added an image-serving endpoint and fresh API lookups alongside static photos.
  New uploads are visible across browsers, and deleted uploads are not retained
  in a static or local image cache.
- Added SQLite endpoint tests for persistence, Admin access/deletion, identity,
  validation, limits and unavailable storage. Added browser coverage for failed
  upload/retry, a venue with an existing static photo, a fresh browser context
  and deletion visibility. Updated the old permanent-cache test to verify the
  new refresh contract.

Verification: `npm run test:gate` passed TypeScript checking, all 362 JavaScript
tests, all 146 Python tests and all 87 Playwright tests across desktop Chrome,
mobile Chrome and mobile Safari (zero failures). The initial browser launch
was blocked by the sandbox's local-port restriction; the complete gate passed
with local-server access. `git diff --check` passed.

Rollout: apply `drizzle/0011_public_photo_uploads.sql` before deploying the API
and client together. The existing D1 binding is sufficient. No production
migration or deployment was performed during this task. The implementation is
now in commit `47b41fe`; this final verification update was written afterward.
Detailed commands and limits are in `docs/media_enrichment_and_photo_policy.md`.

Previously stored local-only photos require re-uploading through the map card.
The legacy concierge/new-place photo attachment flows retain their existing
behavior. Uploads are public immediately; Admin can delete them, but this change
does not introduce a pre-publication approval queue.

---

# Cloudflare build import repair — 2026-09-16

The supplied Cloudflare build log failed in `tests/place-filtering.test.mjs`
with `ERR_MODULE_NOT_FOUND` for `lib/db-sources-prompts`. The Belgian cuisine
test imports `src/app/shared.ts` directly through Node, exposing extensionless
runtime imports that TypeScript's bundler resolution accepts.

Added explicit `.ts` extensions to the shared module's local imports and
re-exports, and changed the scoring types to a declaration-level `import type`
so they are erased at runtime. Documented this requirement in the testing and
deployment directive. The existing six place-filtering tests reproduce the
failure before the fix and all pass afterward; no new test is needed.

Verification: `npm run test:gate` passed TypeScript checking, 338 JavaScript
tests, 146 Python tests, and all 81 Playwright tests across desktop Chromium,
mobile Chrome, and mobile Safari. Local verification used Node 26.7.0; the
supplied Cloudflare log used Node 22.16.0. The initial sandboxed browser run could
not bind port 4173; the full gate passed with local server access enabled.

`npm run build` also passed its repeated four-tier gate, Vite production build,
Pages worker compilation, and artifact validation. The existing large JavaScript
chunk warning remains. `git diff --check` passed. Changes are local; no commit,
push, or deployment was performed.

---

# Venue photo loading and enrichment repair

Mobile cards now request photos as they approach the viewport instead of stopping
at the first 25 results. List cards, the map card, and the detail sheet try later
images and distinct thumbnails when an image fails, with bounded timeouts and
cancellation when the selected venue/list changes. Concurrent photo lookups share
the static dataset download and per-place requests. Failed network lookups are
retryable rather than cached forever as empty results.

A pre-existing map refactor had removed the `MobilePlaceCardList` render and left
an unmatched JSX closing expression in `App.tsx`. Restored the list and removed
the stray expression while retaining the mounted map and its mobile visibility
class. The map gallery now excludes the actual selected hero image rather than
always hiding its first image.

The official-site scraper now allows legitimate Stockholm URLs, parses metadata,
lazy images and responsive image candidates, excludes named stock/social domains
and logo/icon assets (including encoded resize URLs), and avoids repeated image
size variants. Scrapes merge into existing photos; partial runs or temporary
website failures cannot erase earlier records. Added missing-only, bounded,
isolated-output and HTTP-validation options. Generated SQL uses upserts rather
than clearing the photo table. Coverage counts current catalog IDs and reports
PROGRESSING until the stated 100% photo-entry target is reached.

The unused Visit Stockholm search helper was removed: it had no verified venue
identity matching and was never used in the collection flow. Municipal-source
support needs a separate verified adapter. No scoring, place taxonomy, paid
metadata calls, production database writes, or deployments were performed.

A 30-venue official-website recovery trial produced 28 HTTP-checked candidate URLs
across 11 previously empty entries. The final icon rules reject three of those;
other candidates include shared property-owner images that need venue/source and
visual review. All 2,945 existing photo records were preserved. Recovery files
and the per-candidate review report are in `.tmp/photo-repair/`; they have not been
merged into the public dataset or applied to D1. HTTP success alone is not visual
verification or a claim of venue-specific photo coverage.

Verification: production build passed its full gate with TypeScript/lint,
324 JavaScript tests, 146 Python tests, and 54 Playwright tests across desktop
Chromium, mobile Chrome, and mobile Safari. The photo regression scrolls beyond
result 25, verifies fallback from a broken first URL, checks the shared dataset
request, and opens the working photo in detail/map views. Additional unit tests
cover cancellation, timeouts, retryable failures, responsive extraction,
non-destructive partial runs, and accurate coverage. Python was rerun after the
last asset-rule refinement. Compiled Pages worker and artifact validation passed;
the existing large JavaScript chunk warning remains.

Browser tests now use port 4173 with a separate Vite cache, preventing the stale
`Outdated Optimize Dep` responses encountered when reusing a development server.
Screenshots use Playwright's per-test output paths instead of developer-specific
home directories. These operational findings are recorded in the testing directive.

---

# Catalog cleanup and Tasstipset restrictions

O'Learys is excluded across all branches, spelling variants, public list/map
results, API fallbacks, concierge retrieval and import paths. The catalog removes
three O'Learys records and 47 venues created solely from Tasstipset, including
both STF Stockholm hostels. The catalog now contains 3,196 venues. Removed
Tasstipset identities are recorded in `lib/catalog-exclusions.json`; matching
seed rows and dependent tags/evidence have been removed.

Tasstipset may only enrich an existing Restaurant, Bakery, Café, Coffee shop,
Coffeeshop or Specialty coffee venue. The importer only adds dog-friendly tags
and an attributed dog-policy fact. It cannot create venues/candidates, change
other venue fields, promote lifecycle or increase quality/guide evidence. Source
categories outside the permitted food categories, including missing categories,
are rejected. Ambiguous or distant matches are skipped, and repeated imports
are idempotent. Curated imports and catalog fact enrichment follow this boundary.

Git history from `11b02b4`, `1f5b6e0` and `1ab8ede` identified earlier Tasstipset
side effects. Only values still matching those changes were restored: 283
specialist-guide evidence values and 157 evidence labels. Retained IDs,
dog-friendly tags and other subsequent venue edits are preserved.

The hostel bug came from accepting lodging as food and coercing unsupported
venue kinds to Restaurant. Unknown categories now remain unknown and cannot be
imported. Coverage verification measures enrichment of existing eligible venues,
while continuing to report whole-directory coverage separately: 150/167 existing
references are tagged (89.8%); whole-directory coverage is 53.8%. There are 164
dog-friendly catalog venues and no Tasstipset-only or ineligible tagged records.

Production build and compiled Cloudflare worker/artifact validation passed.
Final `npm run test:gate` passed: TypeScript type checking, 307 JavaScript tests,
140 Python tests and all 45 Playwright tests across desktop Chromium, Mobile
Chrome and Mobile Safari. `git diff --check` and the catalog/seed exclusion
audit also passed. The build retains the existing large-JavaScript-chunk warning.

No database migration, model training, paid inference, direct deployment or
production database mutation was performed. Scorer/model formulas and versions
are unchanged; this corrects catalog admission and source-evidence inputs.
Operational contracts, rollback and source policy are documented in
`docs/ml/operations-runbook.md`, `docs/ml/data-contracts.md`,
`docs/ml/architecture.md` and `directives/ml_recommendation_system.md`.
