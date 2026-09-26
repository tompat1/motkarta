CREATE TABLE IF NOT EXISTS `admin_digest_log` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `sent_at` text NOT NULL,
  `recipient_count` integer NOT NULL DEFAULT 0,
  `summary_json` text NOT NULL
);
