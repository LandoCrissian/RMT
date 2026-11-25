CREATE TABLE `project_follows` (
	`user_id` text NOT NULL,
	`project_id` text NOT NULL,
	`followed_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `project_id`)
);
--> statement-breakpoint
CREATE INDEX `project_follow_counts` ON `project_follows` (`project_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `member_follow_timeline` ON `project_follows` (`user_id`,`followed_at`,`project_id`);