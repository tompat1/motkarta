# Stockholm Independent Food Map

An interactive Vite/React concept for discovering Stockholm restaurants, bakeries, cafes and specialty coffee without allowing raw platform popularity to control the result.

## Local development

```bash
npm install
npm run dev
```

## What works now

- Standard Vite/React app, independent of the old Sites/vinext wrapper
- Category and text filtering across restaurants, bakeries, cafes and specialty coffee
- Separate quality, popularity, relevance, discovery and freshness dimensions
- Bayesian rating, recency weighting and exposure-adjusted engagement helpers
- Structured specialty-coffee attributes rather than keyword-only labels
- Drizzle schema for establishments, evidence sources, ratings, engagement, specialty attributes and score snapshots
- Cloudflare Pages Function at `/api/places`, with D1 when `DB` is bound and demo fallback otherwise
- Explainable demo concierge
- Explicit confidence and evidence labels
- OpenStreetMap/Overpass Python collector
- Lauren Leek-inspired residual discovery model

The visible dataset is still illustrative. The important change is that the UI scores are now computed from auditable inputs instead of hard-coded final numbers.

## Checks

```bash
npm run typecheck
npm test
npm run build
npm run validate:artifact
```

## Cloudflare deployment

Cloudflare is kept as the deployment target without making local development depend on Cloudflare or Sites:

```bash
npm run deploy:cloudflare
```

That command builds the Vite app and deploys `dist/` with Wrangler Pages. Connect the Cloudflare project/account before running it.

For the GitHub-connected Cloudflare Pages project:

- Build command: `npm run build`
- Output directory: `dist`
- Node version: `22.13.0` or newer
- D1 binding name: `DB`
- Deployment type: Cloudflare Pages static site, not Wrangler/Workers deploy

Until D1 is connected, `/api/places` returns the demo data. After creating and binding D1, run the migration and optional demo seed:

```bash
npm run db:generate
npm run db:seed:demo
wrangler d1 migrations apply <database-name> --remote
wrangler d1 execute <database-name> --remote --file drizzle/seed-demo.sql
```

## Python data pipeline

Install `requirements-python.txt`, then run:

```bash
python scripts/fetch_osm.py
```

For the residual model, enrich/merge source data into a CSV containing:

`name`, `platform_rating`, `review_count`, `price_level`, `latitude`, `longitude`, `category`, `cuisine`, `district`, `chain_status`.

Then run:

```bash
python scripts/model_discovery.py enriched_stockholm_places.csv
```

The output includes an expected platform rating, rating residual and discovery percentile. A positive residual is interpreted as *algorithmic surprise*, not intrinsic food quality.

## Research lineage

The residual approach is inspired by Lauren Leek's Open Food Map and London research. This Stockholm version changes the scope in two important ways: it starts with an open OSM baseline rather than treating a commercial API as a census, and it explicitly includes bakeries, cafés, roasters and specialty-coffee attributes.

## Production next steps

1. Replace the rough bounding box with the Stockholm municipality polygon.
2. Negotiate/verify licences for specialist guide and editorial data.
3. Add municipal food establishment and serving-permit registers.
4. Build source-aware entity matching and manual review.
5. Validate ranking weights with user testing instead of asserting objective quality.
