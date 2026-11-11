ALTER TABLE `comments` ADD `parent_external_id` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `comments` ADD `mine` integer DEFAULT false NOT NULL;