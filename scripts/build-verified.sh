#!/usr/bin/env bash
set -euo pipefail

echo "🔍 Running 4-Tier Mandatory Quality & Full Test Coverage Gate..."
npm run typecheck
npm run lint
npm test
npm run test:python
npm run test:e2e

echo "📦 Building production bundle..."
vite build
rm -rf dist/admin
cp dist/index.html dist/admin
cp dist/index.html dist/admin.html
node scripts/build-pages-functions.mjs
bash scripts/validate-artifact.sh
