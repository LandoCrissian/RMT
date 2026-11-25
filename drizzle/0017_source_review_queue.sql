CREATE TABLE `source_suggestions` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`project_name` text NOT NULL,
	`source_url` text NOT NULL,
	`evidence` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `source_suggestion_queue` ON `source_suggestions` (`status`,`updated_at`);--> statement-breakpoint
ALTER TABLE `calendar_events` ADD `source_hash` text;
--> statement-breakpoint
CREATE INDEX calendar_history_event_action_revision ON calendar_history(event_id,action,revision);
