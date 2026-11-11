CREATE TABLE `account_posts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`account_id` integer NOT NULL,
	`external_id` text NOT NULL,
	`url` text DEFAULT '' NOT NULL,
	`text` text DEFAULT '' NOT NULL,
	`published_at` text NOT NULL,
	`views` integer DEFAULT 0 NOT NULL,
	`likes` integer DEFAULT 0 NOT NULL,
	`comments` integer DEFAULT 0 NOT NULL,
	`shares` integer DEFAULT 0 NOT NULL,
	`saves` integer DEFAULT 0 NOT NULL,
	`insights_at` text,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `account_posts_external_idx` ON `account_posts` (`account_id`,`external_id`);--> statement-breakpoint
CREATE INDEX `account_posts_published_idx` ON `account_posts` (`account_id`,`published_at`);--> statement-breakpoint
ALTER TABLE `connections` ADD `last_synced_at` text;