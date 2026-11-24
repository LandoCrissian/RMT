CREATE TABLE `profile_artwork` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`object_key` text NOT NULL,
	`mime` text NOT NULL,
	`width` integer NOT NULL,
	`height` integer NOT NULL,
	`byte_size` integer NOT NULL,
	`digest` text NOT NULL,
	`status` text DEFAULT 'uploading' NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT "profile_artwork_valid_kind" CHECK("profile_artwork"."kind" IN ('avatar','banner')),
	CONSTRAINT "profile_artwork_valid_mime" CHECK("profile_artwork"."mime" = 'image/png'),
	CONSTRAINT "profile_artwork_valid_status" CHECK("profile_artwork"."status" IN ('uploading','ready','failed'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `profile_artwork_object_key` ON `profile_artwork` (`object_key`);--> statement-breakpoint
CREATE INDEX `profile_artwork_user_created` ON `profile_artwork` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `profile_events` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`revision` integer NOT NULL,
	`visibility` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `profiles`(`user_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `profile_events_revision` ON `profile_events` (`user_id`,`revision`);--> statement-breakpoint
CREATE INDEX `profile_events_user_created` ON `profile_events` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `profiles` (
	`user_id` text PRIMARY KEY NOT NULL,
	`handle` text,
	`display_name` text DEFAULT '' NOT NULL,
	`bio` text DEFAULT '' NOT NULL,
	`visibility` text DEFAULT 'private' NOT NULL,
	`show_managed_projects` integer DEFAULT 0 NOT NULL,
	`avatar_asset_id` text,
	`banner_asset_id` text,
	`links_json` text DEFAULT '[]' NOT NULL,
	`last_mutation_id` text DEFAULT '' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`first_published_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "profiles_valid_visibility" CHECK("profiles"."visibility" IN ('private','public')),
	CONSTRAINT "profiles_valid_project_optin" CHECK("profiles"."show_managed_projects" IN (0,1)),
	CONSTRAINT "profiles_lowercase_handle" CHECK("profiles"."handle" IS NULL OR "profiles"."handle" = lower("profiles"."handle")),
	CONSTRAINT "profiles_public_identity" CHECK("profiles"."visibility" = 'private' OR ("profiles"."handle" IS NOT NULL AND length("profiles"."display_name") >= 2 AND "profiles"."first_published_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `profiles_unique_handle` ON `profiles` (`handle`);