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

If the deployment log says `No build command specified. Skipping build step.`,
set the Pages build command in the Cloudflare dashboard to `npm run build`.
The repo also includes `wrangler.toml` with `pages_build_output_dir = "dist"`
so Pages knows where the built assets belong.

Until D1 is connected, `/api/places` returns the demo data. After creating and binding D1, run the migration and optional demo seed:

```bash
npm run db:generate
npm run db:seed:demo
wrangler d1 migrations apply <database-name> --remote
wrangler d1 execute <database-name> --remote --file drizzle/seed-demo.sql
```

## Python data pipeline

The project scope is now split deliberately:

- Python owns data collection, normalization, scoring experiments, ML discovery
  models and RAG document preparation.
- TypeScript/React owns the deployed UI and Cloudflare Pages integration.

Install `requirements-python.txt`, then run:

```bash
python scripts/fetch_osm.py
```

This writes `data/stockholm_food_places.csv`. Convert that CSV into D1 import SQL with:

```bash
npm run db:seed:osm
```

The generated file is `drizzle/seed-osm.sql`. It upserts OSM places by
`osm_type` + `osm_id`, stores OSM as source evidence, and normalizes categories
into the five establishment types:

- `restaurant`, `fast_food`, `food_court` -> `Restaurant`
- cuisine/category values containing `bistro` -> `Bistro`
- `bakery`, `pastry`, `confectionery` -> `Bakery`
- `cafe` -> `Café`
- `coffee`, `coffee_roaster` -> `Specialty coffee`

An ordinary OSM café is not promoted to specialty coffee just because its cuisine
mentions coffee; specialty coffee needs a structured OSM coffee shop/roaster
category or later editorial/source verification.

## Manual evidence enrichment

OSM is a baseline, not proof of quality. Add curated or licensed evidence with a
JSON file using the shape in `examples/evidence.sample.json`, then generate SQL:

```bash
npm run db:seed:evidence -- examples/evidence.sample.json drizzle/seed-evidence.sql
wrangler d1 execute <database-name> --remote --file drizzle/seed-evidence.sql
```

Evidence records match an existing place by `osmType` + `osmId`, or by exact
name as a fallback. Each evidence item must declare:

- `sourceType`: `specialist_guide`, `editorial`, `verified_user_rating`,
  `inspection`, `official_site`, `community_submission`, or `osm`
- `sourceName`
- `confidence` from `0` to `1`
- optional `url`, `capturedAt`, and `summary`

Specialty-coffee attributes can be updated in the same record, but should only
be set from recognized guides, editorial review, your own verification, or
consistent community submissions.

## Score snapshots

Scores can be recomputed into `score_snapshots` after importing OSM and evidence.
Export current D1 rows, combine them, generate score SQL, then apply it:

```bash
wrangler d1 execute <database-name> --remote --json --file scripts/export_places.sql > data/place-export.json
wrangler d1 execute <database-name> --remote --json --file scripts/export_evidence.sql > data/evidence-export.json
wrangler d1 execute <database-name> --remote --json --file scripts/export_tags.sql > data/tag-export.json
npm run db:scores:combine -- data/place-export.json data/evidence-export.json data/tag-export.json data/score-input.json
npm run db:scores -- data/score-input.json drizzle/score-snapshots.sql
wrangler d1 execute <database-name> --remote --file drizzle/score-snapshots.sql
```

This preserves raw evidence separately from computed score snapshots, so score
changes can be audited and rerun as the model improves.

For the residual model, enrich/merge source data into a CSV containing:

`name`, `platform_rating`, `review_count`, `price_level`, `latitude`, `longitude`, `category`, `cuisine`, `district`, `chain_status`.

Then run:

```bash
python scripts/model_discovery.py enriched_stockholm_places.csv
```

The output includes an expected platform rating, rating residual and discovery percentile. A positive residual is interpreted as *algorithmic surprise*, not intrinsic food quality.

Run Python tests with:

```bash
python3 -m pytest tests_python
```

The Python package lives in `motkarta/`:

- `motkarta.normalize`: OSM/category normalization
- `motkarta.scoring`: score formulas for ML/data workflows
- `motkarta.rag`: retrieval document preparation

## Python MVP pipeline

The agreed MVP covers restaurants, bistros, bakeries, cafés and specialty
coffee. The Python pipeline produces the core artifacts:

```bash
python scripts/fetch_osm.py
.venv/bin/python scripts/run_mvp_pipeline.py
```

Outputs:

```text
data/stockholm_food_places_clean.csv
data/stockholm_food_places_deduped.csv
data/stockholm_food_duplicates.csv
data/stockholm_food_places_scored.csv
outputs/stockholm_food_map.html
outputs/stockholm_food_places.geojson
outputs/coverage_report.md
outputs/rag_corpus.jsonl
public/data/places.json
```

The Folium map includes filter layers for establishment type, cuisine,
neighbourhood and missing information. The GeoJSON export is the migration path
for a later Leaflet, MapLibre, Mapbox or CARTO app. `public/data/places.json`
is the deployable static dataset used by the Vite app before falling back to
the Cloudflare API/demo path. The RAG corpus powers a simple local concierge:

```bash
.venv/bin/python scripts/query_concierge.py "filter coffee roaster"
```

The shorthand refresh flow is:

```bash
npm run mvp:fetch
npm run mvp
npm run build
```

## Research lineage

The residual approach is inspired by Lauren Leek's Open Food Map and London research. This Stockholm version changes the scope in two important ways: it starts with an open OSM baseline rather than treating a commercial API as a census, and it explicitly includes bakeries, cafés, roasters and specialty-coffee attributes.

## Production next steps

1. Replace the rough bounding box with the Stockholm municipality polygon.
2. Negotiate/verify licences for specialist guide and editorial data.
3. Add municipal food establishment and serving-permit registers.
4. Build source-aware entity matching and manual review.
5. Validate ranking weights with user testing instead of asserting objective quality.
