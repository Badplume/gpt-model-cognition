CREATE TABLE `pricing_policy` (
 `id` integer PRIMARY KEY NOT NULL CHECK (`id` = 1),
 `auto_update` integer NOT NULL DEFAULT 1,
 `refresh_hours` integer NOT NULL DEFAULT 24 CHECK (`refresh_hours` IN (24,72))
);
