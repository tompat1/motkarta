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

echo "Validated Vite artifact: dist/index.html and bundled assets are present."
