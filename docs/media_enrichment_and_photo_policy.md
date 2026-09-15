# Motkarta Venue Photo Enrichment Pipeline & Media Policy

This document details the architecture, scraping pipeline, verification rules, and policy invariants governing venue photos and media assets across Motkarta.

---

## 🎯 Architectural Principles & Policy Invariants

1. **Independent Open Data & Copyright Compliance:**
   - Motkarta stores and serves venue media as an exportable open dataset (`public/data/place_photos.json` and `drizzle/seed-photos.sql`).
   - Photos are sourced directly from venues' official websites (`og:image`, `twitter:image`, hero images) or open municipal portals (Visit Stockholm).

2. **Google Places Media Quarantine:**
   - **No Direct Google Photo Caching:** Google Places API Terms of Service (Section 3.2.3) prohibit storing, caching, or distributing Google Place Photos in static datasets or SQL databases.
   - **Website Bridge Strategy:** Google Places API is used strictly for **neutral metadata discovery** (fetching missing street addresses and official `websiteUri`). Once an official website URL is discovered, Motkarta's scraper extracts images directly from the business's official site metadata.

3. **Strict Visual Quality & Anti-Stock Filtering:**
   - **Generic Unsplash Stock Images:** Purged to prevent displaying generic food/coffee stock photos that do not belong to the venue.
   - **Wikimedia Commons Images:** Excluded because they are frequently historical maps, generic street pins, or non-venue specific assets.
   - **Instagram / Facebook CDN URLs:** Excluded because Meta CDN URLs (`cdninstagram.com`, `fbcdn.net`) contain short-lived security signatures that expire after hours/days, resulting in broken links and `403 Forbidden` errors.
   - **Placeholders & Favicons:** Purged so the UI displays Motkarta's official branded vector badge instead of tiny 16x16 icon squares.

---

## 🔄 Pipeline Workflow & Commands

The photo pipeline consists of three deterministic scripts designed to run sequentially:

```
┌─────────────────────────────────────────┐
│ 1. Address & Website Discovery           │
│ python3 scripts/enrich_coverage.py      │
└──────────────────┬──────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────┐
│ 2. Website & Open Data Photo Scraper    │
│ python3 scripts/fetch_place_photos.py   │
└──────────────────┬──────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────┐
│ 3. Concurrent Verification & Cleanup    │
│ python3 scripts/verify_and_clean_photos.py │
└─────────────────────────────────────────┘
```

### 1. Website & Address Discovery
Finds missing street addresses and official venue website URLs using OpenStreetMap reverse geocoding and neutral Google Places discovery:
```bash
python3 scripts/enrich_coverage.py --max-google-queries 500
```

### 2. Website OpenGraph Photo Scraper
Extracts official photos directly from venues' websites and municipal open data APIs across all venues:
```bash
python3 scripts/fetch_place_photos.py
```
> **Note:** Built with automatic fallback to Python's standard library `urllib.request` if `requests` is not installed in the execution environment. Can be run with system `python3` or `.venv/bin/python3`.

### 3. Concurrent Verification & Cleanup
Validates all photo URLs concurrently via HTTP HEAD/GET requests, purging dead links, duplicates, stock images, and expiring CDN URLs:
```bash
python3 scripts/verify_and_clean_photos.py
```

---

## 📊 Dataset Statistics & Benchmarks

| Metric | Benchmark |
| :--- | :--- |
| **Total Venues in Catalog** | 3,246 places |
| **Venues with Official Websites** | 2,001 places (61.6%) |
| **Venues with Verified Photos** | 1,231 places |
| **Total Verified Photo Objects** | 2,963+ HTTP-validated photos |
| **Duplicate URLs Purged** | ~520 duplicates |
| **Dead / 404 Links Purged** | ~180 broken links |

---

## 🎨 UI Rendering & Fallback Invariants

When loading photos in the frontend:

1. **`lib/lazy-media.ts`**: `fetchPlacePhotos(place)` loads static photos from `public/data/place_photos.json` or queries Cloudflare D1 `/api/photos`. Filters out disallowed stock, Wikimedia, and social media URLs at runtime.
2. **Branded Fallback Badge**: When a venue lacks verified photos, components ([`PlaceDetailSheet.tsx`](file:///Users/thomasrynell/proj/motkarta/src/components/PlaceDetailSheet.tsx#L163-L173), [`MobilePlaceCardList.tsx`](file:///Users/thomasrynell/proj/motkarta/src/components/MobilePlaceCardList.tsx#L103-L115)) render Motkarta's custom SVG badge (`/motkarta_drop_divided_black_red.svg`) rather than empty broken image boxes.

## Photo loading and recovery repair (September 2026)

Mobile result cards fetch photos when they enter a 300px margin around the
viewport, including results after position 25. Image probes are cancelled when the
list changes or unmounts; shared dataset requests may finish and populate the cache. List cards, the map card, and the detail sheet try the
available image URLs and distinct thumbnails in order, with an eight-second
per-image timeout, before displaying the branded badge. Concurrent requests
share the static dataset download and per-place lookup. Failed network requests
are retryable rather than permanently cached as empty results.

The official-site scraper now parses HTML metadata plus lazy `data-src` and
responsive `srcset` images, including URLs with query parameters. Exclusions
match stock/social domains and logo/icon asset names, not the broad substring
`stock` (which incorrectly excluded Stockholm URLs). Existing records are
preserved across failures and limited runs; URL merges are idempotent. Generated
SQL uses additive upserts instead of deleting the photo table.

Use an isolated output for a bounded recovery run:

```bash
python3 scripts/fetch_place_photos.py --only-missing --validate --limit 30 --workers 4 \
  --output-json .tmp/photo-repair/recovered-photos.json \
  --output-sql .tmp/photo-repair/recovered-photos.sql
```

The default existing input remains `public/data/place_photos.json`; use
`--existing-json` to resume from a staged result. Remove `--limit` for the full
missing-photo backlog. `--validate` checks newly discovered URLs with the existing
HTTP validator. It does not establish visual relevance or permission to reuse a
photo. Existing records are preserved without claiming they were revalidated.
Inspect new images before promoting the staged dataset. No paid metadata lookup
or database write is performed by this command.

`photoPlaces` counts only current catalog IDs with photo entries. Coverage
reports show `PROGRESSING` until all current venues have an entry; HTTP extraction
alone no longer produces a `verifiedPhotoPlaces` claim. Historical benchmarks
above describe previous runs, not current live coverage.

The earlier Visit Stockholm search helper was unused and accepted search-result
images without verifying venue identity. It has been removed. This scraper
currently uses official venue websites only; a municipal-photo adapter needs
verified source endpoints and venue matching before it can be enabled. Venues
without websites still need a separate website-discovery pass. The standalone
cleanup script can remove existing entries and should not be used as an additive
recovery command.
