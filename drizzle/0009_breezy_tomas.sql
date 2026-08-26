ALTER TABLE `recommendation_events` ADD `idempotency_key` text;--> statement-breakpoint
ALTER TABLE `recommendation_events` ADD `received_at` text;--> statement-breakpoint
ALTER TABLE `recommendation_events` ADD `expires_at` text;--> statement-breakpoint
ALTER TABLE `recommendation_events` ADD `schema_version` text;--> statement-breakpoint
ALTER TABLE `recommendation_events` ADD `privacy_version` text;--> statement-breakpoint
CREATE UNIQUE INDEX `recommendation_events_idempotency_idx` ON `recommendation_events` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `recommendation_events_retention_idx` ON `recommendation_events` (`expires_at`);