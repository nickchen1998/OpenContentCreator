CREATE TABLE `public_pages` (
	`owner_id` integer PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`published` integer DEFAULT false NOT NULL,
	`draft` text NOT NULL,
	`live` text,
	`draft_avatar_key` text DEFAULT '' NOT NULL,
	`draft_cover_key` text DEFAULT '' NOT NULL,
	`live_avatar_key` text DEFAULT '' NOT NULL,
	`live_cover_key` text DEFAULT '' NOT NULL,
	`updated_at` text NOT NULL,
	`published_at` text,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `public_pages_slug_unique` ON `public_pages` (`slug`);