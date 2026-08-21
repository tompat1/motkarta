-- Export admin review events for labeled-set generation.
-- wrangler d1 execute <database-name> --remote --json --file scripts/export_review_events.sql > data/review-events-export.json

SELECT
  ev.id AS event_id,
  ev.establishment_id,
  e.name,
  e.candidate_source_type,
  e.candidate_source_id,
  e.duplicate_resolution,
  e.merged_into_establishment_id,
  ev.lifecycle_state,
  ev.validation_label,
  ev.validation_notes,
  ev.action,
  ev.target_establishment_id,
  ev.reviewed_at
FROM admin_review_events ev
JOIN establishments e ON e.id = ev.establishment_id
ORDER BY ev.reviewed_at DESC, ev.id DESC;
