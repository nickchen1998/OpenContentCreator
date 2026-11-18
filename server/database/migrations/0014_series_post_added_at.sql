ALTER TABLE `collection_posts` ADD `added_at` text;--> statement-breakpoint
-- 已經在系列文裡的貼文，加入時間當成現在：之前就有的留言維持只記錄，之後補抓到的新留言才自動送出
UPDATE `collection_posts` SET `added_at` = strftime('%Y-%m-%dT%H:%M:%fZ', 'now');
