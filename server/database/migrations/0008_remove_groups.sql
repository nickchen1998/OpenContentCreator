-- 移除「帳號群組」：帳號、貼文、規則直接歸屬到會員（owner_id），專案的優先序與權限搬到 projects 上。
--
-- 這份是手寫的，不是 drizzle-kit 產生的那份（snapshot 仍是它產生的）。原因：
-- 1. owner_id 要從 groups.owner_id 帶過來，自動產生的版本會從還沒有這個欄位的舊表讀。
-- 2. accounts / posts 要整張重建（SQLite 不能 DROP 有外鍵的欄位），而 D1 不能關掉外鍵檢查：
--    DROP TABLE 會觸發子表的 ON DELETE CASCADE，把連結、留言、成效等資料一起刪掉。
--    所以先把所有子表備份到暫存表，重建完再用 INSERT OR IGNORE 還原（沒被刪的會被略過）。
PRAGMA defer_foreign_keys = true;
--> statement-breakpoint
CREATE TABLE `_bak_connections` AS SELECT * FROM `connections`;
--> statement-breakpoint
CREATE TABLE `_bak_post_targets` AS SELECT * FROM `post_targets`;
--> statement-breakpoint
CREATE TABLE `_bak_assets` AS SELECT * FROM `assets`;
--> statement-breakpoint
CREATE TABLE `_bak_comments` AS SELECT * FROM `comments`;
--> statement-breakpoint
CREATE TABLE `_bak_account_posts` AS SELECT * FROM `account_posts`;
--> statement-breakpoint
CREATE TABLE `_bak_collection_posts` AS SELECT * FROM `collection_posts`;
--> statement-breakpoint
CREATE TABLE `_bak_reply_rules` AS SELECT r.*, g.`owner_id` AS `new_owner_id` FROM `reply_rules` r JOIN `groups` g ON g.`id` = r.`group_id` WHERE g.`owner_id` IS NOT NULL;
--> statement-breakpoint
ALTER TABLE `projects` ADD `priority` integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE `projects` ADD `can_read_insights` integer DEFAULT true NOT NULL;
--> statement-breakpoint
UPDATE `projects` SET
	`priority` = COALESCE((SELECT MIN(`priority`) FROM `project_groups` WHERE `project_id` = `projects`.`id`), 1),
	`can_read_insights` = COALESCE((SELECT MAX(`can_read_insights`) FROM `project_groups` WHERE `project_id` = `projects`.`id`), 1);
--> statement-breakpoint
CREATE TABLE `__new_accounts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`owner_id` integer NOT NULL,
	`platform` text NOT NULL,
	`name` text NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_accounts`("id", "owner_id", "platform", "name")
	SELECT a."id", g."owner_id", a."platform", a."name" FROM `accounts` a JOIN `groups` g ON g."id" = a."group_id" WHERE g."owner_id" IS NOT NULL;
--> statement-breakpoint
CREATE TABLE `__new_posts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`owner_id` integer NOT NULL,
	`project_id` integer,
	`title` text NOT NULL,
	`scheduled_at` text NOT NULL,
	`status` text DEFAULT 'scheduled' NOT NULL,
	`source` text DEFAULT 'web' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_posts`("id", "owner_id", "project_id", "title", "scheduled_at", "status", "source", "note", "created_at")
	SELECT p."id", g."owner_id", p."project_id", p."title", p."scheduled_at", p."status", p."source", p."note", p."created_at"
	FROM `posts` p JOIN `groups` g ON g."id" = p."group_id" WHERE g."owner_id" IS NOT NULL;
--> statement-breakpoint
DROP TABLE `reply_rules`;
--> statement-breakpoint
DROP TABLE `project_groups`;
--> statement-breakpoint
-- 一次只換一張，換完才動下一張：中間任何時候子表指向的父表都要存在，否則 cascade 會報 no such table
DROP TABLE `accounts`;
--> statement-breakpoint
ALTER TABLE `__new_accounts` RENAME TO `accounts`;
--> statement-breakpoint
DROP TABLE `posts`;
--> statement-breakpoint
ALTER TABLE `__new_posts` RENAME TO `posts`;
--> statement-breakpoint
DROP TABLE `groups`;
--> statement-breakpoint
CREATE INDEX `accounts_owner_idx` ON `accounts` (`owner_id`);
--> statement-breakpoint
CREATE INDEX `posts_owner_idx` ON `posts` (`owner_id`,`scheduled_at`);
--> statement-breakpoint
CREATE INDEX `posts_status_idx` ON `posts` (`status`);
--> statement-breakpoint
CREATE TABLE `reply_rules` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`owner_id` integer NOT NULL,
	`name` text NOT NULL,
	`account_id` integer,
	`post_id` integer,
	`match_type` text DEFAULT 'keyword' NOT NULL,
	`keywords` text DEFAULT '' NOT NULL,
	`action` text DEFAULT 'reply' NOT NULL,
	`replies` text NOT NULL,
	`dm_text` text DEFAULT '' NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`channel` text DEFAULT 'comment' NOT NULL,
	`external_post_id` text DEFAULT '' NOT NULL,
	`post_label` text DEFAULT '' NOT NULL,
	`cursor` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`post_id`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `reply_rules`("id", "owner_id", "name", "account_id", "post_id", "match_type", "keywords", "action", "replies", "dm_text", "enabled", "channel", "external_post_id", "post_label", "cursor", "created_at")
	SELECT "id", "new_owner_id", "name", "account_id", "post_id", "match_type", "keywords", "action", "replies", "dm_text", "enabled", "channel", "external_post_id", "post_label", "cursor", "created_at" FROM `_bak_reply_rules`;
--> statement-breakpoint
INSERT OR IGNORE INTO `connections` SELECT * FROM `_bak_connections` WHERE `account_id` IN (SELECT `id` FROM `accounts`);
--> statement-breakpoint
INSERT OR IGNORE INTO `post_targets` SELECT * FROM `_bak_post_targets` WHERE `post_id` IN (SELECT `id` FROM `posts`) AND `account_id` IN (SELECT `id` FROM `accounts`);
--> statement-breakpoint
INSERT OR IGNORE INTO `assets` SELECT * FROM `_bak_assets` WHERE `post_id` IN (SELECT `id` FROM `posts`);
--> statement-breakpoint
INSERT OR IGNORE INTO `comments` SELECT * FROM `_bak_comments` WHERE `account_id` IN (SELECT `id` FROM `accounts`);
--> statement-breakpoint
INSERT OR IGNORE INTO `account_posts` SELECT * FROM `_bak_account_posts` WHERE `account_id` IN (SELECT `id` FROM `accounts`);
--> statement-breakpoint
INSERT OR IGNORE INTO `collection_posts` SELECT * FROM `_bak_collection_posts` WHERE `post_id` IN (SELECT `id` FROM `account_posts`) AND `collection_id` IN (SELECT `id` FROM `collections`);
--> statement-breakpoint
DROP TABLE `_bak_connections`;
--> statement-breakpoint
DROP TABLE `_bak_post_targets`;
--> statement-breakpoint
DROP TABLE `_bak_assets`;
--> statement-breakpoint
DROP TABLE `_bak_comments`;
--> statement-breakpoint
DROP TABLE `_bak_account_posts`;
--> statement-breakpoint
DROP TABLE `_bak_collection_posts`;
--> statement-breakpoint
DROP TABLE `_bak_reply_rules`;
