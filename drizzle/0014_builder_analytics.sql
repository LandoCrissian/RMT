CREATE TABLE `analytics_daily` (
	`day` text NOT NULL,
	`project_id` text NOT NULL,
	`kind` text NOT NULL,
	`dimension` text DEFAULT '' NOT NULL,
	`total` integer NOT NULL,
	PRIMARY KEY(`day`, `project_id`, `kind`, `dimension`)
);
--> statement-breakpoint
CREATE INDEX `analytics_project_day` ON `analytics_daily` (`project_id`,`day`);--> statement-breakpoint
CREATE TABLE `analytics_events` (
	`id` text PRIMARY KEY NOT NULL,
	`day` text NOT NULL,
	`project_id` text NOT NULL,
	`kind` text NOT NULL,
	`dimension` text NOT NULL,
	`visitor` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `analytics_event_expiry` ON `analytics_events` (`day`);--> statement-breakpoint
CREATE INDEX `analytics_event_visitors` ON `analytics_events` (`project_id`,`kind`,`visitor`,`day`);--> statement-breakpoint
CREATE TABLE `analytics_meta` (
	`id` integer PRIMARY KEY NOT NULL,
	`start_ms` integer NOT NULL,
	`active_day` text NOT NULL,
	`accepted` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `claim_eligibility_cache` (
	`project_id` text PRIMARY KEY NOT NULL,
	`binding` text NOT NULL,
	`status` text NOT NULL,
	`owner_token` text NOT NULL,
	`result_json` text NOT NULL,
	`checked_at` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `claim_eligibility_checked` ON `claim_eligibility_cache` (`checked_at`);--> statement-breakpoint
ALTER TABLE `control_members` ADD `firebase_created_at` integer;--> statement-breakpoint
CREATE INDEX `control_firebase_created` ON `control_members` (`firebase_created_at`);--> statement-breakpoint
CREATE INDEX `saved_projects_project` ON `saved_projects` (`project_id`);
--> statement-breakpoint
CREATE TRIGGER analytics_day_cleanup AFTER UPDATE OF active_day ON analytics_meta
WHEN OLD.active_day < NEW.active_day
BEGIN
  DELETE FROM control_metric_events WHERE day < date(NEW.active_day,'-29 days');
  DELETE FROM analytics_events WHERE day < date(NEW.active_day,'-89 days');
  DELETE FROM analytics_daily WHERE day < date(NEW.active_day,'-364 days');
END;
--> statement-breakpoint
CREATE TRIGGER analytics_event_rollup AFTER INSERT ON analytics_events
BEGIN
  UPDATE analytics_meta SET accepted=accepted+1 WHERE id=1;
  INSERT INTO analytics_daily(day,project_id,kind,dimension,total)
    VALUES(NEW.day,NEW.project_id,NEW.kind,NEW.dimension,1)
    ON CONFLICT(day,project_id,kind,dimension) DO UPDATE SET total=total+1;
  INSERT INTO analytics_daily(day,project_id,kind,dimension,total)
    SELECT NEW.day,'','returning','',1 WHERE NEW.kind='visit' AND NEW.visitor<>'' AND EXISTS(
      SELECT 1 FROM analytics_events WHERE project_id='' AND kind='visit' AND visitor=NEW.visitor AND day<NEW.day)
    ON CONFLICT(day,project_id,kind,dimension) DO UPDATE SET total=total+1;
END;
--> statement-breakpoint
CREATE TRIGGER analytics_follow AFTER INSERT ON project_follows
BEGIN
  INSERT INTO analytics_meta(id,start_ms,active_day,accepted) VALUES(1,unixepoch()*1000,date('now'),0)
    ON CONFLICT(id) DO UPDATE SET active_day=excluded.active_day,accepted=0 WHERE active_day<excluded.active_day;
  INSERT INTO analytics_daily(day,project_id,kind,dimension,total) VALUES(date('now'),NEW.project_id,'follow','',1)
    ON CONFLICT(day,project_id,kind,dimension) DO UPDATE SET total=total+1;
END;
--> statement-breakpoint
CREATE TRIGGER analytics_unfollow AFTER DELETE ON project_follows
BEGIN
  INSERT INTO analytics_meta(id,start_ms,active_day,accepted) VALUES(1,unixepoch()*1000,date('now'),0)
    ON CONFLICT(id) DO UPDATE SET active_day=excluded.active_day,accepted=0 WHERE active_day<excluded.active_day;
  INSERT INTO analytics_daily(day,project_id,kind,dimension,total) VALUES(date('now'),OLD.project_id,'unfollow','',1)
    ON CONFLICT(day,project_id,kind,dimension) DO UPDATE SET total=total+1;
END;
--> statement-breakpoint
CREATE TRIGGER analytics_save AFTER INSERT ON saved_projects
BEGIN
  INSERT INTO analytics_meta(id,start_ms,active_day,accepted) VALUES(1,unixepoch()*1000,date('now'),0)
    ON CONFLICT(id) DO UPDATE SET active_day=excluded.active_day,accepted=0 WHERE active_day<excluded.active_day;
  INSERT INTO analytics_daily(day,project_id,kind,dimension,total) VALUES(date('now'),NEW.project_id,'save','',1)
    ON CONFLICT(day,project_id,kind,dimension) DO UPDATE SET total=total+1;
END;
--> statement-breakpoint
CREATE TRIGGER analytics_unsave AFTER DELETE ON saved_projects
BEGIN
  INSERT INTO analytics_meta(id,start_ms,active_day,accepted) VALUES(1,unixepoch()*1000,date('now'),0)
    ON CONFLICT(id) DO UPDATE SET active_day=excluded.active_day,accepted=0 WHERE active_day<excluded.active_day;
  INSERT INTO analytics_daily(day,project_id,kind,dimension,total) VALUES(date('now'),OLD.project_id,'unsave','',1)
    ON CONFLICT(day,project_id,kind,dimension) DO UPDATE SET total=total+1;
END;
