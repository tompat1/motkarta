CREATE TABLE `recommendation_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`establishment_id` integer NOT NULL,
	`anonymous_user_id` text,
	`session_id` text NOT NULL,
	`event_type` text NOT NULL,
	`result_position` integer,
	`recommendation_mode` text NOT NULL,
	`query_context_json` text,
	`model_version` text NOT NULL,
	`occurred_at` text NOT NULL,
	FOREIGN KEY (`establishment_id`) REFERENCES `establishments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `recommendation_events_establishment_idx` ON `recommendation_events` (`establishment_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `recommendation_events_session_idx` ON `recommendation_events` (`session_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `recommendation_events_model_idx` ON `recommendation_events` (`model_version`,`event_type`);