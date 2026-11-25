CREATE TABLE `claim_rpc_usage` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `claim_rpc_member_time` ON `claim_rpc_usage` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `claim_rpc_time` ON `claim_rpc_usage` (`created_at`);--> statement-breakpoint
CREATE TABLE `wallet_claim_challenges` (
	`id` text PRIMARY KEY NOT NULL,
	`claim_id` text NOT NULL,
	`project_id` text NOT NULL,
	`user_id` text NOT NULL,
	`address` text NOT NULL,
	`contract` text NOT NULL,
	`origin` text NOT NULL,
	`browser_hash` text NOT NULL,
	`message` text NOT NULL,
	`revision` integer NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`consumed_at` integer,
	`outcome` text DEFAULT 'issued' NOT NULL,
	`signature` text,
	FOREIGN KEY (`claim_id`) REFERENCES `project_claims`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `wallet_challenge_account_time` ON `wallet_claim_challenges` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `wallet_challenge_time` ON `wallet_claim_challenges` (`created_at`);--> statement-breakpoint
CREATE TABLE `wallet_claim_checks` (
	`id` text PRIMARY KEY NOT NULL,
	`claim_id` text NOT NULL,
	`challenge_id` text NOT NULL,
	`reviewer_id` text NOT NULL,
	`revision` integer NOT NULL,
	`result_json` text NOT NULL,
	`checked_at` integer NOT NULL,
	FOREIGN KEY (`claim_id`) REFERENCES `project_claims`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`challenge_id`) REFERENCES `wallet_claim_challenges`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `wallet_checks_claim` ON `wallet_claim_checks` (`claim_id`,`checked_at`);--> statement-breakpoint
CREATE TABLE `wallet_claim_evidence` (
	`claim_id` text PRIMARY KEY NOT NULL,
	`challenge_id` text NOT NULL,
	`evidence_json` text NOT NULL,
	`recheck_json` text,
	FOREIGN KEY (`claim_id`) REFERENCES `project_claims`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`challenge_id`) REFERENCES `wallet_claim_challenges`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `wallet_claim_evidence_challenge_id_unique` ON `wallet_claim_evidence` (`challenge_id`);--> statement-breakpoint
ALTER TABLE `project_claims` ADD `proof_method` text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
CREATE TRIGGER wallet_claim_approval_guard BEFORE UPDATE OF status ON project_claims
WHEN OLD.proof_method='wallet' AND NEW.status='approved' AND OLD.status<>'approved'
AND NOT EXISTS (
  SELECT 1 FROM wallet_claim_evidence e JOIN wallet_claim_checks k ON k.challenge_id=e.challenge_id AND k.claim_id=e.claim_id
  JOIN claim_review_events a ON a.id=k.id AND a.claim_id=k.claim_id AND a.reviewer_id=k.reviewer_id
  WHERE e.claim_id=OLD.id AND a.previous_status=OLD.status AND a.next_status='approved'
  AND a.revision=NEW.revision AND k.revision=OLD.revision AND k.result_json=e.recheck_json
  AND json_extract(k.result_json,'$.outcome')='verified'
  AND k.checked_at BETWEEN unixepoch()*1000-120000 AND unixepoch()*1000+1000
)
BEGIN SELECT RAISE(ABORT,'Wallet claim requires current administrator authority review'); END;
