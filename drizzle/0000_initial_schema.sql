CREATE TABLE `engagement_snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`establishment_id` integer NOT NULL,
	`search_impressions` integer NOT NULL,
	`profile_views` integer NOT NULL,
	`map_marker_clicks` integer NOT NULL,
	`saves` integer NOT NULL,
	`direction_requests` integer NOT NULL,
	`confirmed_visits` integer NOT NULL,
	`repeat_visits` integer NOT NULL,
	`recommendations` integer NOT NULL,
	`recent_saves` integer NOT NULL,
	`window_started_at` text NOT NULL,
	`window_ended_at` text NOT NULL,
	FOREIGN KEY (`establishment_id`) REFERENCES `establishments`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `engagement_establishment_idx` ON `engagement_snapshots` (`establishment_id`);--> statement-breakpoint
CREATE TABLE `establishment_tags` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`establishment_id` integer NOT NULL,
	`tag` text NOT NULL,
	FOREIGN KEY (`establishment_id`) REFERENCES `establishments`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `tags_establishment_idx` ON `establishment_tags` (`establishment_id`);--> statement-breakpoint
CREATE TABLE `establishments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`district` text NOT NULL,
	`description` text NOT NULL,
	`price_level` integer,
	`latitude` real,
	`longitude` real,
	`chain_status` text DEFAULT 'unknown' NOT NULL,
	`osm_type` text,
	`osm_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `establishments_type_district_idx` ON `establishments` (`type`,`district`);--> statement-breakpoint
CREATE INDEX `establishments_osm_idx` ON `establishments` (`osm_type`,`osm_id`);--> statement-breakpoint
CREATE TABLE `evidence_sources` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`establishment_id` integer NOT NULL,
	`source_type` text NOT NULL,
	`source_name` text NOT NULL,
	`url` text,
	`confidence` real NOT NULL,
	`captured_at` text NOT NULL,
	`summary` text,
	FOREIGN KEY (`establishment_id`) REFERENCES `establishments`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `evidence_establishment_idx` ON `evidence_sources` (`establishment_id`);--> statement-breakpoint
CREATE TABLE `rating_snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`establishment_id` integer NOT NULL,
	`rating_average` real NOT NULL,
	`reliable_rating_count` integer NOT NULL,
	`review_count` integer NOT NULL,
	`category_mean_rating` real NOT NULL,
	`captured_at` text NOT NULL,
	FOREIGN KEY (`establishment_id`) REFERENCES `establishments`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ratings_establishment_idx` ON `rating_snapshots` (`establishment_id`);--> statement-breakpoint
CREATE TABLE `score_snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`establishment_id` integer NOT NULL,
	`quality_score` real NOT NULL,
	`popularity_score` real NOT NULL,
	`relevance_score` real NOT NULL,
	`discovery_score` real NOT NULL,
	`freshness_score` real NOT NULL,
	`recommendation_score` real NOT NULL,
	`computed_at` text NOT NULL,
	FOREIGN KEY (`establishment_id`) REFERENCES `establishments`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `scores_establishment_idx` ON `score_snapshots` (`establishment_id`);--> statement-breakpoint
CREATE TABLE `specialty_coffee_attributes` (
	`establishment_id` integer PRIMARY KEY NOT NULL,
	`specialty_verified` integer NOT NULL,
	`own_roastery` integer NOT NULL,
	`traceable_coffee` integer NOT NULL,
	`filter_coffee` integer NOT NULL,
	`espresso_based` integer NOT NULL,
	`rotating_roasters` integer NOT NULL,
	`single_origin` integer NOT NULL,
	`manual_brew_methods_json` text NOT NULL,
	`decaf_available` integer NOT NULL,
	`beans_for_sale` integer NOT NULL,
	`verification_sources` integer NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`establishment_id`) REFERENCES `establishments`(`id`) ON UPDATE no action ON DELETE cascade
);
