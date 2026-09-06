# Layer 3: Execution Scripts

`reconcile_concierge_catalog.mjs` generates guarded source-fact repairs, rollback
SQL and corroborated public OSM identities/duplicate aliases. It only writes local
artifacts; see the [repair record and replay instructions](../docs/ml/concierge-reconciliation.md).

`audit_concierge_catalog.mjs` compares a read-only D1 query export with the public
catalog and writes mapping candidates, release blockers and normalized D1 index
input. See the [audit runbook](../docs/ml/concierge-catalog-readiness.md).
It never applies mappings, updates D1 or calls model providers.

This directory houses **deterministic Python scripts** or CLI utilities. The agent calls these scripts during the execution phase to perform data-heavy, repetitive, or integration tasks.

## ⚙️ Operating Rules

1. **Deterministic Execution:** The script should perform operations linearly and predictably (no generative guessing).
2. **Error Handling & Logs:** Print clear error logs, tracebacks, and statuses. Exit with non-zero exit codes (`sys.exit(1)`) on failure so the orchestrating agent can detect issues and self-anneal.
3. **Environment Isolation:** Read configurations from environment variables (`os.environ` or `.env`) — never hardcode secrets.
4. **Intermediate Storage:** Save local file exports, raw scrapings, or temporary JSON states into the `.tmp/` directory.

## 🐍 Python Best Practices

- Use standard libraries where possible.
- If dependencies are needed, document them or keep a local `requirements.txt` or `package.json` config.
- Automatically create output parent directories if they don't exist:
  ```python
  import os
  os.makedirs(os.path.dirname(output_file), exist_ok=True)
  ```

## Concierge tools

- `index_concierge.py`: dry-run by default; deterministic canonical export,
  incremental index plan and explicit-budget apply to an existing index.
- `export_concierge.mjs`: uses the production TypeScript facts/gates for identical
  corpus text and hashes (called by the Python indexer).
- `evaluate_concierge.py`: offline baseline/slice metrics without provider calls.
- `run_concierge_evaluation.mjs`: runs the actual TypeScript retrieval for evaluation.

See [the RAG runbook](../docs/ml/concierge-rag.md).
# Concierge preview

`prepare_concierge_preview.mjs` packages a verified `dist/` build into a separate
read-only Pages preview with a manifest; it does not deploy. The wrapper is
`concierge-preview-worker.ts`. `smoke_concierge_preview.mjs [PREVIEW_URL]` performs
fixed live catalog and API-isolation checks without AI. Follow
[the preview runbook](../docs/ml/concierge-preview.md) for deployment, limits and
the pending real-model trial.
