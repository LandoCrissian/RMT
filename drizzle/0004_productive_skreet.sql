CREATE TABLE `account_links` (
	`firebase_uid` text PRIMARY KEY NOT NULL,
	`legacy_user_id` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `account_links_legacy_user_id_unique` ON `account_links` (`legacy_user_id`);