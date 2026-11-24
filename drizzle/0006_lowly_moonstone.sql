CREATE TABLE `project_update_events` (
	`id` text PRIMARY KEY NOT NULL,
	`update_id` text NOT NULL,
	`actor_id` text NOT NULL,
	`action` text NOT NULL,
	`previous_status` text NOT NULL,
	`next_status` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`revision` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`update_id`) REFERENCES `project_updates`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `update_events_update_created` ON `project_update_events` (`update_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `update_events_actor_action_created` ON `project_update_events` (`actor_id`,`action`,`created_at`);--> statement-breakpoint
CREATE TABLE `project_updates` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`project_name` text NOT NULL,
	`user_id` text NOT NULL,
	`ownership_revision` integer NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`link_label` text DEFAULT '' NOT NULL,
	`link_url` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`review_note` text DEFAULT '' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`published_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "updates_valid_status" CHECK("project_updates"."status" IN ('draft','pending','approved','rejected','archived')),
	CONSTRAINT "updates_valid_kind" CHECK("project_updates"."kind" IN ('announcement','progress','release'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `updates_one_pending_project` ON `project_updates` (`project_id`) WHERE "project_updates"."status" = 'pending';--> statement-breakpoint
CREATE INDEX `updates_user_updated` ON `project_updates` (`user_id`,`updated_at`,`id`);--> statement-breakpoint
CREATE INDEX `updates_project_published` ON `project_updates` (`project_id`,`status`,`published_at`,`id`);--> statement-breakpoint
CREATE INDEX `updates_review_updated` ON `project_updates` (`status`,`updated_at`,`id`);--> statement-breakpoint
CREATE TABLE `__new_notification_outbox` (
	`id` text PRIMARY KEY NOT NULL,
	`event_key` text NOT NULL,
	`kind` text NOT NULL,
	`entity_id` text NOT NULL,
	`project_name` text NOT NULL,
	`channel` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempt_count` integer DEFAULT 0 NOT NULL,
	`provider_id` text DEFAULT '' NOT NULL,
	`last_error` text DEFAULT '' NOT NULL,
	`payload_json` text DEFAULT '' NOT NULL,
	`first_attempt_at` integer,
	`sent_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "outbox_valid_kind" CHECK("__new_notification_outbox"."kind" IN ('submission','claim','edit','update')),
	CONSTRAINT "outbox_valid_channel" CHECK("__new_notification_outbox"."channel" IN ('email','sms')),
	CONSTRAINT "outbox_valid_status" CHECK("__new_notification_outbox"."status" IN ('pending','sending','sent','failed','unconfigured','uncertain'))
);
--> statement-breakpoint
INSERT INTO `__new_notification_outbox`("id", "event_key", "kind", "entity_id", "project_name", "channel", "status", "attempt_count", "provider_id", "last_error", "payload_json", "first_attempt_at", "sent_at", "created_at", "updated_at") SELECT "id", "event_key", "kind", "entity_id", "project_name", "channel", "status", "attempt_count", "provider_id", "last_error", "payload_json", "first_attempt_at", "sent_at", "created_at", "updated_at" FROM `notification_outbox`;--> statement-breakpoint
DROP TABLE `notification_outbox`;--> statement-breakpoint
ALTER TABLE `__new_notification_outbox` RENAME TO `notification_outbox`;--> statement-breakpoint
CREATE UNIQUE INDEX `outbox_event_channel` ON `notification_outbox` (`event_key`,`channel`);--> statement-breakpoint
CREATE INDEX `outbox_status_created` ON `notification_outbox` (`status`,`created_at`);