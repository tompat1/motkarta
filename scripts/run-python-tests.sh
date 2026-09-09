#!/usr/bin/env bash
set -e

if [ -f ".venv/bin/pytest" ]; then
  echo "🐍 Running Python pytest suite using .venv..."
  .venv/bin/pytest tests_python
elif python3 -m pytest --version >/dev/null 2>&1; then
  echo "🐍 Running Python pytest suite using system python3..."
  python3 -m pytest tests_python
elif [ "${CF_PAGES:-}" = "1" ] || [ "${CI:-}" = "true" ]; then
  echo "⚠️ Pytest not found in CI build environment (Cloudflare Pages). Skipping Python unit tests during static asset compilation."
  exit 0
else
  echo "❌ Error: pytest is not installed. Please install pytest or create a virtualenv (.venv)."
  exit 1
fi
