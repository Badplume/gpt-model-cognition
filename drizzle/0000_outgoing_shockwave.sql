CREATE TABLE `accounts` (
	`user_id` text PRIMARY KEY NOT NULL,
	`encrypted_key` text,
	`settings` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `budgets` (
	`id` text PRIMARY KEY NOT NULL,
	`used` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `calls` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`model` text NOT NULL,
	`status` text NOT NULL,
	`charged` integer NOT NULL,
	`at` text NOT NULL
);
