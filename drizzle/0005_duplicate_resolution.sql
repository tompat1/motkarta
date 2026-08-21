ALTER TABLE `establishments`
  ADD COLUMN `duplicate_resolution` text
  CHECK (`duplicate_resolution` IS NULL OR `duplicate_resolution` IN ('merged', 'keep_separate'));
--> statement-breakpoint
ALTER TABLE `establishments`
  ADD COLUMN `merged_into_establishment_id` integer;
--> statement-breakpoint
ALTER TABLE `admin_review_events`
  ADD COLUMN `action` text DEFAULT 'promote' NOT NULL
  CHECK (`action` IN ('promote', 'merge_duplicate', 'keep_separate'));
--> statement-breakpoint
ALTER TABLE `admin_review_events`
  ADD COLUMN `target_establishment_id` integer;
--> statement-breakpoint
CREATE INDEX `establishments_duplicate_resolution_idx` ON `establishments` (`duplicate_resolution`, `merged_into_establishment_id`);
