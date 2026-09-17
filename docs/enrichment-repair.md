# Sourced venue enrichment repair — 2026-09-17

This repair removes fabricated completeness and adds a guarded path from the
public catalog into D1. It does not change scoring formulas or train a model.

## Data contract

- Missing hours and prices remain unknown. Category schedules and representative
  price brackets are no longer generated. Existing unsupported legacy values are
  removed by the repair command; supported values that happen to equal an old
  default are retained.
- `sourceFacts` retain source URL, source capture time and venue identity. Updates
  with older capture times cannot replace newer facts. An overlay updates a
  top-level value when missing or still owned by the previous fact, preserving
  independent edits. Failed or unrequested website scrapes do not mutate records.
- Website `priceRange` dollar symbols remain `$`–`$$$$`; explicit SEK amounts are
  parsed as amounts, never as digits indicating tiers. The existing `priceSEK`
  display field accepts either these symbols or an observed amount/range.
  Display tier thresholds use the mean of a range: below 150 / through 350 /
  through 750 / above 750 SEK. Symbols do not manufacture corresponding SEK ranges.
- Prices remain separate from the static neutral `priceLevel` ranking field.
  The existing D1 scorer compatibility default is unchanged, but the card no
  longer displays it as a venue price. No commercial platform prices are imported.
- OSM `internet_access=wlan` means Wi-Fi. `internet_access:fee=no` means free;
  `customers` is shown separately as free for customers; `yes` means paid. Missing
  fees remain unknown. `internet_access=yes` alone does not establish wireless
  access. `no` is an explicit negative. These are listed OSM facts, not independent
  verification. See [OSM tagging](https://wiki.openstreetmap.org/wiki/Key:internet_access).
- Full OSM identities take precedence. Name fallback requires a unique match
  within 100 metres and cannot override a different known OSM identity. Bulk D1
  sync requires exact identity, matching normalized name and distance within 150 m.

## Correctness fixes

Website parsing handles JSON-LD `@graph` and retains multiple daily intervals.
Date-limited exceptional hours are excluded from regular weekly schedules.
`24/7` OSM schedules are retained. The website CLI no longer fails after writing
its output. The overlay refreshes existing fact IDs rather than ignoring them.
Address enrichment no longer fabricates a street address from a district name.

Admin measures D1 counts, including both scraped and uploaded photos. Missing
storage and query errors are reported. Neither the server nor browser substitutes
historical success counts. Curated-source verification and last enrichment time
are unknown when unmeasured. The previous buttons only measured coverage; they
are replaced by an accurately labelled audit action, not a pretend sync.

## Safe synchronization

`python -m execution.repair_enrichment` defaults to a dry run and writes a before
snapshot, proposed catalog, SQL and review exclusions under `.tmp/enrichment-repair`.
It does not connect to D1. `--write` explicitly updates the local public catalog.
Use `--osm-file` and `--osm-metadata` to select a refreshed snapshot. OSM capture
metadata must reflect the fetch time, not the time a cached extraction was run.

Export D1 with Wrangler query mode (`--command`, not bulk SQL-file mode):

```sql
SELECT id,name,osm_type,osm_id,latitude,longitude,updated_at,
       opening_hours,price_sek,website,address,lifecycle_state,validation_label
FROM establishments;
```

Pass that JSON to `--d1-snapshot`. Inspect the resulting `sync.sql` and `review.json`.
The SQL:

- Preserves IDs, lifecycle, reviews, scores and existing nonempty admin fields.
- Guards writes by identity, name, timestamp and lifecycle/validation state.
- Fills only missing fields supported by source facts.
- Stores neutral provenance in `place_source_facts`, separate from scoring evidence.
- Remaps public IDs to D1 IDs in facts and photo imports.
- Imports allowed photo URLs without deleting existing photos or community uploads.
  URL inclusion is not a new visual or HTTP verification claim.
- Updates OSM-owned Wi-Fi tags without allowing stale retries to restore old claims.
- Can be reapplied without duplicate photos, facts or tags.

Apply the reviewed additive migrations `0011_public_photo_uploads.sql` and
`0012_place_source_facts.sql` before the sync. Do not use the destructive full
catalog seed. The generated Drizzle proposal was inspected and found to duplicate
an existing manual upload migration; retain the explicit, rerunnable migrations.
Run the complete test gate before writes and after catalog changes.

Keep the pre-write D1 export and catalog snapshot. For rollback, restore only
fields changed by this plan, checking that their current values still equal the
planned values and that no subsequent admin update occurred. Do not restore the
whole database or delete the upload table: subsequent user uploads must survive.

## Current limits

Unknown prices are intentionally visible as missing coverage. A new website
scrape with reliable source attribution is needed to populate them. The pipeline
does not guarantee facts for every venue. The public map still uses the deployed
static catalog first: publish the repaired catalog and frontend together after
verification; a D1 write alone does not replace an already deployed static file.
