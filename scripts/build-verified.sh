#!/usr/bin/env bash
set -euo pipefail

npm run typecheck
npm run lint
vite build
rm -rf dist/admin
cp dist/index.html dist/admin
cp dist/index.html dist/admin.html
node scripts/build-pages-functions.mjs
bash scripts/validate-artifact.sh
