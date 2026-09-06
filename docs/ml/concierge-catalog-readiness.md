# Concierge catalog readiness — 2026-09-05

Historical baseline: the subsequent [2026-09-06 reconciliation](concierge-reconciliation.md)
applied guarded data repairs and implemented a validated identity bridge. Its
post-repair results supersede the blockers below for the D1-backed cohort.

The authorized next-step audit read `motkarta-prod` D1 and compared it with
`public/data/places.json`. No venue rows were written, no resources were
provisioned, and no model inference or deployment occurred. Stage 5 is **not
ready for activation**: catalog identity and freshness need reconciliation first.

## Measured results

| Check | Result |
| --- | ---: |
| Public records | 3,245 |
| Live D1 records | 3,256 |
| Shared numeric IDs | **0** |
| Candidate pairs via the existing public OSM CRC32 convention | 3,191 |
| Pairs corroborated by name and location | 3,190 |
| Coordinate conflicts | 1 |
| Eligibility disagreements among paired records | 41 |
| Public closure label missing from D1 | 1 |
| Public records without an OSM-derived candidate | 54 |
| D1 records without an OSM-derived candidate | 65 |
| Paired documents with identical runtime fact hashes | **0** |
| Eligible D1 records under current runtime gates | 3,138 |

All D1 records carry OSM identities. The public pipeline uses
`zlib.crc32(type + ':' + id)`; D1 uses internal establishment IDs. The audit
checks that convention, normalized names and location agreement. A name or
32-bit hash alone is insufficient. Duplicate derived IDs are explicit blockers.
No mappings are applied.

The frontend prefers the public static dataset; concierge hydrates D1. Therefore
even a correct D1 recommendation lacks a matching map ID. The defensive UI
disables its map action. Public-snapshot vectors also fail current-ID hydration.
Translating IDs alone would not fix fact-hash compatibility.

Across all 3,191 paired records, address, area and tag serialization differ;
cuisine differs in 390 and kind in 35. D1 has **zero populated addresses**.
Most raw districts are `Stockholm`; the loader derives labels such as `Norrort`,
whereas public data uses labels such as `North Stockholm`. These differences
affect both hashes and locality admission. Some public addresses are generated
area/city placeholders, not verified street addresses; do not copy them blindly.

## Concrete review items

| Record | D1 | Public | Required resolution |
| --- | --- | --- | --- |
| Arirang, OSM `node:461665547` | ID 266; baseline, no validation label | ID 4002637501; candidate, `closed_wrong_category` | Reconcile the existing closure label and review provenance. D1 currently admits this record. |
| Sapori Italiani, OSM `node:826666676` | ID 677; coordinates `(0, 0)` | ID 93574975; `(59.2800606, 18.1081759)` | Verify source coordinates and correct the canonical record. This mapping fails corroboration. |

Unmatched records form a review queue, not automatic inserts/deletions. Public-only
examples include curated Solkant and Pascal entries; some may represent branches
already present under different identity conventions. D1-only records include
excluded chains and other OSM venues. Do not merge branches by name or delete
records simply because another export omits them.

## Prepared artifacts and replay

`execution/audit_concierge_catalog.mjs` validates four successful query result
sets, duplicate/invalid IDs, complete identity coverage and orphan evidence/tags.
It uses the runtime loader, eligibility gates and fact serializer. It writes:

- `catalog-audit.json`: counts, blockers, per-record mapping candidates, field
  differences, lifecycle conflicts and unmatched records.
- `canonical-d1.json`: normalized D1 catalog for the existing index planner,
  with input hashes for lineage.

Artifacts and logs live under `.tmp/concierge-readiness/` as regenerable local
intermediates. The audit tool makes no network calls or database writes and does
not declare production readiness even when catalog checks pass.

```text
public SHA-256: ef83d090024b9ac122a4933f2995a18d50e284ef1a93d7a85fc75c222a676514
D1 export SHA-256: 98719ca969362ae024316854217ce7c01d94e4492fe36fa7aa708b2edcfde1ba
```

Use Wrangler query mode for capture. The installed version's `--file` path uses
bulk import and returns a summary, not rows. The initial SELECT-only file run
reported zero rows written. Structured process arguments avoid SQL shell escaping:

```bash
mkdir -p .tmp/concierge-readiness
node --input-type=module - <<'JS'
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { auditSql } from './execution/audit_concierge_catalog.mjs';
const raw = execFileSync('node_modules/.bin/wrangler', [
  'd1', 'execute', 'motkarta-prod', '--remote', '--json', '--command', auditSql,
], { maxBuffer: 32 * 1024 * 1024 });
writeFileSync('.tmp/concierge-readiness/d1-export.json', raw);
JS
node execution/audit_concierge_catalog.mjs \
  --d1-export .tmp/concierge-readiness/d1-export.json
python3 execution/index_concierge.py \
  --input .tmp/concierge-readiness/canonical-d1.json \
  --index motkarta-concierge-preview-v1 \
  --output .tmp/concierge-readiness/d1-index-plan.json
```

The D1 dry run admits **3,138** records and rejects **118**, estimating **110,944
embedding input tokens** and **3,213,312 stored dimensions**. No vectors were
generated. This text-length estimate is neither tokenizer usage nor a spending
guarantee. The snapshot retains the data defects above; preparing an input does
not establish factual correctness or authorize indexing.

This is a point-in-time capture, not recent venue verification. Repeat it after
reconciliation and before indexing. Live changes still require runtime hash checks.

## Repair and preview order

1. Preserve D1 IDs and evidence/event foreign keys. Define reviewed OSM/source
   mappings for the public map and curated branches. Do not renumber D1 or run
   the destructive full seed generator.
2. Resolve closure and coordinate conflicts, then the 41 eligibility differences.
   Align locality handling without treating broad region labels as municipality
   evidence.
3. Review the 54 public and 65 D1 unmatched records. Preserve source provenance
   and lifecycle decisions; distinguish actual facts from display defaults.
4. Produce a shared canonical export or a validated client identity bridge. Test
   branch identity, closure propagation and map actions; repeat this audit.
5. Refresh the D1 index plan, then proceed to the separately authorized Cloudflare
   preview, spending controls and fresh evaluation in [Concierge RAG](concierge-rag.md).

No repair or mapping has been applied. Lexical/template defaults remain unchanged.
Validation passes: **185 JavaScript tests, 69 Python tests, typecheck, lint and
production build**. Existing bundle-size and Python platform/dependency warnings remain.
