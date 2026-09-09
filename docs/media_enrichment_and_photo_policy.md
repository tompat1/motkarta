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
