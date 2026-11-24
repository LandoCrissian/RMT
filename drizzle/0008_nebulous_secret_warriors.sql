CREATE TABLE `control_audit_events` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_id` text NOT NULL,
	`action` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`reason` text NOT NULL,
	`before_json` text DEFAULT '{}' NOT NULL,
	`after_json` text DEFAULT '{}' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `control_audit_created` ON `control_audit_events` (`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `control_audit_entity` ON `control_audit_events` (`entity_type`,`entity_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `control_content` (
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`hidden` integer DEFAULT 0 NOT NULL,
	`reason` text DEFAULT '' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`entity_type`, `entity_id`),
	CONSTRAINT "control_content_type_valid" CHECK("control_content"."entity_type" IN ('profile','update')),
	CONSTRAINT "control_content_hidden_valid" CHECK("control_content"."hidden" IN (0,1))
);
--> statement-breakpoint
CREATE INDEX `control_content_hidden_updated` ON `control_content` (`hidden`,`updated_at`);--> statement-breakpoint
CREATE TABLE `control_installation` (
	`id` integer PRIMARY KEY NOT NULL,
	`observed_since` integer NOT NULL,
	CONSTRAINT "control_installation_singleton" CHECK("control_installation"."id"=1)
);
--> statement-breakpoint
CREATE TABLE `control_members` (
	`user_id` text PRIMARY KEY NOT NULL,
	`email` text DEFAULT '' NOT NULL,
	`display_name` text DEFAULT '' NOT NULL,
	`providers_json` text DEFAULT '[]' NOT NULL,
	`email_verified` integer,
	`first_seen_at` integer,
	`last_seen_at` integer,
	`historical_since_at` integer,
	`status` text DEFAULT 'active' NOT NULL,
	`status_reason` text DEFAULT '' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "control_members_status_valid" CHECK("control_members"."status" IN ('active','suspended')),
	CONSTRAINT "control_members_verified_valid" CHECK("control_members"."email_verified" IS NULL OR "control_members"."email_verified" IN (0,1))
);
--> statement-breakpoint
CREATE INDEX `control_members_status_user` ON `control_members` (`status`,`user_id`);--> statement-breakpoint
CREATE INDEX `control_members_seen` ON `control_members` (`last_seen_at`);--> statement-breakpoint
CREATE TABLE `control_metric_events` (
	`id` text PRIMARY KEY NOT NULL,
	`day` text NOT NULL,
	`kind` text NOT NULL,
	`project_id` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT "control_metric_kind_valid" CHECK("control_metric_events"."kind" IN ('visit','project_view','outbound'))
);
--> statement-breakpoint
CREATE INDEX `control_metric_day_kind` ON `control_metric_events` (`day`,`kind`);--> statement-breakpoint
CREATE INDEX `control_metric_project_day` ON `control_metric_events` (`project_id`,`day`);--> statement-breakpoint
CREATE TABLE `control_project_artwork` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`uploader_id` text NOT NULL,
	`object_key` text NOT NULL,
	`kind` text NOT NULL,
	`mime` text NOT NULL,
	`width` integer NOT NULL,
	`height` integer NOT NULL,
	`byte_size` integer NOT NULL,
	`digest` text NOT NULL,
	`status` text DEFAULT 'uploading' NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT "control_artwork_kind_valid" CHECK("control_project_artwork"."kind" IN ('logo','banner')),
	CONSTRAINT "control_artwork_mime_valid" CHECK("control_project_artwork"."mime"='image/png'),
	CONSTRAINT "control_artwork_status_valid" CHECK("control_project_artwork"."status" IN ('uploading','ready','failed'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `control_artwork_object_key` ON `control_project_artwork` (`object_key`);--> statement-breakpoint
CREATE INDEX `control_artwork_uploader_created` ON `control_project_artwork` (`uploader_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `control_artwork_project_status` ON `control_project_artwork` (`project_id`,`status`);--> statement-breakpoint
CREATE TABLE `control_roles` (
	`user_id` text PRIMARY KEY NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`updated_at` integer NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `control_members`(`user_id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "control_roles_valid" CHECK("control_roles"."role" IN ('member','admin','moderator'))
);
--> statement-breakpoint
CREATE TABLE `control_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`payload_json` text NOT NULL,
	`revision` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`updated_by` text NOT NULL,
	CONSTRAINT "control_settings_singleton" CHECK("control_settings"."id"='site')
);
--> statement-breakpoint
CREATE TABLE `project_controls` (
	`project_id` text PRIMARY KEY NOT NULL,
	`source` text DEFAULT 'existing' NOT NULL,
	`definition_json` text,
	`name_override` text DEFAULT '' NOT NULL,
	`payload_json` text,
	`normalized_name` text,
	`normalized_host` text,
	`logo_asset_id` text,
	`banner_asset_id` text,
	`artwork_override` integer DEFAULT 0 NOT NULL,
	`base_override_revision` integer DEFAULT 0 NOT NULL,
	`visibility` text DEFAULT 'public' NOT NULL,
	`featured` integer,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "project_controls_source_valid" CHECK("project_controls"."source" IN ('existing','admin')),
	CONSTRAINT "project_controls_visibility_valid" CHECK("project_controls"."visibility" IN ('public','hidden','archived')),
	CONSTRAINT "project_controls_featured_valid" CHECK("project_controls"."featured" IS NULL OR "project_controls"."featured" IN (0,1)),
	CONSTRAINT "project_controls_artwork_override_valid" CHECK("project_controls"."artwork_override" IN (0,1))
);
--> statement-breakpoint
CREATE INDEX `project_controls_visibility_updated` ON `project_controls` (`visibility`,`updated_at`);--> statement-breakpoint
CREATE INDEX `project_controls_source_created` ON `project_controls` (`source`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `project_controls_unique_admin_name` ON `project_controls` (`normalized_name`) WHERE "project_controls"."source"='admin' AND "project_controls"."normalized_name" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `project_controls_unique_admin_host` ON `project_controls` (`normalized_host`) WHERE "project_controls"."source"='admin' AND "project_controls"."normalized_host" IS NOT NULL;
--> statement-breakpoint
INSERT INTO control_installation(id, observed_since) VALUES (1, CAST(unixepoch('now') AS INTEGER) * 1000);
--> statement-breakpoint
-- Historical activity identifies existing accounts but is not a sign-in log.
-- Preserve unknown sign-in/verification timestamps instead of inventing them.
-- D1 permits at most five terms in a compound SELECT. Backfill each source
-- independently, preserving the canonical minimum timestamp and maximum email.
WITH canonical AS (
 SELECT COALESCE((SELECT legacy_user_id FROM account_links WHERE 'firebase:'||firebase_uid=h.user_id),h.user_id) AS user_id,h.account_email AS email,h.created_at AS happened FROM submissions h
)
INSERT INTO control_members(user_id,email,display_name,providers_json,email_verified,first_seen_at,last_seen_at,historical_since_at,status,status_reason,revision,created_at,updated_at)
SELECT c.user_id,MAX(c.email),COALESCE((SELECT display_name FROM profiles WHERE user_id=c.user_id),''),'[]',NULL,NULL,NULL,MIN(c.happened),'active','',1,(SELECT observed_since FROM control_installation WHERE id=1),(SELECT observed_since FROM control_installation WHERE id=1) FROM canonical c GROUP BY c.user_id
ON CONFLICT(user_id) DO UPDATE SET email=MAX(control_members.email,excluded.email),historical_since_at=CASE WHEN control_members.historical_since_at IS NULL THEN excluded.historical_since_at ELSE MIN(control_members.historical_since_at,excluded.historical_since_at) END;
--> statement-breakpoint
WITH canonical AS (
 SELECT COALESCE((SELECT legacy_user_id FROM account_links WHERE 'firebase:'||firebase_uid=h.user_id),h.user_id) AS user_id,h.account_email AS email,h.created_at AS happened FROM project_claims h
)
INSERT INTO control_members(user_id,email,display_name,providers_json,email_verified,first_seen_at,last_seen_at,historical_since_at,status,status_reason,revision,created_at,updated_at)
SELECT c.user_id,MAX(c.email),COALESCE((SELECT display_name FROM profiles WHERE user_id=c.user_id),''),'[]',NULL,NULL,NULL,MIN(c.happened),'active','',1,(SELECT observed_since FROM control_installation WHERE id=1),(SELECT observed_since FROM control_installation WHERE id=1) FROM canonical c GROUP BY c.user_id
ON CONFLICT(user_id) DO UPDATE SET email=MAX(control_members.email,excluded.email),historical_since_at=CASE WHEN control_members.historical_since_at IS NULL THEN excluded.historical_since_at ELSE MIN(control_members.historical_since_at,excluded.historical_since_at) END;
--> statement-breakpoint
WITH canonical AS (
 SELECT COALESCE((SELECT legacy_user_id FROM account_links WHERE 'firebase:'||firebase_uid=h.user_id),h.user_id) AS user_id,'' AS email,h.created_at AS happened FROM profiles h
)
INSERT INTO control_members(user_id,email,display_name,providers_json,email_verified,first_seen_at,last_seen_at,historical_since_at,status,status_reason,revision,created_at,updated_at)
SELECT c.user_id,MAX(c.email),COALESCE((SELECT display_name FROM profiles WHERE user_id=c.user_id),''),'[]',NULL,NULL,NULL,MIN(c.happened),'active','',1,(SELECT observed_since FROM control_installation WHERE id=1),(SELECT observed_since FROM control_installation WHERE id=1) FROM canonical c GROUP BY c.user_id
ON CONFLICT(user_id) DO UPDATE SET email=MAX(control_members.email,excluded.email),historical_since_at=CASE WHEN control_members.historical_since_at IS NULL THEN excluded.historical_since_at ELSE MIN(control_members.historical_since_at,excluded.historical_since_at) END;
--> statement-breakpoint
WITH canonical AS (
 SELECT COALESCE((SELECT legacy_user_id FROM account_links WHERE 'firebase:'||firebase_uid=h.user_id),h.user_id) AS user_id,'' AS email,h.created_at AS happened FROM saved_projects h
)
INSERT INTO control_members(user_id,email,display_name,providers_json,email_verified,first_seen_at,last_seen_at,historical_since_at,status,status_reason,revision,created_at,updated_at)
SELECT c.user_id,MAX(c.email),COALESCE((SELECT display_name FROM profiles WHERE user_id=c.user_id),''),'[]',NULL,NULL,NULL,MIN(c.happened),'active','',1,(SELECT observed_since FROM control_installation WHERE id=1),(SELECT observed_since FROM control_installation WHERE id=1) FROM canonical c GROUP BY c.user_id
ON CONFLICT(user_id) DO UPDATE SET email=MAX(control_members.email,excluded.email),historical_since_at=CASE WHEN control_members.historical_since_at IS NULL THEN excluded.historical_since_at ELSE MIN(control_members.historical_since_at,excluded.historical_since_at) END;
--> statement-breakpoint
WITH canonical AS (
 SELECT COALESCE((SELECT legacy_user_id FROM account_links WHERE 'firebase:'||firebase_uid=h.user_id),h.user_id) AS user_id,'' AS email,h.created_at AS happened FROM project_owners h
)
INSERT INTO control_members(user_id,email,display_name,providers_json,email_verified,first_seen_at,last_seen_at,historical_since_at,status,status_reason,revision,created_at,updated_at)
SELECT c.user_id,MAX(c.email),COALESCE((SELECT display_name FROM profiles WHERE user_id=c.user_id),''),'[]',NULL,NULL,NULL,MIN(c.happened),'active','',1,(SELECT observed_since FROM control_installation WHERE id=1),(SELECT observed_since FROM control_installation WHERE id=1) FROM canonical c GROUP BY c.user_id
ON CONFLICT(user_id) DO UPDATE SET email=MAX(control_members.email,excluded.email),historical_since_at=CASE WHEN control_members.historical_since_at IS NULL THEN excluded.historical_since_at ELSE MIN(control_members.historical_since_at,excluded.historical_since_at) END;
--> statement-breakpoint
WITH canonical AS (
 SELECT COALESCE((SELECT legacy_user_id FROM account_links WHERE 'firebase:'||firebase_uid=h.user_id),h.user_id) AS user_id,'' AS email,h.created_at AS happened FROM project_edits h
)
INSERT INTO control_members(user_id,email,display_name,providers_json,email_verified,first_seen_at,last_seen_at,historical_since_at,status,status_reason,revision,created_at,updated_at)
SELECT c.user_id,MAX(c.email),COALESCE((SELECT display_name FROM profiles WHERE user_id=c.user_id),''),'[]',NULL,NULL,NULL,MIN(c.happened),'active','',1,(SELECT observed_since FROM control_installation WHERE id=1),(SELECT observed_since FROM control_installation WHERE id=1) FROM canonical c GROUP BY c.user_id
ON CONFLICT(user_id) DO UPDATE SET email=MAX(control_members.email,excluded.email),historical_since_at=CASE WHEN control_members.historical_since_at IS NULL THEN excluded.historical_since_at ELSE MIN(control_members.historical_since_at,excluded.historical_since_at) END;
--> statement-breakpoint
WITH canonical AS (
 SELECT COALESCE((SELECT legacy_user_id FROM account_links WHERE 'firebase:'||firebase_uid=h.user_id),h.user_id) AS user_id,'' AS email,h.created_at AS happened FROM project_updates h
)
INSERT INTO control_members(user_id,email,display_name,providers_json,email_verified,first_seen_at,last_seen_at,historical_since_at,status,status_reason,revision,created_at,updated_at)
SELECT c.user_id,MAX(c.email),COALESCE((SELECT display_name FROM profiles WHERE user_id=c.user_id),''),'[]',NULL,NULL,NULL,MIN(c.happened),'active','',1,(SELECT observed_since FROM control_installation WHERE id=1),(SELECT observed_since FROM control_installation WHERE id=1) FROM canonical c GROUP BY c.user_id
ON CONFLICT(user_id) DO UPDATE SET email=MAX(control_members.email,excluded.email),historical_since_at=CASE WHEN control_members.historical_since_at IS NULL THEN excluded.historical_since_at ELSE MIN(control_members.historical_since_at,excluded.historical_since_at) END;
--> statement-breakpoint
WITH canonical AS (
 SELECT COALESCE((SELECT legacy_user_id FROM account_links WHERE 'firebase:'||firebase_uid=h.user_id),h.user_id) AS user_id,'' AS email,h.created_at AS happened FROM project_artwork h
)
INSERT INTO control_members(user_id,email,display_name,providers_json,email_verified,first_seen_at,last_seen_at,historical_since_at,status,status_reason,revision,created_at,updated_at)
SELECT c.user_id,MAX(c.email),COALESCE((SELECT display_name FROM profiles WHERE user_id=c.user_id),''),'[]',NULL,NULL,NULL,MIN(c.happened),'active','',1,(SELECT observed_since FROM control_installation WHERE id=1),(SELECT observed_since FROM control_installation WHERE id=1) FROM canonical c GROUP BY c.user_id
ON CONFLICT(user_id) DO UPDATE SET email=MAX(control_members.email,excluded.email),historical_since_at=CASE WHEN control_members.historical_since_at IS NULL THEN excluded.historical_since_at ELSE MIN(control_members.historical_since_at,excluded.historical_since_at) END;
--> statement-breakpoint
WITH canonical AS (
 SELECT COALESCE((SELECT legacy_user_id FROM account_links WHERE 'firebase:'||firebase_uid=h.user_id),h.user_id) AS user_id,'' AS email,h.created_at AS happened FROM profile_artwork h
)
INSERT INTO control_members(user_id,email,display_name,providers_json,email_verified,first_seen_at,last_seen_at,historical_since_at,status,status_reason,revision,created_at,updated_at)
SELECT c.user_id,MAX(c.email),COALESCE((SELECT display_name FROM profiles WHERE user_id=c.user_id),''),'[]',NULL,NULL,NULL,MIN(c.happened),'active','',1,(SELECT observed_since FROM control_installation WHERE id=1),(SELECT observed_since FROM control_installation WHERE id=1) FROM canonical c GROUP BY c.user_id
ON CONFLICT(user_id) DO UPDATE SET email=MAX(control_members.email,excluded.email),historical_since_at=CASE WHEN control_members.historical_since_at IS NULL THEN excluded.historical_since_at ELSE MIN(control_members.historical_since_at,excluded.historical_since_at) END;
--> statement-breakpoint
WITH canonical AS (
 SELECT COALESCE((SELECT legacy_user_id FROM account_links WHERE 'firebase:'||firebase_uid=h.legacy_user_id),h.legacy_user_id) AS user_id,'' AS email,h.created_at AS happened FROM account_links h
)
INSERT INTO control_members(user_id,email,display_name,providers_json,email_verified,first_seen_at,last_seen_at,historical_since_at,status,status_reason,revision,created_at,updated_at)
SELECT c.user_id,MAX(c.email),COALESCE((SELECT display_name FROM profiles WHERE user_id=c.user_id),''),'[]',NULL,NULL,NULL,MIN(c.happened),'active','',1,(SELECT observed_since FROM control_installation WHERE id=1),(SELECT observed_since FROM control_installation WHERE id=1) FROM canonical c GROUP BY c.user_id
ON CONFLICT(user_id) DO UPDATE SET email=MAX(control_members.email,excluded.email),historical_since_at=CASE WHEN control_members.historical_since_at IS NULL THEN excluded.historical_since_at ELSE MIN(control_members.historical_since_at,excluded.historical_since_at) END;
