import type { Project } from "@/lib/catalog";
import { getSeedProjects } from "@/lib/catalog";
import { InputError, normalizeHost, normalizeName, type SubmissionInput, type DecisionInput } from "@/lib/submission-validation";
import type { PlatformIdentity } from "./auth";

export type SubmissionStatus = "pending" | "needs_changes" | "approved" | "rejected" | "suspended";
export type SubmissionRow = {
  id: string; user_id: string; account_email: string; name: string; normalized_name: string;
  summary: string; category: Project["category"]; website: string; normalized_host: string;
  launch_url: string; x_profile: string; contact_email: string; ownership_evidence: string;
  verification_code: string; status: SubmissionStatus; review_note: string; revision: number;
  created_at: number; updated_at: number;
};

export function privateSubmission(row: SubmissionRow, includeAccount = false) {
  return {
    id: row.id, name: row.name, summary: row.summary, category: row.category,
    website: row.website, launchUrl: row.launch_url, xProfile: row.x_profile,
    contactEmail: row.contact_email, ownershipEvidence: row.ownership_evidence,
    verificationCode: row.verification_code, status: row.status, reviewNote: row.review_note,
    revision: row.revision, createdAt: row.created_at, updatedAt: row.updated_at,
    ...(includeAccount ? {userId: row.user_id, accountEmail: row.account_email} : {}),
  };
}

/** Explicit field projection: private application fields never reach the catalog. */
export function publicProject(row: SubmissionRow): Project {
  const initials = row.name.split(/\s+/).map(part => part[0]).join("").slice(0, 2).toUpperCase();
  return {
    id: `community-${row.id}`, slug: `project-${row.id}`, name: row.name,
    tagline: row.summary, description: row.summary, category: row.category,
    website: row.website, launchUrl: row.launch_url, launchLabel: "Open project",
    links: [
      {label: "Website", url: row.website},
      {label: "Launch", url: row.launch_url},
      {label: "X", url: row.x_profile},
    ],
    initials, accent: "#c6ff42", cover: "community", claimed: true, source: "community",
  };
}

function assertNotSeed(input: SubmissionInput) {
  const found = getSeedProjects().some(project => normalizeHost(project.website) === input.normalizedHost || normalizeName(project.name) === input.normalizedName);
  if (found) throw new InputError("This project already has a curated listing. Builder claiming is not open in this preview.", 409);
}

function translateUnique(error: unknown): never {
  const message = error instanceof Error ? error.message : "";
  if (/UNIQUE constraint failed.*submissions/i.test(message)) {
    throw new InputError("An active application or listing already exists for this project name or website. Use the existing application instead.", 409);
  }
  throw error;
}

export async function createSubmission(db: D1Database, user: PlatformIdentity, input: SubmissionInput) {
  assertNotSeed(input);
  const now = Date.now();
  const id = crypto.randomUUID();
  const verificationCode = `rmt-${crypto.randomUUID()}`;
  // The quota check and insert run as ONE SQLite statement. Concurrent requests
  // cannot both pass a separate read check then overrun this account's quota.
  let result: D1Result;
  try {
    result = await db.prepare(`
      INSERT INTO submissions (
        id,user_id,account_email,name,normalized_name,summary,category,website,
        normalized_host,launch_url,x_profile,contact_email,ownership_evidence,
        verification_code,status,review_note,revision,created_at,updated_at
      ) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,'pending','',1,?,?
        WHERE (SELECT COUNT(*) FROM submissions WHERE user_id = ? AND created_at >= ?) < 3
    `).bind(id, user.userId, user.email, input.name, input.normalizedName, input.summary,
      input.category, input.website, input.normalizedHost, input.launchUrl, input.xProfile,
      input.contactEmail, input.ownershipEvidence, verificationCode, now, now, user.userId, now - 86_400_000).run();
  } catch (error) { return translateUnique(error); }
  if (result.meta.changes !== 1) throw new InputError("You can submit up to 3 projects in 24 hours. Please try again later.", 429);
  const row = await db.prepare("SELECT * FROM submissions WHERE id = ? AND user_id = ?").bind(id, user.userId).first<SubmissionRow>();
  if (!row) throw new Error("Created application was not readable");
  return privateSubmission(row);
}

export async function ownSubmissions(db: D1Database, userId: string) {
  const rows = await db.prepare("SELECT * FROM submissions WHERE user_id = ? ORDER BY created_at DESC LIMIT 100").bind(userId).all<SubmissionRow>();
  return rows.results.map(row => privateSubmission(row));
}

export async function reviewQueue(db: D1Database) {
  const rows = await db.prepare("SELECT * FROM submissions ORDER BY CASE status WHEN 'pending' THEN 0 WHEN 'needs_changes' THEN 1 WHEN 'approved' THEN 2 ELSE 3 END, updated_at DESC LIMIT 200").all<SubmissionRow>();
  return rows.results.map(row => privateSubmission(row, true));
}

export async function catalog(db: D1Database) {
  const rows = await db.prepare("SELECT * FROM submissions WHERE status = 'approved' ORDER BY name COLLATE NOCASE LIMIT 500").all<SubmissionRow>();
  const curated = getSeedProjects();
  const community = rows.results.map(publicProject);
  return {projects: [...curated, ...community], counts: {curated: curated.length, community: community.length}};
}

const transitions: Record<DecisionInput["action"], {from: SubmissionStatus[]; to: SubmissionStatus}> = {
  approve: {from: ["pending", "suspended"], to: "approved"},
  reject: {from: ["pending", "needs_changes"], to: "rejected"},
  request_changes: {from: ["pending"], to: "needs_changes"},
  suspend: {from: ["approved"], to: "suspended"},
};

export async function reviewSubmission(db: D1Database, reviewerId: string, id: string, decision: DecisionInput) {
  const row = await db.prepare("SELECT * FROM submissions WHERE id = ?").bind(id).first<SubmissionRow>();
  if (!row) throw new InputError("This application was not found.", 404);
  const transition = transitions[decision.action];
  if (row.revision !== decision.expectedRevision || !transition.from.includes(row.status)) {
    throw new InputError("This application changed or is not ready for that action. Refresh the review queue.", 409);
  }
  const now = Date.now();
  // D1 batch executes atomically. Both statements are guarded by the same old
  // revision, preventing lost updates and audit entries for failed decisions.
  const results = await db.batch([
    db.prepare(`INSERT INTO review_events (id,submission_id,reviewer_id,previous_status,next_status,note,revision,created_at)
      SELECT ?,id,?,status,?,?,revision+1,? FROM submissions WHERE id = ? AND revision = ? AND status = ?`)
      .bind(crypto.randomUUID(), reviewerId, transition.to, decision.note, now, id, row.revision, row.status),
    db.prepare("UPDATE submissions SET status = ?, review_note = ?, revision = revision + 1, updated_at = ? WHERE id = ? AND revision = ? AND status = ?")
      .bind(transition.to, decision.note, now, id, row.revision, row.status),
  ]);
  if (results[1]?.meta.changes !== 1 || results[0]?.meta.changes !== 1) throw new InputError("Another reviewer changed this application. Refresh the queue.", 409);
  const updated = await db.prepare("SELECT * FROM submissions WHERE id = ?").bind(id).first<SubmissionRow>();
  if (!updated) throw new Error("Reviewed application was not readable");
  return privateSubmission(updated, true);
}

export async function resubmit(db: D1Database, user: PlatformIdentity, id: string, input: SubmissionInput, expectedRevision: number) {
  assertNotSeed(input);
  const row = await db.prepare("SELECT * FROM submissions WHERE id = ? AND user_id = ?").bind(id, user.userId).first<SubmissionRow>();
  if (!row) throw new InputError("This application was not found.", 404);
  if (row.status !== "needs_changes" || row.revision !== expectedRevision) throw new InputError("Only applications marked 'Changes requested' can be updated. Refresh your applications.", 409);
  const now = Date.now();
  let results: D1Result[];
  try {
    results = await db.batch([
      db.prepare(`INSERT INTO review_events (id,submission_id,reviewer_id,previous_status,next_status,note,revision,created_at)
        SELECT ?,id,?,status,'pending','Applicant resubmitted requested changes.',revision+1,? FROM submissions WHERE id = ? AND user_id = ? AND revision = ? AND status = 'needs_changes'`)
        .bind(crypto.randomUUID(), user.userId, now, id, user.userId, row.revision),
      db.prepare(`UPDATE submissions SET name=?,normalized_name=?,summary=?,category=?,website=?,normalized_host=?,launch_url=?,x_profile=?,contact_email=?,ownership_evidence=?,
        status='pending',review_note='',revision=revision+1,updated_at=?
        WHERE id=? AND user_id=? AND revision=? AND status='needs_changes'`)
        .bind(input.name, input.normalizedName, input.summary, input.category, input.website, input.normalizedHost, input.launchUrl, input.xProfile,
          input.contactEmail, input.ownershipEvidence, now, id, user.userId, row.revision),
    ]);
  } catch (error) { return translateUnique(error); }
  if (results[1]?.meta.changes !== 1 || results[0]?.meta.changes !== 1) throw new InputError("This application changed. Refresh it before resubmitting.", 409);
  const updated = await db.prepare("SELECT * FROM submissions WHERE id = ? AND user_id = ?").bind(id, user.userId).first<SubmissionRow>();
  if (!updated) throw new Error("Updated application was not readable");
  return privateSubmission(updated);
}
