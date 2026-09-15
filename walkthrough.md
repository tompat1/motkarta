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
