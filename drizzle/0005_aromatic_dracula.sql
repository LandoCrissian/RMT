CREATE TABLE `project_artwork` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`user_id` text NOT NULL,
	`ownership_revision` integer NOT NULL,
	`kind` text NOT NULL,
	`object_key` text NOT NULL,
	`mime` text NOT NULL,
	`width` integer NOT NULL,
	`height` integer NOT NULL,
	`byte_size` integer NOT NULL,
	`digest` text NOT NULL,
	`status` text DEFAULT 'uploading' NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT "artwork_valid_kind" CHECK("project_artwork"."kind" IN ('logo','banner')),
	CONSTRAINT "artwork_valid_mime" CHECK("project_artwork"."mime" IN ('image/png','image/jpeg','image/webp')),
	CONSTRAINT "artwork_valid_status" CHECK("project_artwork"."status" IN ('uploading','ready','failed'))
);
--> statement-breakpoint
CREATE INDEX `artwork_user_created` ON `project_artwork` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `artwork_project_status` ON `project_artwork` (`project_id`,`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `artwork_object_key` ON `project_artwork` (`object_key`);