# Concierge production v1

Status: approved on 2026-09-09. Implementation and controlled Cloudflare
activation are in progress on `codex/concierge-production-v1`, with a maximum
new provider-test allowance of US$1.

## Goal and subsystem boundary

Fix the confirmed Swedish pizza-query failures and productionize the existing
evidence-grounded Gemma 4 concierge without weakening D1 authority, lifecycle,
chain, geography, evidence, or protected-fact gates. The primary owner is
concierge intent/retrieval/synthesis. Global scorer weights, hidden-gem policy,
personalization, recommendation-event learning, and D1 schema are unchanged.

## Implementation stages

1. Release `concierge-lexical-v3`: normalize Swedish pizza inflections, treat
   conversational “stan” as broad Stockholm rather than Gamla Stan, and prevent
   generic venue names such as “Pizza” from capturing category searches. Add
   catalog-backed regression coverage for Swedish category and area phrasing.
2. Harden `concierge-synthesis-v3` against the nine trial failure modes while
   preserving strict fact-ID validation, fixed venue order, protected server
   rendering, and deterministic template fallback.
3. Add a supported Cloudflare rate gate and configuration for Workers AI,
   Vectorize, an explicit minimum similarity, and independently switchable
   retrieval/synthesis modes. Keep AI off when the limiter is absent or fails.
4. Refresh the read-only D1/catalog audit and verify the existing trial index.
   Do not bind stale hashes or repeat the exhausted trial calls. Any new model
   calls must use a new persistent ledger capped by the approved US$1 allowance.
5. Deploy an isolated AI-enabled preview, run production-shaped HTTP/browser
   smoke tests and inspect fallback, latency, constraint, and cost behavior.
6. Activate production in two reversible steps: constrained Gemma synthesis over
   corrected lexical retrieval first; hybrid retrieval only after a fresh,
   independently reviewed holdout establishes a serving threshold. If that
   quality gate is not met, leave hybrid disabled and report the blocker rather
   than promoting an uncalibrated index.

## Risks and rollback

- Swedish normalization can overmatch venue names; category aliases must remain
  separate from distinctive exact-name intent.
- “Stan” is colloquial and ambiguous; broad Stockholm must not silently claim a
  narrower district.
- Gemma can return empty, malformed, extra, reordered, or truncated selections;
  strict validation and template fallback remain mandatory.
- Rate limiting is not an account-wide billing cap. Bound calls, preserve the
  usage ledger, configure Cloudflare spending controls, and fail to lexical/
  template when the gate or provider is unavailable.
- A stale Vectorize document must fail current D1 hash hydration. Roll synthesis
  back to template first and retrieval to lexical second without reverting the
  language and safety fixes.

## Verification

- Baseline and final TypeScript, JavaScript, Python, and Playwright suites.
- Focused intent, exact-name, retrieval, provider, synthesis, compiled-worker,
  and production-shaped API tests.
- Fresh D1/index hash/count audit before any binding promotion.
- Preview checks for Swedish pizza queries, excluded chains, unsupported facts,
  latency deadlines, rate denial, malformed model output, and deterministic
  fallback.
- `git diff --check` and the mandatory `npm run test:gate` before build, deploy,
  push, or completion.

---

# Desktop hero redesign 3

Status: direction 1, **The Living Counter-Map**, completed and verified.

## Goal

Redesign the desktop hero, concierge search, and filter region into a single
appetizing, high-craft discovery surface while preserving MOTKARTA's existing
search, concierge, filtering, QR sync, localization, and map behavior.

## Product and brand invariants

- Keep Stockholm and the discovery map—not generic food glamour—as the hero.
- Use only existing brand tokens: Ink, Paper, Water Blue, Signal Red; square
  editorial geometry; Archivo Condensed, Inter, and IBM Plex Mono.
- Use real catalog/venue imagery with honest attribution where photography is
  presented as evidence. Any generated image must be clearly illustrative.
- Keep the existing Swedish and English product claims. Do not add invented
  metrics, superlatives, live-data claims, or paid-ranking ambiguity.
- Preserve native button/input semantics, keyboard access, visible focus,
  44-pixel targets, 200% zoom support, and a deliberate reduced-motion path.
- Limit the redesign to the desktop hero/concierge/filter composition; retain
  the established mobile control and bottom-sheet flows.

## Candidate directions

1. **The Living Counter-Map (recommended).** A cartographic editorial stage
   with a real Stockholm street-grid fragment, blue evidence points, one red
   moving crosshair, and a small contact sheet of real venue/craft imagery.
   Search becomes a prominent concierge dispatch line; type and cuisine
   filters become an indexed evidence rail. Motion responds to focus and filter
   changes rather than looping decoratively. Moderate implementation cost,
   strong brand fit, and graceful CSS/SVG fallbacks.
2. **Stockholm Market Table.** A photo-led, newspaper-market composition built
   around three documentary venue images, crop labels, and an editorial search
   ticket. Filters behave like movable market slips and selected cuisine
   changes the featured image. Most appetizing and immediately emotional, with
   a higher image-loading budget and more dependency on photo quality.
3. **Concierge After Dark.** An Ink-led command surface where query text
   activates a luminous-but-flat evidence route through neighborhoods, followed
   by compact image shutters and a kinetic filter index. Most dramatic and
   technically ambitious, but darker, less immediately food-forward, and more
   sensitive to motion/performance tuning.

## Planned implementation after approval

1. Refactor the desktop-only hero and controls markup in `src/App.tsx` into a
   coherent discovery stage while retaining the existing state and handlers.
2. Add focused, reusable CSS for composition, responsive reflow, interaction
   states, authored motion, reduced motion, and image loading fallbacks in
   `src/styles.css`.
3. Reuse verified local/data-backed assets where possible; add only the minimal
   optimized image assets needed by the selected direction.
4. Extend focused React/source tests for preserved search, concierge, filter,
   localization, and accessibility contracts if markup changes require them.
5. Run the Impeccable detector once over changed UI targets, perform one batched
   browser QA pass at mobile/tablet/desktop/wide widths plus keyboard and reduced
   motion, fix findings in one batch, and confirm once.
6. Run `git diff --check` and the mandatory four-tier `npm run test:gate` before
   declaring completion.

## Risks

- Remote catalog images can be slow or unavailable; the design needs resilient
  placeholders and should avoid layout shift.
- A visually dense filter panel can become harder to scan; hierarchy and
  progressive disclosure must preserve direct access to common filters.
- Hero motion can distract from map discovery or cause discomfort; it must be
  bounded, state-driven, paused when hidden, and reduced when requested.
- Desktop-specific composition can regress intermediate widths; 768, 1200, and
  wide desktop layouts require explicit verification while mobile behavior stays
  unchanged.

## Result

- Rebuilt the desktop hero as an editorial counter-map with a bounded animated
  route, responsive evidence markers, and three verified venue photo stories.
- Unified the concierge and filters into a high-contrast discovery deck while
  preserving existing search, prompt, filter, QR sync, and selection behavior.
- Preserved the established mobile UI below 768 pixels and added explicit
  reduced-motion, focus, image-fallback, and intermediate-width handling.
- Verified at 320, 768, 900, 1440, and 1800 pixel widths, then passed the full
  repository gate: typecheck, 216 JavaScript tests, 83 Python tests, and 27
  Playwright end-to-end flows.

---

# Mobile filter parity

Implement the requested desktop filter parity on mobile:

- Render the shared seven type options in the black mobile panel, with the same labels and selection handlers as desktop.
- Replace the four obsolete tag sections with the shared, data-driven cuisine options in the popup.
- Use canonical type/cuisine state across both layouts; Saved uses the existing desktop type filter.
- Remove the nonfunctional Open now control (it has no hours evaluator), obsolete mobile tag definitions, and duplicate mobile select controls. Preserve the existing desktop dog-friendly filter.
- Keep cuisine selection, result count, active indicator, and reset synchronized. Add dialog keyboard/focus handling and responsive layout.

Risks: stale duplicated filter state, hidden saved restrictions, narrow-screen overflow, and losing selections on language/viewport changes. Scoring, taxonomy, telemetry contracts, data, and deployment are outside this UI change.

Verification: filter regression tests, full `npm test`, `npm run build`, diff checks, and local browser checks of type/cuisine selection, reset, localization, and mobile/desktop parity.

---

# Current work: bounded real-model RAG Concierge trial

Completed the approved one-time US$1 trial after the build/deployment
repair: 3,143 verified vectors, 128 successful query captures, and 23/32 synthesis
outputs accepted by strict validation. Nine outputs require template fallback.
The remaining work is relevance labeling, source enrichment and schema/prompt
hardening before any public activation. Production deployment `d947add9-a120-4ec0-accf-66da3faffc8f` is verified;
public concierge remains lexical/template. See the
[repair record](docs/build-deployment-repair.md) and
[real-model trial record](docs/ml/concierge-real-model-trial.md).

Implement and run the approved diagnostic scope:

1. Refresh D1 read-only, audit identity/fact consistency, and preserve all IDs.
2. Populate only `motkarta-concierge-preview-v1` with up to 3,143 eligible records
   and 150,000 estimated input tokens; verify every current document hash/count.
3. Capture up to 128 real query embeddings/searches and 32 constrained Gemma
   responses, capped at 500 output tokens each, with a persistent usage ledger.
4. Share production hydration/prompt/render helpers with offline replay; test
   parity, provider contracts, citation rejection and safe resumption.
5. Report actual results, limitations and cost reserves. Run full JavaScript,
   Python and production-build checks and update canonical documentation.

Risks: sparse source facts, uncalibrated similarity thresholds, provider latency,
invalid model output and asynchronous index mutation. Keep existing gates and
fallbacks. Captured fixture prompts are diagnostics, not an untouched D1 holdout.
No public AI activation, D1 mutation or subscription upgrade is authorized by
this trial. Existing stages 1–4, catalog repairs, identity bridge, geolocation
fixes and lexical preview are complete; see the linked canonical records.

---

# Stockholm-only curated and scraped source plan

Status: approved and implemented.

## Goal

Ensure curated and scraped place inputs are focused on, and limited to,
Stockholm municipality so Tasstipset, curated open-source records, candidate
queues and future ML/RAG concierge workflows cannot pull venue records from the
rest of Sweden.

## Findings

- The OSM baseline already uses the Overpass administrative area named
  `Stockholms kommun`.
- Tasstipset's live Stockholm page is scoped to Stockholm, but
  `scripts/fetch_tasstipset_dog_places.py` defaults to crawling the full
  country-wide sitemap.
- The Tasstipset scraper currently filters with a broad Greater Stockholm county
  check and defaults ambiguous page areas to `Stockholm`, which allows non-
  Stockholm pages to pass.
- `scripts/sync_curated_sources.py` neutralizes popularity/rating fields but
  does not reject curated records outside Stockholm before adding or merging.
- `scripts/build_candidate_queue.py` accepts curated submissions without a
  Stockholm boundary guard, so future ML/RAG candidate work could inherit
  out-of-scope records.
- `public/data/places.json` currently contains Tasstipset rows whose source URLs
  or addresses clearly point to other Swedish cities such as Umeå, Göteborg,
  Malmö, Linköping and Borgholm.

## Proposed Changes

1. Add a shared Python geography helper, tentatively
   `motkarta/stockholm_boundary.py`, as the canonical source-boundary guard.
   - Treat the app scope as Stockholm municipality/city, aligned with the OSM
     baseline, not all of Stockholms län.
   - Accept known Stockholm districts/neighborhoods such as Södermalm,
     Norrmalm, Vasastan, Östermalm, Kungsholmen, Gamla stan, Farsta, Kista,
     Vällingby, Skärholmen, Hägersten, Årsta, Bromma, Rinkeby, Husby, Akalla
     and Fjäderholmarna.
   - Reject known neighboring municipalities and non-Stockholm city tokens such
     as Solna, Sundbyberg, Nacka, Lidingö, Sollentuna, Täby, Göteborg, Malmö,
     Umeå, Linköping and Borgholm.
   - Use coordinates as a supporting guard with the existing Stockholm
     municipality bounding box only when present.

2. Tighten the Tasstipset importer.
   - Default scraping to Tasstipset's Stockholm city page/subpages instead of the
     country-wide sitemap.
   - Keep any sitemap crawl as an explicit opt-in debugging/import mode, still
     filtered through the shared Stockholm-only guard.
   - Stop using `Greater Stockholm` wording in output metadata and CLI copy.
   - Filter records through the shared guard before both matching/enrichment and
     new-place insertion.
   - Avoid letting a missing area/address default to `Stockholm` become proof of
     Stockholm scope.

3. Tighten neutral curated-source syncing.
   - Reject or skip non-Stockholm curated records before `neutral_place()` can
     insert or merge them.
   - Keep the existing forbidden-value/rating/popularity neutrality checks
     unchanged.
   - Report skipped out-of-scope counts in the returned summary.

4. Tighten candidate queue ingestion.
   - Filter curated submission entries through the same Stockholm boundary guard
     before they can become ML/RAG review candidates.
   - Leave baseline OSM, Stockholms stad food-control and Google metadata paths
     otherwise unchanged, since they are already Stockholm-oriented by source or
     query.

5. Clean the current generated/public data.
   - Remove Tasstipset-derived records that fail the new Stockholm boundary.
   - Preserve legitimate Stockholm Tasstipset enrichments and tags.
   - Update derived totals in `public/data/places.json`.

6. Update docs.
   - Add the Stockholm municipality source-boundary rule to the ML data
     contracts/runbook so future hidden-gem training and RAG concierge work
     inherits the correct geographic cohort.
   - Note that this is a data-boundary correction, not a ranking/model-semantic
     change.

## Tests

- Add Python unit tests for the shared Stockholm boundary helper.
- Add Tasstipset scraper tests proving Stockholm page records pass while
  Göteborg/Umeå/Malmö/Linköping/Borgholm and neighboring municipality records
  are excluded.
- Add curated-source sync tests proving out-of-scope records are skipped and not
  merged.
- Add candidate-queue tests proving out-of-scope curated submissions do not
  become candidate entries.

## Verification

Run:

```bash
.venv/bin/python -m pytest -q
npm test
npm run typecheck
npm run build
git diff --check
```

Also run a data audit after cleanup to confirm no Tasstipset rows in
`public/data/places.json` reference obvious non-Stockholm city tokens or rejected
municipality tokens.

## Risks

- A coordinate-only bounding box can include small areas outside the municipality;
  the helper should prefer explicit accepted/rejected locality text when
  available.
- Some Stockholm district names are also street or brand terms; tests should
  cover clear examples and keep the boundary helper conservative.
- Cleaning generated data can produce a large diff. The cleanup should be
  deterministic and narrowly scoped to out-of-bound curated/scraped records.

## Result

- Added the shared `motkarta.stockholm_boundary` guard.
- Defaulted Tasstipset scraping to the Stockholm page/subpage path and made
  sitemap crawling explicit opt-in.
- Enforced Stockholm scope in Tasstipset sync, curated source sync and curated
  candidate-queue ingestion.
- Regenerated `outputs/tasstipset_dog_places_stockholm.json` from the live
  Stockholm page: 285 records, 0 out of scope.
- Cleaned `public/data/places.json`: 3,245 total records, 0 out-of-scope
  dog/Tasstipset records.
- Updated ML data-contract and operations docs.
- Verified with Python, Node, TypeScript, build and diff checks.
