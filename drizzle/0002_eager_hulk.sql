CREATE TABLE `claim_review_events` (
	`id` text PRIMARY KEY NOT NULL,
	`claim_id` text NOT NULL,
	`reviewer_id` text NOT NULL,
	`previous_status` text NOT NULL,
	`next_status` text NOT NULL,
	`note` text NOT NULL,
	`revision` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`claim_id`) REFERENCES `project_claims`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `claim_events_claim` ON `claim_review_events` (`claim_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `edit_review_events` (
	`id` text PRIMARY KEY NOT NULL,
	`edit_id` text NOT NULL,
	`reviewer_id` text NOT NULL,
	`previous_status` text NOT NULL,
	`next_status` text NOT NULL,
	`note` text NOT NULL,
	`revision` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`edit_id`) REFERENCES `project_edits`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `edit_events_edit` ON `edit_review_events` (`edit_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `notification_outbox` (
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
	CONSTRAINT "outbox_valid_kind" CHECK("notification_outbox"."kind" IN ('submission','claim','edit')),
	CONSTRAINT "outbox_valid_channel" CHECK("notification_outbox"."channel" IN ('email','sms')),
	CONSTRAINT "outbox_valid_status" CHECK("notification_outbox"."status" IN ('pending','sending','sent','failed','unconfigured','uncertain'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `outbox_event_channel` ON `notification_outbox` (`event_key`,`channel`);--> statement-breakpoint
CREATE INDEX `outbox_status_created` ON `notification_outbox` (`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `project_claims` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`project_name` text NOT NULL,
	`user_id` text NOT NULL,
	`account_email` text NOT NULL,
	`method` text NOT NULL,
	`official_channel_url` text NOT NULL,
	`verification_code` text NOT NULL,
	`proof_url` text DEFAULT '' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`review_note` text DEFAULT '' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "claims_valid_status" CHECK("project_claims"."status" IN ('draft','pending','approved','rejected','revoked')),
	CONSTRAINT "claims_valid_method" CHECK("project_claims"."method" IN ('website','x','opensea'))
);
--> statement-breakpoint
CREATE INDEX `claims_user_created` ON `project_claims` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `claims_project_status` ON `project_claims` (`project_id`,`status`);--> statement-breakpoint
CREATE TABLE `project_edits` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`project_name` text NOT NULL,
	`user_id` text NOT NULL,
	`ownership_revision` integer NOT NULL,
	`base_revision` integer NOT NULL,
	`payload_json` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`review_note` text DEFAULT '' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "edit_valid_status" CHECK("project_edits"."status" IN ('pending','approved','rejected'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `edits_one_pending_project` ON `project_edits` (`project_id`) WHERE "project_edits"."status" = 'pending';--> statement-breakpoint
CREATE INDEX `edits_user_created` ON `project_edits` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `edits_status_created` ON `project_edits` (`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `project_overrides` (
	`project_id` text PRIMARY KEY NOT NULL,
	`payload_json` text NOT NULL,
	`revision` integer NOT NULL,
	`edit_id` text NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`edit_id`) REFERENCES `project_edits`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `project_owners` (
	`project_id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`claim_id` text,
	`status` text DEFAULT 'active' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "owner_valid_status" CHECK("project_owners"."status" IN ('active','revoked'))
);
--> statement-breakpoint
CREATE INDEX `owners_user_status` ON `project_owners` (`user_id`,`status`);--> statement-breakpoint
ALTER TABLE `submissions` ADD `stage` text DEFAULT 'building' NOT NULL;