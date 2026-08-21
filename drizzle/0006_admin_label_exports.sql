CREATE TABLE `admin_label_exports` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `exported_at` text NOT NULL,
  `event_count` integer NOT NULL DEFAULT 0,
  `label_count` integer NOT NULL DEFAULT 0,
  `duplicate_resolution_count` integer NOT NULL DEFAULT 0,
  `exported_by` text,
  `notes` text
);
--> statement-breakpoint
CREATE INDEX `admin_label_exports_exported_at_idx` ON `admin_label_exports` (`exported_at`);
