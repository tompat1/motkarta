#!/usr/bin/env bash
set -e

if [ "${CF_PAGES:-}" = "1" ]; then
  echo "⚠️ Skipping Playwright E2E tests in Cloudflare Pages build container (no browser binaries)."
  exit 0
fi

if npx playwright --version >/dev/null 2>&1; then
  echo "🎭 Running Playwright E2E tests..."
  npx playwright test "$@"
else
  echo "⚠️ Playwright CLI not available. Skipping E2E tests."
  exit 0
fi
