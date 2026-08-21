CREATE TABLE `admin_review_events` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `establishment_id` integer NOT NULL,
  `lifecycle_state` text NOT NULL
    CHECK (`lifecycle_state` IN ('baseline', 'candidate', 'verified', 'featured')),
  `validation_label` text
    CHECK (`validation_label` IS NULL OR `validation_label` IN ('known_mainstream', 'known_hidden_gem', 'not_enough_evidence', 'closed_wrong_category')),
  `validation_notes` text,
  `reviewed_at` text NOT NULL,
  FOREIGN KEY (`establishment_id`) REFERENCES `establishments`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `admin_review_events_establishment_idx` ON `admin_review_events` (`establishment_id`, `reviewed_at`);
