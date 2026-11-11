ALTER TABLE `connections` ADD `last_polled_at` text;--> statement-breakpoint
ALTER TABLE `post_targets` ADD `external_post_id` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `post_targets` ADD `sync_error` text DEFAULT '' NOT NULL;