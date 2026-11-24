CREATE TABLE `review_events` (
	`id` text PRIMARY KEY NOT NULL,
	`submission_id` text NOT NULL,
	`reviewer_id` text NOT NULL,
	`previous_status` text NOT NULL,
	`next_status` text NOT NULL,
	`note` text NOT NULL,
	`revision` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`submission_id`) REFERENCES `submissions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `review_events_submission` ON `review_events` (`submission_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`account_email` text NOT NULL,
	`name` text NOT NULL,
	`normalized_name` text NOT NULL,
	`summary` text NOT NULL,
	`category` text NOT NULL,
	`website` text NOT NULL,
	`normalized_host` text NOT NULL,
	`launch_url` text NOT NULL,
	`x_profile` text NOT NULL,
	`contact_email` text DEFAULT '' NOT NULL,
	`ownership_evidence` text NOT NULL,
	`verification_code` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`review_note` text DEFAULT '' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "submissions_valid_status" CHECK("submissions"."status" IN ('pending','needs_changes','approved','rejected','suspended')),
	CONSTRAINT "submissions_valid_category" CHECK("submissions"."category" IN ('Games','Music','Tools','Community'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `submissions_unique_host` ON `submissions` (`normalized_host`);--> statement-breakpoint
CREATE UNIQUE INDEX `submissions_unique_name` ON `submissions` (`normalized_name`);--> statement-breakpoint
CREATE INDEX `submissions_user_created` ON `submissions` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `submissions_status_created` ON `submissions` (`status`,`created_at`);