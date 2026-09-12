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
