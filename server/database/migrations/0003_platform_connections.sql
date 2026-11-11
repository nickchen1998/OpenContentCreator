CREATE TABLE `connections` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`account_id` integer NOT NULL,
	`external_id` text NOT NULL,
	`external_name` text DEFAULT '' NOT NULL,
	`token_enc` text NOT NULL,
	`app_secret_enc` text NOT NULL,
	`token_expires_at` text,
	`auto_send` integer DEFAULT true NOT NULL,
	`last_event_at` text,
	`last_error` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `connections_account_id_unique` ON `connections` (`account_id`);--> statement-breakpoint
CREATE INDEX `connections_external_idx` ON `connections` (`external_id`);--> statement-breakpoint
ALTER TABLE `comments` ADD `kind` text DEFAULT 'comment' NOT NULL;--> statement-breakpoint
ALTER TABLE `comments` ADD `external_id` text;--> statement-breakpoint
ALTER TABLE `comments` ADD `external_post_id` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `comments` ADD `sender_id` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `comments` ADD `error` text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `comments_external_idx` ON `comments` (`account_id`,`external_id`);--> statement-breakpoint
ALTER TABLE `reply_rules` ADD `channel` text DEFAULT 'comment' NOT NULL;