"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, CheckCircle2, Clock3, Inbox, LoaderCircle, LockKeyhole, Mail, RefreshCw, Sparkles } from "lucide-react";
import { formattedDate, readApiResponse, type StudioProps } from "./studio-shared";
import "./notification-settings.css";

type AlertStatus = "pending" | "sending" | "sent" | "failed" | "unconfigured" | "uncertain";
type NotificationReport = {
  channels: Record<"email" | "sms", {enabled: boolean; configured: boolean; missing: string[]}>;
  counts: Record<AlertStatus, number>;
  readyCount: number;
  batchSize: number;
  deliveryConfirmed: boolean;
  recent: Array<{
    id: string; kind: "submission" | "claim" | "edit" | "update"; projectName: string; channel: "email" | "sms";
    status: AlertStatus; attempts: number; providerId: string | null; issue: string | null;
    createdAt: number; updatedAt: number; acceptedAt: number | null; retryable: boolean;
  }>;
};

const statusLabels: Record<AlertStatus, string> = {
  pending: "Queued", sending: "Contacting provider", sent: "Accepted by provider", failed: "Attempt failed",
  unconfigured: "Setup needed", uncertain: "Outcome unknown",
};

export default function NotificationSettings({session, onToast}: StudioProps) {
  const canAccess=session.isAdmin&&session.controlCapabilities?.includes('health')===true;
  const [report, setReport] = useState<NotificationReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (signal?: AbortSignal) => {
    if (!canAccess) return;
    setLoading(true);
    setError("");
    try {
      const data = await readApiResponse(await fetch("/api/admin/notifications", {cache: "no-store", signal,headers:{"X-RMT-Account":session.userId||""}}));
      if (!signal?.aborted) setReport(data.notifications as NotificationReport);
    } catch (cause) {
      if (!signal?.aborted) setError(cause instanceof Error ? cause.message : "Notification status could not be loaded.");
    } finally { if (!signal?.aborted) setLoading(false); }
  }, [canAccess,session.userId]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  async function retry() {
    if (retrying || !canAccess) return;
    setRetrying(true);
    setError("");
    try {
      const data = await readApiResponse(await fetch("/api/admin/notifications", {
        method: "POST", headers: {"Content-Type": "application/json","X-RMT-Account":session.userId||""}, body: JSON.stringify({action: "retry"}),
      }));
      setReport(data.notifications as NotificationReport);
      const result = data.result as {attempted: number; accepted: number; failed: number; uncertain: number};
      onToast(result.attempted
        ? `${result.accepted} alert${result.accepted === 1 ? "" : "s"} accepted by the provider. ${result.failed + result.uncertain ? "Some attempts need attention below." : "Delivery is not yet confirmed."}`
        : "No alerts were sent. Check configuration and retry availability below.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The notification queue could not be processed."); }
    finally { setRetrying(false); }
  }

  if (!canAccess) return <section className="nt-locked"><LockKeyhole size={24} /><h2>Administrator access required.</h2><p>Notification settings are available to the RMT owner and administrators.</p></section>;

  return <section className="nt-workspace" aria-labelledby="notification-title" aria-busy={loading || retrying}>
    <header className="nt-heading">
      <div><span className="nt-eyebrow"><Bell size={14} /> OWNER ALERTS</span><h2 id="notification-title">Know when builders arrive.</h2><p>Let your dot watch for new builders, with optional email alerts for your review queue.</p></div>
      <button type="button" className="nt-button nt-secondary" disabled={loading || retrying} onClick={() => void load()}><RefreshCw size={15} className={loading ? "nt-spin" : ""} /> Refresh status</button>
    </header>

    {error && <div className="nt-error" role="alert">{error}</div>}
    {!report && loading ? <div className="nt-empty"><LoaderCircle size={24} className="nt-spin" /><p>Checking alert setup…</p></div> : report && <>
      <div className="nt-channel-grid">
        <article className="nt-channel">
          <div className="nt-channel-top"><span className="nt-channel-icon"><Sparkles size={22} /></span><span className="nt-badge">Managed in ChatGPT</span></div>
          <h3>Your dot, on watch.</h3><p>Your dot can check for new applications, ownership claims, and project updates, then bring you back here to review them. No phone number needed.</p>
          <div className="nt-channel-note"><Bell size={16} /><span>The connection and monitoring schedule are set up in ChatGPT. This page does not confirm that a schedule is running.</span></div>
        </article>
        <article className={`nt-channel ${report.channels.email.configured ? "nt-configured" : ""}`}>
          <div className="nt-channel-top"><span className="nt-channel-icon"><Mail size={22} /></span><span className={`nt-badge ${report.channels.email.configured ? "nt-badge-ready" : "nt-badge-setup"}`}>{report.channels.email.configured ? "Configured" : "Setup needed"}</span></div>
          <h3>Email alerts</h3><p>A short email with a link to your private review workspace. Your recipient address stays private.</p>
          {report.channels.email.configured ? <div className="nt-channel-note"><CheckCircle2 size={16} /><span>Server settings are present. Check recent attempts below to confirm provider acceptance.</span></div> : <div className="nt-setup-list"><strong>Still needed</strong><ul>{report.channels.email.missing.map(item => <li key={item}>{item}</li>)}</ul></div>}
        </article>
      </div>

      {!report.channels.email.configured && <aside className="nt-setup-note"><LockKeyhole size={18} /><p>Recipients, sender settings, and provider credentials are configured privately on the server. Applications remain saved for review while alert setup is incomplete.</p></aside>}

      <div className="nt-metrics" aria-label="Alert totals">
        <div><Clock3 size={18} /><strong>{report.counts.pending + report.counts.unconfigured}</strong><span>Waiting</span></div>
        <div><CheckCircle2 size={18} /><strong>{report.counts.sent}</strong><span>Provider accepted</span></div>
        <div><Bell size={18} /><strong>{report.counts.failed + report.counts.uncertain}</strong><span>Need attention</span></div>
      </div>

      <div className="nt-queue-heading"><div><h3>Recent alert attempts</h3><p>Acceptance means the provider has the alert. Inbox delivery is not confirmed here.</p></div><button type="button" className="nt-button nt-primary" disabled={retrying || loading || report.readyCount === 0} onClick={() => void retry()}>{retrying ? <LoaderCircle size={16} className="nt-spin" /> : <RefreshCw size={16} />} {retrying ? "Processing alerts…" : "Retry ready alerts"}</button></div>
      <p className="nt-queue-hint">{report.readyCount > 0 ? `${report.readyCount} alert${report.readyCount === 1 ? " is" : "s are"} ready. Each retry processes up to ${report.batchSize}.` : "No alerts are ready for a retry right now."} Failed attempts wait at least one minute between retries. An unknown outcome remains visible for follow-up.</p>

      {report.recent.length === 0 ? <div className="nt-empty"><Inbox size={27} /><h4>No alerts yet.</h4><p>The first application or ownership request will start this history.</p></div> : <ol className="nt-history">{report.recent.map(item => <li key={item.id}>
        <span className="nt-history-icon"><Mail size={18} /></span>
        <div className="nt-history-copy"><strong>{item.projectName}</strong><span>{item.kind === "claim" ? "Ownership claim" : item.kind === "update" ? "Project announcement" : item.kind === "edit" ? "Listing edit" : "Project application"} · Email · {formattedDate(item.createdAt)}</span>{item.issue && <p>{item.issue}</p>}{item.providerId && ["failed", "uncertain"].includes(item.status) && <code>Provider reference: {item.providerId}</code>}</div>
        <div className="nt-history-state"><span className={`nt-badge nt-state-${item.status}`}>{statusLabels[item.status]}</span><small>{item.attempts ? `${item.attempts} attempt${item.attempts === 1 ? "" : "s"}` : "Not attempted"}</small></div>
      </li>)}</ol>}
      <p className="nt-footnote">Each alert opens the private review workspace. Publication still requires your review decision. Text alerts are off.</p>
    </>}
  </section>;
}
