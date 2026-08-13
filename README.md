# Stockholm Independent Food Map — proof of concept

An interactive concept for discovering Stockholm restaurants, bakeries, cafés and specialty coffee without allowing raw platform popularity to control the result.

## What works in the POC

- Category and text filtering
- Four transparent ranking modes
- Separate quality, popularity and discovery dimensions
- Explainable demo concierge
- Explicit confidence and evidence labels
- OpenStreetMap/Overpass Python collector
- Lauren Leek-inspired residual discovery model

The visible dataset and scores are illustrative. They are not presented as published ratings.

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
