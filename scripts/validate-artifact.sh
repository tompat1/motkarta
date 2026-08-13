#!/usr/bin/env bash
set -euo pipefail

if [[ ! -f dist/index.html ]]; then
  echo "dist/index.html is missing. Run npm run build first." >&2
  exit 69
fi

if ! find dist/assets -type f \( -name "*.js" -o -name "*.css" \) | grep -q .; then
  echo "Built JS/CSS assets are missing from dist/assets." >&2
  exit 69
fi

if [[ ! -f dist/data/places.json ]]; then
  echo "dist/data/places.json is missing. Run npm run mvp before npm run build." >&2
  exit 69
fi

node -e "
const fs = require('node:fs');
const payload = JSON.parse(fs.readFileSync('dist/data/places.json', 'utf8'));
const first = payload.places?.[0];
if (payload.source !== 'osm' || !payload.places?.length || typeof first?.latitude !== 'number' || typeof first?.longitude !== 'number') {
  console.error('dist/data/places.json must contain OSM places with latitude/longitude.');
  process.exit(69);
}
"

echo "Validated Vite artifact: dist/index.html, bundled assets and OSM coordinate data are present."
