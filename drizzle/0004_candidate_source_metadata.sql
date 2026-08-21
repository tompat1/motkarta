ALTER TABLE `establishments`
  ADD COLUMN `address` text;
--> statement-breakpoint
ALTER TABLE `establishments`
  ADD COLUMN `website` text;
--> statement-breakpoint
ALTER TABLE `establishments`
  ADD COLUMN `candidate_source_type` text;
--> statement-breakpoint
ALTER TABLE `establishments`
  ADD COLUMN `candidate_source_id` text;
--> statement-breakpoint
ALTER TABLE `establishments`
  ADD COLUMN `candidate_review_status` text;
--> statement-breakpoint
ALTER TABLE `establishments`
  ADD COLUMN `candidate_allowed_use` text;
--> statement-breakpoint
CREATE UNIQUE INDEX `establishments_candidate_source_unique_idx` ON `establishments` (`candidate_source_type`,`candidate_source_id`);
