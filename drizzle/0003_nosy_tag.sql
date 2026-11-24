CREATE TABLE `review_alert_receipts` (
	`reviewer_id` text NOT NULL,
	`event_key` text NOT NULL,
	`acknowledged_at` integer NOT NULL,
	PRIMARY KEY(`reviewer_id`, `event_key`)
);
--> statement-breakpoint
CREATE INDEX `review_alert_receipts_reviewer_acknowledged` ON `review_alert_receipts` (`reviewer_id`,`acknowledged_at`);--> statement-breakpoint
CREATE TABLE `saved_projects` (
	`user_id` text NOT NULL,
	`project_id` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `project_id`)
);
--> statement-breakpoint
CREATE INDEX `saved_projects_user_created` ON `saved_projects` (`user_id`,`created_at`);