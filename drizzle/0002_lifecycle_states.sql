ALTER TABLE `establishments`
  ADD COLUMN `lifecycle_state` text DEFAULT 'baseline' NOT NULL
  CHECK (`lifecycle_state` IN ('baseline', 'candidate', 'verified', 'featured'));
--> statement-breakpoint
ALTER TABLE `establishments`
  ADD COLUMN `validation_label` text
  CHECK (`validation_label` IS NULL OR `validation_label` IN ('known_mainstream', 'known_hidden_gem', 'not_enough_evidence', 'closed_wrong_category'));
--> statement-breakpoint
ALTER TABLE `establishments`
  ADD COLUMN `validation_notes` text;
--> statement-breakpoint
CREATE INDEX `establishments_lifecycle_idx` ON `establishments` (`lifecycle_state`);
