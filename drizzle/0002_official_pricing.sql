CREATE TABLE `official_pricing` (
 `id` text PRIMARY KEY NOT NULL,
 `payload` text,
 `fetched_at` text,
 `attempted_at` text NOT NULL,
 `error` text
);
--> statement-breakpoint
ALTER TABLE `budgets` ADD COLUMN `used_cny` integer;
--> statement-breakpoint
ALTER TABLE `calls` ADD COLUMN `charged_cny` integer;
