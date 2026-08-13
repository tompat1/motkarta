-- Export evidence rows for score computation.
-- wrangler d1 execute <database-name> --remote --json --file scripts/export_evidence.sql > data/evidence-export.json

SELECT establishment_id, source_type, source_name, confidence, captured_at
FROM evidence_sources
ORDER BY captured_at DESC, id DESC;
