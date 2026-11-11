-- 回覆規則併進系列文：collections 多了回覆設定，reply_rules 整張拿掉。
-- 既有的規則不轉成系列文（使用者確認可以直接刪除，當時只有他自己在用）。
ALTER TABLE `collections` ADD `match_type` text DEFAULT 'any' NOT NULL;--> statement-breakpoint
ALTER TABLE `collections` ADD `keywords` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `collections` ADD `replies` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `collections` ADD `dm_text` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `collections` ADD `enabled` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `collections` ADD `cursor` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `comments` ADD `collection_id` integer REFERENCES collections(id) ON DELETE SET NULL;--> statement-breakpoint
-- 一則貼文只能在一個系列文裡：先前允許重複，保留每則貼文最早加入的那一個
DELETE FROM `collection_posts` WHERE rowid NOT IN (SELECT MIN(rowid) FROM `collection_posts` GROUP BY `post_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `collection_posts_post_idx` ON `collection_posts` (`post_id`);--> statement-breakpoint
DROP TABLE `reply_rules`;
