# Current proposal: multilingual, evidence-grounded RAG concierge

2026-09-06 catalog repair authorized by “Pls run”:

Completed: 454 guarded D1 updates applied and verified; all original IDs preserved.
Local identity bridge, source locality gates, importer safeguards and validation
pass. See [the repair record](docs/ml/concierge-reconciliation.md). Code remains
undeployed; no paid inference or Vectorize mutation occurred.

- Refresh D1, retain its IDs, and generate guarded updates only for corroborated
  source street addresses, invalid coordinates and the existing closed label.
- Rehearse updates and rollback locally; retain the before snapshot and inspect
  exact field changes before executing any repair. Do not insert/delete venues,
  replace evidence, promote labels or enable paid inference/deployment.
- Add full OSM identity to public/server records and validate map joins by that
  identity, name and location; preserve existing public IDs and saved/media keys.
- Separate source locality evidence from derived region labels and reject
  coordinates outside the established Stockholm bounding envelope.
- Run identity, stale-update, rollback, lifecycle, geography, HTTP/map and full
  test/build checks. Re-audit, documenting unmatched venues without guessing merges.

Next-step audit authorized by “so continue pls”: read the configured D1 catalog,
compare identity/eligibility/fact hashes with the public snapshot, and prepare a
reproducible canonical D1 index input and reconciliation report. Do not apply ID
mappings, database mutations, paid inference or deployment. Validate the audit
against malformed snapshots, duplicate identities and mismatched venue records;
run the repository test/build gates and document measured release blockers.

Status: stages 1–4 approved and implemented locally on 2026-09-05.
See the [implementation/runbook](docs/ml/concierge-rag.md) and
[evaluation record](docs/ml/concierge-evaluation.md). Cloud resources, paid
inference and deployment remain inactive.

The review, architecture, implementation sequence, acceptance criteria and
baseline results are in [the RAG implementation plan](docs/ml/rag-implementation-plan.md).
The previously completed source-boundary plan is retained below.

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
