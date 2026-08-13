DROP INDEX `establishments_osm_idx`;--> statement-breakpoint
CREATE UNIQUE INDEX `establishments_osm_unique_idx` ON `establishments` (`osm_type`,`osm_id`);