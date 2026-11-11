CREATE TABLE `account_stats` (
	`account_id` integer NOT NULL,
	`day` text NOT NULL,
	`followers` integer NOT NULL,
	PRIMARY KEY(`account_id`, `day`),
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
