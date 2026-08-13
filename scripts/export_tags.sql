-- Export tag rows for score computation.
-- wrangler d1 execute <database-name> --remote --json --file scripts/export_tags.sql > data/tag-export.json

SELECT establishment_id, tag
FROM establishment_tags
ORDER BY tag ASC;
