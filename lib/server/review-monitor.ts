import { InputError } from "@/lib/submission-validation";
import { notificationReviewUrl, type NotificationEnvironment } from "./notifications";

export const REVIEW_ALERT_BATCH_SIZE = 50;

// This projection deliberately excludes contact details, evidence, and draft content.
const pendingEventsSql = `
  SELECT 'submission:' || id || ':revision:' || revision || ':pending' AS event_key,
    'submission' AS kind, id AS entity_id, name AS project_name, revision, updated_at
    FROM submissions WHERE status = 'pending'
  UNION ALL
  SELECT 'claim:' || id || ':revision:' || revision || ':pending',
    'claim', id, project_name, revision, updated_at FROM project_claims WHERE status = 'pending'
  UNION ALL
  SELECT 'edit:' || id || ':revision:' || revision || ':pending',
    'edit', id, project_name, revision, updated_at FROM project_edits WHERE status = 'pending'
`;

type PendingEvent = {
  event_key: string; kind: "submission" | "claim" | "edit";
  entity_id: string; project_name: string; revision: number; updated_at: number;
};

/** Read only: reading a digest never marks anything notified, reviewed, or approved. */
export async function reviewDigest(db: D1Database, reviewerId: string, env: NotificationEnvironment) {
  const reviewUrl = notificationReviewUrl(env);
  if (!reviewUrl) throw new InputError("The review website address needs configuration.", 503);
  const [events, totals] = await Promise.all([
    db.prepare(`WITH pending_events AS (${pendingEventsSql})
      SELECT * FROM pending_events p WHERE NOT EXISTS (
        SELECT 1 FROM review_alert_receipts r WHERE r.reviewer_id = ? AND r.event_key = p.event_key
      ) ORDER BY updated_at, event_key LIMIT ?`)
      .bind(reviewerId, REVIEW_ALERT_BATCH_SIZE).all<PendingEvent>(),
    db.prepare(`WITH pending_events AS (${pendingEventsSql})
      SELECT COUNT(*) AS pending_count, COALESCE(SUM(CASE WHEN NOT EXISTS (
        SELECT 1 FROM review_alert_receipts r WHERE r.reviewer_id = ? AND r.event_key = p.event_key
      ) THEN 1 ELSE 0 END), 0) AS new_count FROM pending_events p`)
      .bind(reviewerId).first<{pending_count: number; new_count: number}>(),
  ]);
  return {
    reviewUrl,
    pendingCount: Number(totals?.pending_count ?? 0),
    newPendingCount: Number(totals?.new_count ?? 0),
    moreAvailable: Number(totals?.new_count ?? 0) > events.results.length,
    items: events.results.map(row => ({
      eventKey: row.event_key, kind: row.kind, entityId: row.entity_id,
      projectName: row.project_name.replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, 80),
      revision: row.revision, submittedAt: row.updated_at,
    })),
  };
}

export function validateAlertAcknowledgement(input: unknown): string[] {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new InputError("Provide the event keys included in your notification.");
  const body = input as Record<string, unknown>;
  if (Object.keys(body).length !== 1 || !Array.isArray(body.eventKeys) || !body.eventKeys.length || body.eventKeys.length > REVIEW_ALERT_BATCH_SIZE) {
    throw new InputError(`Acknowledge between 1 and ${REVIEW_ALERT_BATCH_SIZE} event keys at a time.`);
  }
  if (body.eventKeys.some(key => typeof key !== "string" || !/^(submission|claim|edit):[a-z\d_-]{1,128}:revision:[1-9]\d{0,8}:pending$/i.test(key))) {
    throw new InputError("An alert event key is invalid.");
  }
  return [...new Set(body.eventKeys as string[])];
}

/**
 * Acknowledgement is only a monitor receipt, never a review decision. The exact
 * current version must still be pending when the insert executes. New revisions
 * receive different keys, so an old receipt cannot hide a resubmitted application.
 */
export async function acknowledgeReviewAlerts(db: D1Database, reviewerId: string, input: unknown, now = Date.now()) {
  const eventKeys = validateAlertAcknowledgement(input);
  const statements = eventKeys.map(key => db.prepare(`
    INSERT INTO review_alert_receipts (reviewer_id, event_key, acknowledged_at)
    SELECT ?, event_key, ? FROM (${pendingEventsSql}) WHERE event_key = ?
    ON CONFLICT(reviewer_id, event_key) DO NOTHING
  `).bind(reviewerId, now, key));
  const results = await db.batch(statements);
  const acknowledgedCount = results.reduce((count, result) => count + result.meta.changes, 0);
  return {acknowledgedCount, unchangedCount: eventKeys.length - acknowledgedCount, reviewDecisionsChanged: false};
}
