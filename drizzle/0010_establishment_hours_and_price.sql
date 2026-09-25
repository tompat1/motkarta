-- Fresh databases need these columns. Production may already have them from manual
-- provisioning before Wrangler recorded migration 0010. If apply fails with
-- "duplicate column name", record the migration instead of re-running it:
-- INSERT INTO d1_migrations (name, applied_at)
-- VALUES ('0010_establishment_hours_and_price.sql', datetime('now'));
ALTER TABLE `establishments`
  ADD COLUMN `opening_hours` text;
--> statement-breakpoint
ALTER TABLE `establishments`
  ADD COLUMN `price_sek` text;
