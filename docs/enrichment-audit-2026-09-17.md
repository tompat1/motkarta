# Core enrichment audit — 2026-09-17

The pipeline does not obtain reliable images, addresses, opening hours, prices
and Wi-Fi information for every place. Missing values are sometimes replaced
with category guesses or geographic placeholders, and coverage reporting hides
real gaps. Public JSON and production D1 contain substantially different data.

## Measured public coverage

Read-only snapshots were fetched from `https://motkarta.rynell.org/data/places.json`
and `/data/place_photos.json`. Their bytes match the local public files. These
counts use all **3,198 catalog records**, before publication filtering; they are
not counts of currently visible map markers.

| Field | Observed coverage | Interpretation |
| --- | --- | --- |
| Images | 1,188 places have photo entries (37.1%); 2,010 lack entries | URLs have not all been checked for availability or venue relevance. |
| Addresses | 3,198 nonempty; only 837 (26.2%) contain a number before the first comma | Nonempty does not mean a usable street address. The number check is a heuristic, not verification. |
| Opening hours | 2,184 have an hours source fact (68.3%); 1,007 have default hours without an hours source fact | All records contain hours, but completeness is inflated by generated schedules. Source facts are not a guarantee of current accuracy. |
| Prices | 3,189 (99.7%) match generic price brackets; zero have a `priceSEK` source fact | The remaining nine values are not independently verified. All static `priceLevel` values are intentionally neutral (`0`). |
| Wi-Fi | Zero Wi-Fi tags or source facts found | Unknown connectivity is not represented as a usable sourced field. |

There are 1,956 website URLs. Of the 2,010 places without photos, 768 have a
website and 1,242 do not. Re-running the website photo scraper alone cannot
address the latter group.

Of the 1,188 photo-bearing places, 66 have no URL that passes the current
scraper's exclusion rules. That is a filtering finding, not proof of 66 broken
images. The photo file's metadata still claims 1,213 photographed places out of
3,246, which is not the current catalog intersection.

The raw OSM cache contains 121 elements with internet-access-related tags; 112
match current catalog identities. Those include explicit negative values, not
112 confirmed Wi-Fi venues. The cache reports a fetch date of August 13, 2026.

## Critical findings

### 1. Generated values become apparent facts

[`execution/apply_enrichment.py`](../execution/apply_enrichment.py), lines 61–90,
only fills empty hours from source facts, then inserts restaurant/café schedules
and price brackets to achieve “100% coverage.” Once a default is present, a
subsequent real hours fact does not replace it. Existing facts with the same ID
also do not refresh their values.

[`scripts/fetch_place_hours_and_prices.py`](../scripts/fetch_place_hours_and_prices.py),
lines 375–420, similarly inserts default hours and writes derived/default prices
across the catalog, including places not successfully scraped. Request limits
do not limit these record mutations. In
[`lib/concierge/facts.ts`](../lib/concierge/facts.ts), top-level hours and prices
can then become listed catalog facts without distinguishing generated values.

### 2. Coverage reporting conceals missing database data

Read-only production D1 queries found **3,256 establishments**, of which:

- 453 have nonempty addresses and 846 have websites.
- Zero have opening hours, SEK prices or price levels: those columns are NULL.
- Neither `place_photos` nor `place_photo_uploads` exists.

The photo API sample returned `{"source":"unavailable","placeId":329797914,"photos":[]}`.
The committed public-upload feature still requires its production table migration;
code deployment alone did not provision storage. Scraped-photo storage is missing
too. No migration or seed was applied during this investigation.

[`functions/api/admin/coverage.ts`](../functions/api/admin/coverage.ts), lines
141–171, substitutes historical counts when actual counts are zero or photo
queries fail. For example, zero D1 hours becomes 3,246 reported hours. The
dashboard therefore cannot currently serve as evidence of enrichment success.

### 3. The public app and D1 do not share one enrichment result

[`lib/place-payload.ts`](../lib/place-payload.ts), lines 21–30, prefers the static
catalog. Updating D1 alone will not update those public records. The API fallback
has a different merged population: the live `/api/places` response contained
3,260 records, with only nine nonempty hours/SEK price values from its additional
catalog content. These API counts must not be mistaken for D1 column coverage.

[`lib/place-records.ts`](../lib/place-records.ts), line 355, also defaults an
unknown D1 price level to `2`. Unknown prices should remain distinguishable from
a sourced medium price tier.

## Reproduced extraction defects

These were reproduced locally with isolated fixtures, without paid requests or
production writes:

| Input/operation | Actual result | Relevant code |
| --- | --- | --- |
| Schema `priceRange: "145 SEK"` | Tier 4, `750–1600`, because the string contains `4` | `scripts/fetch_place_hours_and_prices.py:273` |
| Restaurant hours inside JSON-LD `@graph` | No hours extracted | Same file, JSON-LD parser |
| Monday lunch 11–14 and dinner 17–22 | Only `Mo 17:00-22:00` survives | Same file, `format_osm_opening_hours` |
| Real hours applied over generated hours | Top-level generated hours remain | `execution/apply_enrichment.py:61` |
| Two distant venues with the same name | Both receive one OSM element's hours | `execution/enrich_catalog.py:135`; fallback has no distance check |
| Default hours/price CLI on a minimal catalog | Writes guessed values, then raises `KeyError('total_with_price_level')` | `scripts/fetch_place_hours_and_prices.py:429` |

Additional gaps found by inspection:

- OSM CSV extraction and enrichment omit internet-access/Wi-Fi fields. The
  enrichment extractor also skips valid `24/7` hours.
- Website HTML cache reads have no freshness limit. The broad website fact
  extractor removes scripts and footers, losing JSON-LD and common hours content.
- The hours/price scraper primarily reads the homepage; it does not comprehensively
  traverse menus/contact pages or render JavaScript.
- Address enrichment can replace a missing address with `area, Stockholm` and
  clear the missing-address tag. Website discovery in that path is conditional
  on a missing address, so other missing websites are skipped.
- Photo `--only-missing` checks whether entries exist, not whether old URLs still
  work. New-image URL validation is optional. Output JSON/SQL is not automatically
  applied to D1.
- No scheduled enrichment workflow was found in the repository. External
  scheduling was not established by this audit.

## Recommended repair order

1. Remove generated hours and unlabelled price assumptions from factual coverage;
   retain explicit unknown/estimated states. Make Admin report measured counts,
   source, freshness and errors, with no historical success fallback.
2. Repair identity matching, JSON-LD graph traversal, split hours, numeric prices,
   refresh semantics and the CLI failure. Preserve valid existing data on scrape
   failure. Add regression fixtures for each reproduced defect.
3. Ingest OSM Wi-Fi information with source attribution, distinguishing yes/no/
   unknown and fees. Restore usable street addresses and discover missing websites.
4. Define a guarded per-place synchronization path between enrichment outputs,
   D1 and the public catalog. Apply additive photo migrations and seed/import
   validated photos through that path.
5. Refresh photos and other facts in resumable batches with freshness limits,
   retry/error reporting and a manual review queue for unresolved places.

Do not use the full seed as an enrichment repair: `scripts/generate_seed_sql.mjs`
deletes establishments and dependent datasets. The legacy
`scripts/enrich_coverage.py` photo SQL also starts with `DELETE FROM place_photos`.
Preserve the documented Google metadata-only and ML data boundaries.

The realistic target is sourced data wherever discoverable, plus visible unknowns
and a review queue. The current pipeline cannot guarantee all five facts for
every venue, and filling every field is not equivalent to obtaining those facts.

## Verification and scope

This investigation changed documentation only. No production records, credentials,
Access policies or paid enrichment services were modified. Evidence and offline
reproduction scripts are in `.tmp/enrichment-audit/` (ignored intermediates).
The existing code's full verification gate passed in this session: TypeScript,
365 JavaScript tests, 146 Python tests and 93 browser tests, followed by a successful
production build. Existing tests do not cover all defects above; some explicitly
expect category price fallbacks. Passing tests therefore do not establish data
accuracy or completeness.
