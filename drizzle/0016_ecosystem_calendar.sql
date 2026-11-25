CREATE TABLE `calendar_events` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`type_id` text NOT NULL,
	`draft` text NOT NULL,
	`published` text,
	`published_at` integer,
	`status` text NOT NULL,
	`revision` integer NOT NULL,
	`featured` integer DEFAULT 0 NOT NULL,
	`source` text,
	`actor` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`type_id`) REFERENCES `calendar_types`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `calendar_project_events` ON `calendar_events` (`project_id`,`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `calendar_source` ON `calendar_events` (`project_id`,`source`);--> statement-breakpoint
CREATE TABLE `calendar_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_id` text NOT NULL,
	`actor` text NOT NULL,
	`action` text NOT NULL,
	`reason` text NOT NULL,
	`revision` integer NOT NULL,
	`snapshot` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `calendar_members` (
	`user_id` text NOT NULL,
	`event_id` text NOT NULL,
	`reminder` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`user_id`, `event_id`),
	FOREIGN KEY (`event_id`) REFERENCES `calendar_events`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `calendar_types` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`archived` integer DEFAULT 0 NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
INSERT INTO calendar_types(id,name) VALUES ('nft','NFT mints & reveals'),('gaming','Game launches & tournaments'),('release','Application releases'),('community','Community events'),('education','AMAs & education'),('milestone','Project milestones'),('protocol','Protocol launches'),('maintenance','Maintenance');
