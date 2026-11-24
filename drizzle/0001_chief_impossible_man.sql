DROP INDEX `submissions_unique_host`;--> statement-breakpoint
DROP INDEX `submissions_unique_name`;--> statement-breakpoint
CREATE UNIQUE INDEX `submissions_unique_active_host` ON `submissions` (`normalized_host`) WHERE "submissions"."status" <> 'rejected';--> statement-breakpoint
CREATE UNIQUE INDEX `submissions_unique_active_name` ON `submissions` (`normalized_name`) WHERE "submissions"."status" <> 'rejected';