# Concierge catalog reconciliation — 2026-09-06

The requested repair has been applied to `motkarta-prod`. **454 establishment
records were updated without changing any IDs**. The related map/loader code is
implemented and tested locally on `main`; it has not been deployed. AI flags
remain disabled and no model inference or Vectorize mutation was performed.

## Applied data changes

- Filled 453 previously missing addresses from explicit OSM street and house-number
  fields. Generated public area/city placeholders were not copied.
- Corrected Sapori Italiani, D1 ID 677 / OSM `node:826666676`, from `(0, 0)` to
  `(59.2800606, 18.1081759)`, corroborated against the source OSM row and public export.
- Propagated Arirang's existing `closed_wrong_category` label and source review
  note to D1 ID 266 / OSM `node:461665547`, changing baseline to candidate. This
  transfers an existing exclusion; it is not a new claim of independent verification.

Some changes concern the same record, so there are 454 affected records. Every
UPDATE checks ID, OSM identity, name, original field values, original review state
and `updated_at`. A fresh read checked all preconditions before application.
UPDATE result IDs were checked in batches of 30, followed by a complete readback.
All establishment IDs, evidence records and tags remained unchanged. No venues,
evidence or tags were inserted/deleted, and no database schema migration was needed.

The complete repair and rollback were rehearsed in SQLite against the captured
catalog. Rollback restored every original column and preserved 3,567 evidence
foreign-key references. The rollback SQL also checks post-repair values/timestamp,
so it cannot overwrite a later edit without failing its guard. Partial application
must be inspected and re-planned; the tooling does not silently relax guards.

## Identity and locality contract

D1 and public numeric IDs intentionally remain separate. The public snapshot now
carries 3,191 full `osmIdentity` values and `idNamespace: public`; the D1 loader
and cards carry `idNamespace: d1` and full OSM identities. Original public IDs and
saved/media keys are unchanged. The OSM pipeline preserves identity on new exports.

The existing `data/stockholm_food_duplicates.csv` supplies 22 additional OSM aliases.
The reconciliation checks the indexed source rows, names, kept venue and coordinates
before adding aliases. Seventeen eligible D1 duplicate records use this bridge;
the other five aliases concern excluded chains and cannot bypass eligibility.
This is a map identity bridge, not a database merge or a preference/quality label.

Map selection requires a unique identity, compatible name and location within
150 metres. Spacing differences are allowed only for explicit duplicate aliases.
Ambiguous, closed or mismatched records fail closed. The UI passes the resolved
public ID to the map instead of the D1 card ID. No fuzzy name lookup is used for
structured concierge responses.

The D1 loader retains the raw source district in `sourceArea`. Locality gates
consider it alongside the displayed region, address and source URL. Thus a derived
label such as `Norrort` does not erase source Stockholm locality evidence; explicit
outside-municipality text still rejects the record. The established Stockholm
bounding envelope rejects impossible coordinates but never proves municipality
membership by itself. TypeScript and Python follow these admission rules.

Chain exclusions now cover the apostrophe-normalized McDonald's spelling, Sibylla,
and exact-name MAX, consistent with existing OSM import exclusions. The exact MAX
rule does not exclude an unrelated `Max's Café` by substring.

The CSV reader handles quoted multiline values and missing numeric fields remain
NULL instead of becoming zero. The OSM SQL generator uses explicit street/number
fields and preserves existing coordinates when an incoming coordinate is missing.
These prevent missing-source fields from reintroducing the defects.

## Results with the local runtime and live D1 readback

| Check | Result |
| --- | ---: |
| Existing D1 IDs preserved | 3,256 / 3,256 |
| Eligible D1 records | 3,143 |
| Eligible records resolving to public map venues | 3,143 / 3,143 |
| D1 index records with matching current fact hashes | 3,143 / 3,143 |
| Mapped coordinate/identity conflicts | 0 |
| Mapped eligibility disagreements | 0 |
| Unpropagated mapped closure labels | 0 |

These are local contract checks against a live snapshot, not observations of the
currently deployed concierge. Public and D1 documents still differ; the index is
built from D1-normalized records, not from the presentation export. Audit v2 tests
that index contract and the identity bridge independently rather than requiring
both catalogs to share numeric IDs or identical presentation fields.

There are still 54 public-only entries outside the D1 retrieval cohort. They need
source/branch review before import; this repair does not claim complete public
catalog coverage. Existing D1 duplicate records are retained, not merged. Passing
catalog checks does not establish model quality or production readiness.
Recommendation-event identity attribution is outside this map bridge; the existing
shadow telemetry foundation still requires its separate validation before learning.

The refreshed index dry run admits 3,143 and rejects 113 records. It estimates
114,962 input tokens and 3,218,432 stored dimensions; no vectors were generated.
The text-length token estimate is not a billing guarantee.

## Versions and validation

- Admission/ranking paths: `concierge-lexical-v2`, `concierge-hybrid-v2`,
  `concierge-python-lexical-v2`.
- Corpus/prompt/global scorer unchanged: `concierge-facts-v1`,
  `concierge-synthesis-v1`, `transparent-scorer-v1.1`.
- Tool contracts: `concierge-reconciliation-v1`, `concierge-catalog-audit-v2`.
- 194 JavaScript tests, 70 Python tests, typecheck, lint and build pass. Existing
  bundle-size and Python dependency/platform warnings remain.
- Browser checks using captured D1 responses pass for Drop Coffee Roasters and
  the Spiga Madre → Spigamadre duplicate alias; no browser runtime errors.
- The 128-query synthetic regression retains NDCG@5 0.929 and unsupported-query
  abstention 100%. It is not a fresh holdout or a real-model quality measurement.

## Replay, artifacts and next step

`execution/reconcile_concierge_catalog.mjs` defaults to local planning only. It
outputs a field-level plan, guarded repair/rollback SQL, a projected snapshot and
public identity metadata. It does not execute SQL, deploy or call model providers.
Always inspect the generated plan and rehearse before an authorized application.
Re-run identity/alias reconciliation after regenerating the public catalog; stale
duplicate-row mappings fail validation rather than guessing.

```bash
node execution/reconcile_concierge_catalog.mjs \
  --d1-export .tmp/concierge-repair/after.json \
  --output .tmp/concierge-repair/replay
node execution/audit_concierge_catalog.mjs \
  --d1-export .tmp/concierge-repair/after.json \
  --output .tmp/concierge-repair/final
node execution/audit_concierge_catalog.mjs \
  --d1-export .tmp/concierge-repair/after.json \
  --index-input .tmp/concierge-repair/final/canonical-d1.json \
  --output .tmp/concierge-repair/final
```

The applied plan, pre/post snapshots, guarded rollback, applied IDs, rehearsal,
evaluation and browser artifacts are under `.tmp/concierge-repair/`. Retain them
when reviewing or reversing the applied repair. A new planner run against the
repaired catalog proposes **zero database updates**.

```text
Applied plan timestamp: 2026-09-06T10:22:01.260Z
Repair SQL SHA-256: 0fddf93f79d5f35eb92b54ba91161c2d291fed0630f2822882c8d0084d315fb7
Post-repair export SHA-256: 048097df15ccc2f820b71eb146eda54c44a20555c348e1aaa67ca6c6a513220b
```

Next is a controlled preview deployment of the tested code, followed by separately
budgeted model/index testing and fresh relevance labels. See
[Concierge RAG](concierge-rag.md). No preview deployment or paid inference is
included in this repair.
