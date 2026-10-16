CREATE TABLE `direct_models` (
	`id` text NOT NULL,
	`user_id` text NOT NULL,
	`provider` text NOT NULL,
	`model_id` text NOT NULL,
	`name` text NOT NULL,
	`input_usd` real NOT NULL,
	`output_usd` real NOT NULL,
	`context_length` integer NOT NULL,
	PRIMARY KEY(`user_id`, `id`)
);
--> statement-breakpoint
CREATE TABLE `provider_keys` (
	`user_id` text NOT NULL,
	`provider` text NOT NULL,
	`encrypted_key` text NOT NULL,
	PRIMARY KEY(`user_id`, `provider`)
);
--> statement-breakpoint
CREATE TABLE `requests` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`status` text NOT NULL,
	`payload` text NOT NULL,
	`estimate` text NOT NULL,
	`result` text,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `requests_owner` ON `requests` (`user_id`,`created_at`);