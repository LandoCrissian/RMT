"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowUpRight, Check, CheckCircle2, Clock3, Inbox, LoaderCircle, LockKeyhole, MessageSquare, Pause, RefreshCw, X } from "lucide-react";
import { formattedDate, readApiResponse, statusLabel, type StudioProps, type Submission } from "./Studio";
import "./studio.css";

type ReviewAction = "approve" | "reject" | "request_changes" | "suspend";

function safeLink(value: string) {
  try { const url = new URL(value); return url.protocol === "https:" ? url.href : null; } catch { return null; }
}

export default function ReviewQueue({ session, onToast }: StudioProps) {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("pending");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [checkedLinks, setCheckedLinks] = useState(false);
  const [confirmedOwnership, setConfirmedOwnership] = useState(false);
  const [action, setAction] = useState<ReviewAction | null>(null);
  const [actionError, setActionError] = useState("");

  const loadQueue = useCallback(async () => {
    if (!session.isAdmin) return;
    setLoading(true);
    setError("");
    try {
      const data = await readApiResponse(await fetch("/api/admin/submissions", { cache: "no-store" }));
      setSubmissions(Array.isArray(data.submissions) ? data.submissions as Submission[] : []);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The review queue could not be loaded."); }
    finally { setLoading(false); }
  }, [session.isAdmin]);

  useEffect(() => { void loadQueue(); }, [loadQueue]);

  const filtered = submissions.filter(item => filter === "all" || item.status === filter || (filter === "needs_changes" && item.status === "changes_requested"));
  const selected = submissions.find(item => item.id === selectedId) ?? filtered[0] ?? null;
  const availableActions: ReviewAction[] = selected ? ({
    pending: ["approve", "request_changes", "reject"],
    needs_changes: ["reject"],
    approved: ["suspend"],
    suspended: ["approve"],
    rejected: [],
  } as Record<string, ReviewAction[]>)[selected.status] ?? [] : [];

  useEffect(() => { setNote(""); setCheckedLinks(false); setConfirmedOwnership(false); setActionError(""); }, [selected?.id, selected?.revision]);

  async function review(nextAction: ReviewAction) {
    if (!selected || action) return;
    if (note.trim().length < 5) { setActionError("Add a short review note before recording a decision."); return; }
    if (nextAction === "approve" && (!checkedLinks || !confirmedOwnership)) { setActionError("Confirm the official links and the applicant’s ownership before publishing."); return; }
    setAction(nextAction);
    setActionError("");
    try {
      await readApiResponse(await fetch(`/api/admin/submissions/${encodeURIComponent(selected.id)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: nextAction, note: note.trim(), checkedLinks, confirmedOwnership, expectedRevision: selected.revision }),
      }));
      onToast(({ approve: "Project approved and published.", reject: "Application marked not approved.", request_changes: "Changes requested. The applicant can update their submission.", suspend: "Project suspended and removed from the directory." })[nextAction]);
      setSelectedId(null);
      await loadQueue();
    } catch (cause) { setActionError(cause instanceof Error ? cause.message : "Your decision could not be saved."); }
    finally { setAction(null); }
  }

  if (!session.isAdmin) return <section className="st-page st-locked"><div className="st-symbol"><LockKeyhole size={26} /></div><p className="st-eyebrow">RMT REVIEW</p><h1>For the review team.</h1><p>Only the RMT owner and authorized reviewers can open applications or publish listings.</p>{!session.authenticated && <a className="st-button st-primary" href="/signin-with-chatgpt?return_to=/%23review" target="_top">Sign in <ArrowUpRight size={16} /></a>}</section>;

  return <section className="st-page" aria-labelledby="review-title">
    <header className="st-heading st-review-heading"><div><p className="st-eyebrow"><span /> OWNER WORKSPACE</p><h1 id="review-title">Good projects.<br /><span>Your call.</span></h1><p>Check the people, the links, and the experience before it goes live.</p></div><button type="button" className="st-button st-secondary" disabled={loading} onClick={() => void loadQueue()}><RefreshCw size={15} className={loading ? "st-spin" : ""} /> Refresh queue</button></header>
    <div className="st-review-metrics"><div><Clock3 size={18} /><strong>{submissions.filter(item => item.status === "pending").length}</strong><span>Waiting for review</span></div><div><MessageSquare size={18} /><strong>{submissions.filter(item => ["needs_changes", "changes_requested"].includes(item.status)).length}</strong><span>Changes requested</span></div><div><CheckCircle2 size={18} /><strong>{submissions.filter(item => item.status === "approved").length}</strong><span>Published applications</span></div></div>
    <div className="st-review-filters" aria-label="Filter applications">{[{ value: "pending", label: "In review" }, { value: "needs_changes", label: "Changes requested" }, { value: "approved", label: "Published" }, { value: "all", label: "All applications" }].map(item => <button key={item.value} type="button" aria-pressed={filter === item.value} className={filter === item.value ? "active" : ""} onClick={() => { setFilter(item.value); setSelectedId(null); }}>{item.label}</button>)}</div>
    {error ? <div className="st-panel"><p className="st-error" role="alert">{error}</p><button type="button" className="st-button st-secondary" onClick={() => void loadQueue()}>Try again</button></div> : loading && submissions.length === 0 ? <div className="st-panel st-review-empty"><LoaderCircle className="st-spin" size={25} /><p>Loading applications…</p></div> : filtered.length === 0 ? <div className="st-panel st-review-empty"><div className="st-symbol"><Inbox size={27} /></div><h2>{filter === "pending" ? "The queue is clear." : "Nothing here yet."}</h2><p>{filter === "pending" ? "New applications will land here. They stay private until you check and approve them." : "Applications with this status will appear here."}</p></div> : <div className="st-review-layout">
      <aside className="st-panel st-review-list" aria-label="Applications">{filtered.map(item => <button type="button" key={item.id} className={selected?.id === item.id ? "st-review-list-item selected" : "st-review-list-item"} onClick={() => setSelectedId(item.id)}><span className="st-project-initial">{item.name.slice(0, 1).toUpperCase()}</span><span><strong>{item.name}</strong><small>{item.category} · {formattedDate(item.createdAt)}</small><span className={`st-status st-status-${item.status}`}>{statusLabel(item.status)}</span></span><ArrowUpRight size={15} /></button>)}</aside>
      {selected && <article className="st-panel st-review-detail"><div className="st-review-detail-title"><div><span className="st-kicker">{selected.category}</span><h2>{selected.name}</h2></div><span className={`st-status st-status-${selected.status}`}>{statusLabel(selected.status)}</span></div><p className="st-review-summary">{selected.summary}</p><dl className="st-review-links">{[{ label: "Official website", value: selected.website }, { label: "Launch destination", value: selected.launchUrl }, { label: "Project X profile", value: selected.xProfile }].map(link => <div key={link.label}><dt>{link.label}</dt><dd>{safeLink(link.value) ? <a href={safeLink(link.value)!} target="_blank" rel="noopener noreferrer">{link.value}<ArrowUpRight size={14} /></a> : link.value}</dd></div>)}{selected.contactEmail && <div><dt>Private contact</dt><dd>{selected.contactEmail}</dd></div>}</dl><section className="st-evidence"><h3>Applicant’s ownership evidence</h3><p>{selected.ownershipEvidence}</p><span>Verification code</span><code>{selected.verificationCode}</code></section>{(selected.reviewNote || selected.reviewerNote) && <div className="st-information"><strong>Previous review note</strong><p>{selected.reviewNote || selected.reviewerNote}</p></div>}
        {selected.status === "needs_changes" && <div className="st-information">Waiting for the applicant to update and resubmit. Their application will return to the review queue when it’s ready.</div>}
        {availableActions.length > 0 && <div className="st-review-decision">
          <h3>Record your review</h3>
          {availableActions.includes("approve") && <>
            <label className="st-check"><input type="checkbox" checked={checkedLinks} onChange={event => setCheckedLinks(event.target.checked)} disabled={!!action} /><span>I checked the project’s official links.</span></label>
            <label className="st-check"><input type="checkbox" checked={confirmedOwnership} onChange={event => setConfirmedOwnership(event.target.checked)} disabled={!!action} /><span>I confirmed the applicant represents this project.</span></label>
          </>}
          <label className="st-field">Review note<textarea value={note} onChange={event => setNote(event.target.value)} placeholder="Explain your decision or the changes the applicant needs to make." minLength={5} maxLength={1000} rows={3} disabled={!!action} /><span className="st-hint">The applicant can see this note.</span></label>
          {actionError && <p className="st-error" role="alert">{actionError}</p>}
          <div className="st-review-actions">{availableActions.map(nextAction => {
            const label = { approve: selected.status === "suspended" ? "Restore listing" : "Approve & publish", request_changes: "Request changes", reject: "Decline", suspend: "Suspend listing" }[nextAction];
            const Icon = { approve: Check, request_changes: MessageSquare, reject: X, suspend: Pause }[nextAction];
            return <button key={nextAction} type="button" className={`st-button ${nextAction === "approve" ? "st-primary" : nextAction === "request_changes" ? "st-secondary" : "st-danger"}`} disabled={!!action || note.trim().length < 5 || (nextAction === "approve" && (!checkedLinks || !confirmedOwnership))} onClick={() => void review(nextAction)}>{action === nextAction ? <LoaderCircle size={16} className="st-spin" /> : <Icon size={16} />}{label}</button>;
          })}</div>
          <p className="st-review-footnote">{availableActions.includes("approve") ? "Approval publishes this listing to the directory. " : ""}Every decision is recorded.</p>
        </div>}

      </article>}
    </div>}
  </section>;
}
