CREATE TABLE `discovery_config` (
	`id` text PRIMARY KEY NOT NULL,
	`payload_json` text NOT NULL,
	`revision` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `discovery_members` (
	`user_id` text PRIMARY KEY NOT NULL,
	`interests` text DEFAULT '[]' NOT NULL,
	`notifications_enabled` integer DEFAULT 1 NOT NULL,
	`onboarding` text
);
--> statement-breakpoint
CREATE TABLE `discovery_reads` (
	`user_id` text NOT NULL,
	`update_id` text NOT NULL,
	PRIMARY KEY(`user_id`, `update_id`),
	FOREIGN KEY (`update_id`) REFERENCES `project_updates`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `project_updates` ADD `is_event` integer DEFAULT 0 NOT NULL;