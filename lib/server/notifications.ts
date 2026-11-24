import type { runtime } from "./runtime";

/** Server bindings only. Never use NEXT_PUBLIC_ variables for these values. */
export type NotificationEnvironment = ReturnType<typeof runtime> & {
  RMT_NOTIFICATION_EMAIL?: string;
  RMT_PUBLIC_URL?: string;
  RESEND_API_KEY?: string;
  RMT_EMAIL_FROM?: string;
};

type Channel = "email" | "sms";
type Status = "pending" | "sending" | "sent" | "failed" | "unconfigured" | "uncertain";
type NotificationRow = {
  id: string; event_key: string; kind: "submission" | "claim" | "edit" | "update";
  entity_id: string; project_name: string; channel: Channel; status: Status;
  attempt_count: number; provider_id: string; last_error: string; payload_json: string;
  first_attempt_at: number | null; created_at: number; updated_at: number; sent_at: number | null;
};
type EmailBody = { from: string; to: string[]; subject: string; text: string };
type SavedPayload = {
  version: 1; channel: "email"; body: EmailBody;
  credentialFingerprint: string; ambiguous: boolean;
};
type Outcome = { status: "sent" | "failed" | "uncertain"; providerId: string; error: string };
type RunOptions = { fetch?: typeof fetch; now?: () => number; timeoutMs?: number };
type ChannelConfiguration = { enabled: boolean; configured: boolean; missing: string[] };

// A 23-hour window leaves a margin inside Resend's documented 24-hour retention.
const RETRY_WINDOW_MS = 23 * 60 * 60 * 1000;
const RETRY_DELAY_MS = 60_000;
const SENDING_LEASE_MS = 2 * 60_000;
const MAX_ATTEMPTS = 3;
const REQUEST_TIMEOUT_MS = 8_000;
const CHANNELS: Channel[] = ["email"];
const STATUSES: Status[] = ["pending", "sending", "sent", "failed", "unconfigured", "uncertain"];

function value(input: unknown): string { return typeof input === "string" ? input.trim() : ""; }
function emailAddress(input: string): boolean { return /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(input) && input.length <= 254; }
function senderAddress(input: string): boolean {
  if (/[\r\n]/.test(input) || input.length > 320) return false;
  const address = input.match(/^[^<>]+<([^<>]+)>$/)?.[1] ?? input;
  return emailAddress(address);
}

/** The configured server URL is the only source of notification links. */
export function notificationReviewUrl(env: NotificationEnvironment): string | null {
  try {
    const url = new URL(value(env.RMT_PUBLIC_URL));
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.port || url.href.length > 400) return null;
    if (!url.hostname.includes(".") || url.hostname === "localhost" || /(?:\.local|\.internal)$/.test(url.hostname) || /^[\d.]+$/.test(url.hostname) || url.hostname.includes(":")) return null;
    url.hash = "review";
    return url.href;
  } catch { return null; }
}

export function notificationConfiguration(env: NotificationEnvironment): Record<Channel, ChannelConfiguration> {
  const common: string[] = [];
  if (!notificationReviewUrl(env)) common.push("HTTPS review-site URL");
  if (!value(env.RMT_ADMIN_USER_IDS).split(",").some(id => id.trim())) common.push("Reviewer access");
  const email = [...common];
  if (!emailAddress(value(env.RMT_NOTIFICATION_EMAIL))) email.push("Owner email address");
  if (!senderAddress(value(env.RMT_EMAIL_FROM))) email.push("Verified sender email");
  if (!value(env.RESEND_API_KEY) || /\s/.test(value(env.RESEND_API_KEY))) email.push("Resend API key");
  return {
    email: {enabled: true, configured: email.length === 0, missing: email},
    sms: {enabled: false, configured: false, missing: []},
  };
}

function effectiveStatus(row: Pick<NotificationRow, "status" | "updated_at">, now: number): Status {
  return row.status === "sending" && row.updated_at <= now - SENDING_LEASE_MS ? "uncertain" : row.status;
}

function retryable(row: NotificationRow, configured: boolean, now: number): boolean {
  if (row.channel !== "email" || !configured || row.provider_id || row.attempt_count >= MAX_ATTEMPTS) return false;
  if (["invalid_saved_payload", "provider_configuration_changed"].includes(row.last_error)) return false;
  const status = effectiveStatus(row, now);
  if (row.first_attempt_at !== null && row.first_attempt_at <= now - RETRY_WINDOW_MS) return false;
  if (row.attempt_count === 0 && (status === "pending" || status === "unconfigured")) return true;
  if (row.updated_at > now - RETRY_DELAY_MS) return false;
  return status === "failed" || (status === "uncertain" && row.channel === "email");
}

function eligibilitySql(): string {
  return `provider_id = '' AND attempt_count < ${MAX_ATTEMPTS}
    AND last_error NOT IN ('invalid_saved_payload', 'provider_configuration_changed')
    AND (first_attempt_at IS NULL OR first_attempt_at > ?)
    AND ((attempt_count = 0 AND status IN ('pending', 'unconfigured'))
      OR (updated_at <= ? AND (status = 'failed' OR (status = 'uncertain' AND channel = 'email'))))`;
}

/** Read-only, admin-facing summary. No credentials, recipient addresses or frozen payloads leave the server. */
export async function notificationStatus(db: D1Database, env: NotificationEnvironment, now = Date.now()) {
  const channels = notificationConfiguration(env);
  const [totals, recent, ready] = await Promise.all([
    db.prepare(`SELECT CASE WHEN status = 'sending' AND updated_at <= ? THEN 'uncertain' ELSE status END AS status,
      COUNT(*) AS count FROM notification_outbox WHERE channel = 'email' GROUP BY 1`).bind(now - SENDING_LEASE_MS).all<{status: Status; count: number}>(),
    db.prepare("SELECT * FROM notification_outbox WHERE channel = 'email' ORDER BY created_at DESC, id DESC LIMIT 40").all<NotificationRow>(),
    db.prepare(`SELECT COUNT(*) AS count FROM (SELECT provider_id, attempt_count, first_attempt_at, updated_at, channel, last_error,
      CASE WHEN status = 'sending' AND updated_at <= ? THEN 'uncertain' ELSE status END AS status FROM notification_outbox) WHERE ${eligibilitySql()}
      AND ((channel = 'email' AND ? = 1) OR (channel = 'sms' AND ? = 1))`)
      .bind(now - SENDING_LEASE_MS, now - RETRY_WINDOW_MS, now - RETRY_DELAY_MS, Number(channels.email.configured), Number(channels.sms.configured)).first<{count: number}>(),
  ]);
  const counts = Object.fromEntries(STATUSES.map(status => [status, 0])) as Record<Status, number>;
  for (const row of totals.results) if (STATUSES.includes(row.status)) counts[row.status] = Number(row.count);
  return {
    channels, counts, readyCount: Number(ready?.count ?? 0), batchSize: 3,
    deliveryConfirmed: false,
    recent: recent.results.map(row => ({
      id: row.id, kind: row.kind, projectName: row.project_name, channel: row.channel,
      status: effectiveStatus(row, now), attempts: row.attempt_count, providerId: row.provider_id || null,
      issue: issueMessage(row.last_error), createdAt: row.created_at, updatedAt: row.updated_at,
      acceptedAt: row.sent_at, retryable: retryable(row, channels[row.channel].configured, now),
    })),
  };
}

function issueMessage(code: string): string | null {
  if (!code) return null;
  if (code === "configuration_needed") return "Notification setup is incomplete.";
  if (code === "interrupted_attempt") return "The previous attempt ended before its outcome was recorded. Check provider logs.";
  if (code === "provider_configuration_changed") return "Provider credentials changed after an uncertain attempt. Check provider logs before sending again.";
  if (code === "invalid_saved_payload") return "The saved alert needs manual review before another attempt.";
  if (code === "outcome_unknown") return "The provider outcome is unknown. Check provider logs before further action.";
  if (code === "provider_reported_failure") return "The provider created a message but reported failure. Check its message log.";
  if (/^provider_http_\d{3}$/.test(code)) return `The provider rejected the request (HTTP ${code.slice(-3)}).`;
  return "Check the provider message log before another attempt.";
}

async function fingerprint(secret: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

function projectName(name: string): string { return name.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80) || "An RMT project"; }

async function newPayload(row: NotificationRow, env: NotificationEnvironment): Promise<SavedPayload> {
  const reviewUrl = notificationReviewUrl(env)!;
  const name = projectName(row.project_name);
  const event = row.kind === "claim" ? "ownership claim" : row.kind === "edit" ? "listing edit" : row.kind === "update" ? "project announcement" : "project application";
  return {
    version: 1, channel: "email", ambiguous: false,
    credentialFingerprint: await fingerprint(value(env.RESEND_API_KEY)),
    body: {
      from: value(env.RMT_EMAIL_FROM), to: [value(env.RMT_NOTIFICATION_EMAIL)],
      subject: `RMT: new ${event} — ${name}`,
      text: `A ${event} for ${name} was submitted to RMT.\n\nOpen the review workspace to check its current status:\n${reviewUrl}\n\nSign in with your reviewer account. Opening this link does not approve or publish a project.`,
    },
  };

}

function savedPayload(row: NotificationRow): SavedPayload | null {
  try {
    const payload = JSON.parse(row.payload_json) as SavedPayload;
    if (payload.version !== 1 || payload.channel !== row.channel || !payload.body || !/^[a-f\d]{64}$/.test(payload.credentialFingerprint)) return null;
    if (row.channel !== "email" || payload.channel !== "email") return null;
    const body = payload.body;
    if (!senderAddress(body.from) || !Array.isArray(body.to) || body.to.length !== 1 || !emailAddress(body.to[0]) || typeof body.subject !== "string" || typeof body.text !== "string") return null;
    return payload;
  } catch { return null; }
}

async function readProviderResponse(response: Response): Promise<Record<string, unknown>> {
  if (!response.body) return {};
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const {done, value: chunk} = await reader.read();
    if (done) break;
    length += chunk.byteLength;
    if (length > 8192) { await reader.cancel(); throw new Error("ProviderResponseTooLarge"); }
    chunks.push(chunk);
  }
  const buffer = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.byteLength; }
  const data: unknown = JSON.parse(new TextDecoder().decode(buffer));
  return data && typeof data === "object" && !Array.isArray(data) ? data as Record<string, unknown> : {};
}

async function send(row: NotificationRow, payload: SavedPayload, env: NotificationEnvironment, options: RunOptions): Promise<Outcome> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(1, Math.min(options.timeoutMs ?? REQUEST_TIMEOUT_MS, REQUEST_TIMEOUT_MS)));
  try {
    const response = await (options.fetch ?? fetch)("https://api.resend.com/emails", {
      method: "POST", redirect: "error", signal: controller.signal,
      headers: {
        "Authorization": `Bearer ${value(env.RESEND_API_KEY)}`, "Content-Type": "application/json",
        "Idempotency-Key": `rmt-notification/${row.id}`,
      },
      body: JSON.stringify(payload.body),
    });
    // An explicit 4xx rejection is retryable. Timeout/conflict/server errors may
    // have accepted the message; never treat those as evidence of non-delivery.
    if (!response.ok) {
      await response.body?.cancel();
      const definite = response.status >= 400 && response.status < 500 && ![408, 409, 425].includes(response.status);
      return {status: definite && !payload.ambiguous ? "failed" : "uncertain", providerId: "", error: definite ? `provider_http_${response.status}` : "outcome_unknown"};
    }
    const data = await readProviderResponse(response);
    if (typeof data.id === "string" && /^[a-z\d_-]{6,128}$/i.test(data.id)) return {status: "sent", providerId: data.id, error: ""};
    return {status: "uncertain", providerId: "", error: "outcome_unknown"};
  } catch {
    // No raw exception/provider body is persisted or logged: it may contain PII.
    return {status: "uncertain", providerId: "", error: "outcome_unknown"};
  } finally { clearTimeout(timeout); }
}

/**
 * Bounded, awaited delivery. A durable CAS claims each row before any HTTP call.
 * "sent" means provider accepted, never inbox delivery confirmation.
 */
export async function flushNotifications(db: D1Database, env: NotificationEnvironment, limit = 3, options: RunOptions = {}) {
  const now = options.now ?? Date.now;
  const started = now();
  const batchSize = Math.max(0, Math.min(3, Number.isFinite(limit) ? Math.floor(limit) : 3));
  const summary = {attempted: 0, accepted: 0, failed: 0, uncertain: 0, unconfigured: 0};
  const configured = notificationConfiguration(env);
  await db.prepare(`UPDATE notification_outbox SET status = 'uncertain', last_error = 'interrupted_attempt'
    WHERE channel = 'email' AND status = 'sending' AND updated_at <= ?`).bind(started - SENDING_LEASE_MS).run();
  for (const channel of CHANNELS) {
    if (configured[channel].configured) continue;
    const result = await db.prepare(`UPDATE notification_outbox SET status = 'unconfigured', last_error = 'configuration_needed', updated_at = ?
      WHERE channel = ? AND status = 'pending' AND attempt_count = 0`).bind(started, channel).run();
    summary.unconfigured += result.meta.changes;
  }
  if (!batchSize) return summary;
  const rows = await db.prepare(`SELECT * FROM notification_outbox WHERE ${eligibilitySql()}
    AND ((channel = 'email' AND ? = 1) OR (channel = 'sms' AND ? = 1))
    ORDER BY CASE WHEN attempt_count = 0 THEN 0 ELSE 1 END, created_at, id LIMIT ?`)
    .bind(started - RETRY_WINDOW_MS, started - RETRY_DELAY_MS, Number(configured.email.configured), Number(configured.sms.configured), batchSize).all<NotificationRow>();
  for (const row of rows.results) {
    const attemptAt = now();
    if (!retryable(row, configured[row.channel].configured, attemptAt)) continue;
    let payload = row.attempt_count === 0 ? await newPayload(row, env) : savedPayload(row);
    if (!payload) {
      await db.prepare("UPDATE notification_outbox SET status = 'uncertain', last_error = 'invalid_saved_payload', updated_at = ? WHERE id = ? AND status = ? AND attempt_count = ?")
        .bind(attemptAt, row.id, row.status, row.attempt_count).run();
      summary.uncertain++;
      continue;
    }
    payload.ambiguous = payload.ambiguous || row.status === "uncertain";
    const currentFingerprint = await fingerprint(value(env.RESEND_API_KEY));
    if (payload.ambiguous && currentFingerprint !== payload.credentialFingerprint) {
      await db.prepare("UPDATE notification_outbox SET status = 'uncertain', last_error = 'provider_configuration_changed', updated_at = ? WHERE id = ? AND status = ? AND attempt_count = ?")
        .bind(attemptAt, row.id, row.status, row.attempt_count).run();
      summary.uncertain++;
      continue;
    }
    // Credential fixes after a definite rejection are safe; an uncertain
    // attempt must use the original account/key and identical provider body.
    payload = {...payload, credentialFingerprint: currentFingerprint};
    const claimed = await db.prepare(`UPDATE notification_outbox SET status = 'sending', attempt_count = attempt_count + 1,
      first_attempt_at = COALESCE(first_attempt_at, ?), payload_json = ?, last_error = '', updated_at = ?
      WHERE id = ? AND status = ? AND attempt_count = ? AND updated_at = ? AND provider_id = ''`)
      .bind(attemptAt, JSON.stringify(payload), attemptAt, row.id, row.status, row.attempt_count, row.updated_at).run();
    if (!claimed.meta.changes) continue;
    summary.attempted++;
    const outcome = await send(row, payload, env, options);
    if (outcome.status === "uncertain") payload.ambiguous = true;
    const completed = now();
    await db.prepare(`UPDATE notification_outbox SET status = ?, provider_id = ?, last_error = ?, payload_json = ?, updated_at = ?, sent_at = ?
      WHERE id = ? AND status = 'sending' AND attempt_count = ?`)
      .bind(outcome.status, outcome.providerId, outcome.error, JSON.stringify(payload), completed, outcome.status === "sent" ? completed : null, row.id, row.attempt_count + 1).run();
    if (outcome.status === "sent") summary.accepted++;
    else summary[outcome.status]++;
  }
  return summary;
}

/** Use only after the application transaction commits; alert failures cannot undo the saved application. */
export async function dispatchNotifications(db: D1Database, env: NotificationEnvironment): Promise<void> {
  try { await flushNotifications(db, env, 3); }
  catch { console.error("RMT notification queue processing was interrupted; saved applications are unchanged."); }
}
