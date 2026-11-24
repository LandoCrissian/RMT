"use client";

import { useEffect, useRef, useState } from "react";
import { Archive, ArrowUpRight, Check, Clock3, Inbox, LoaderCircle, RefreshCw, X } from "lucide-react";
import type { UpdateStatus } from "@/lib/project-updates";
import { formattedDate, safeHttpsLink, type StudioProps } from "./studio-shared";
import ProjectUpdatePreview, { UpdateStatusBadge, updateKindLabels } from "./ProjectUpdatePreview";
import { UpdateRequestError, useProjectUpdates } from "./use-project-updates";
import "./project-updates-studio.css";

export default function ProjectUpdatesReview(props: StudioProps) {
  if (!props.session.isAdmin) return null;
  return <UpdatesReviewWorkspace key={props.session.userId ?? "guest"} {...props} />;
}

function UpdatesReviewWorkspace({ session, onToast }: StudioProps) {
  const updates = useProjectUpdates(session, { review: true });
  const [filter, setFilter] = useState<"all" | UpdateStatus>("pending");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [checked, setChecked] = useState(false);
  const [action, setAction] = useState<"approve" | "reject" | "archive" | null>(null);
  const [actionError, setActionError] = useState("");
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const [archivePrompt, setArchivePrompt] = useState(false);
  const active = useRef(true);
  const actionRef = useRef(false);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const filtered = updates.updates.filter(row => filter === "all" || row.status === filter);
  const selected = filtered.find(row => row.id === selectedId) ?? filtered[0] ?? null;
  const busy = Boolean(action) || updates.busy;
  const disabled = busy || updates.loading || needsRefresh || !updates.ready;

  useEffect(() => { setNote(""); setChecked(false); setActionError(""); setArchivePrompt(false); }, [selected?.id, selected?.revision]);

  async function decide(nextAction: "approve" | "reject" | "archive") {
    if (!selected || disabled || actionRef.current) return;
    if (nextAction !== "approve" && note.trim().length < 5) { setActionError("Add a short note so the project owner understands this decision."); return; }
    if (nextAction === "approve" && (!checked || !selected.canManage)) { setActionError("Check the content and destination before publishing. Current project management access is also required."); return; }
    actionRef.current = true; setAction(nextAction); setActionError("");
    try {
      const row = await updates.mutate(selected.id, { action: nextAction, expectedRevision: selected.revision, note: note.trim() });
      if (!row || !active.current) return;
      setArchivePrompt(false);
      onToast(nextAction === "approve" ? "Update approved. It now appears on the project showcase." : nextAction === "reject" ? "Feedback saved. The owner can revise and resubmit this update." : "Update archived and removed from the public showcase.");
    } catch (cause) {
      if (!active.current) return;
      setActionError(cause instanceof Error ? cause.message : "Your review could not be saved.");
      if (cause instanceof UpdateRequestError && cause.uncertain) setNeedsRefresh(true);
    } finally { if (active.current) { actionRef.current = false; setAction(null); } }
  }

  function refresh() { if (busy) return; setNeedsRefresh(false); setActionError(""); setSelectedId(null); void updates.refresh(); }

  if (updates.accountChanged) return <section className="st-panel st-signin" role="alert"><div className="st-symbol"><RefreshCw size={25} /></div><h2>Your account or access changed.</h2><p>Refresh RMT to check your current account and review access. Private review content has been hidden.</p><button type="button" className="st-button st-primary" onClick={() => window.location.reload()}>Refresh RMT <RefreshCw size={15} /></button></section>;

  return <section className="st-queue-section up-review" aria-labelledby="up-review-title">
    <div className="st-section-heading"><div><h2 id="up-review-title">Project updates</h2><span className="st-count">{updates.updates.filter(row => row.status === "pending").length} shown in review</span></div><button type="button" className="st-text-button" disabled={busy || updates.loading} onClick={refresh}><RefreshCw size={14} className={updates.loading ? "st-spin" : ""} />Refresh</button></div>
    <p className="st-panel-intro">Read the announcement and check its destination. Approval adds it to the project’s public showcase; draft content and review notes stay private.</p>
    <div className="st-review-filters" aria-label="Filter update reviews">{(["pending", "approved", "rejected", "archived", "all"] as const).map(value => <button type="button" key={value} aria-pressed={filter === value} className={filter === value ? "active" : ""} disabled={busy} onClick={() => { setFilter(value); setSelectedId(null); }}>{({pending:"In review",approved:"Published",rejected:"Changes needed",archived:"Archived",all:"All updates"})[value]}</button>)}</div>
    {updates.error && <p className="st-error" role="alert">{updates.error}</p>}
    {updates.loading && !updates.updates.length ? <div className="st-panel st-review-empty"><LoaderCircle className="st-spin" size={25} /><p>Loading project updates…</p></div> : updates.ready && !filtered.length ? <div className="st-panel st-review-empty"><div className="st-symbol"><Inbox size={27} /></div><h2>{updates.hasMore ? "No matching updates loaded yet." : filter === "pending" ? "The update queue is clear." : "No updates here yet."}</h2><p>{updates.hasMore ? "Load more updates to continue through the review history." : filter === "pending" ? "Submitted announcements, development notes, and releases will appear here for your review." : "Updates with this status will appear here."}</p></div> : selected && <div className="st-review-layout up-review-layout">
      <aside className="st-panel st-review-list up-review-list" aria-label="Project update reviews">{filtered.map(row => <button type="button" key={row.id} disabled={busy} className={`st-review-list-item${selected.id === row.id ? " selected" : ""}`} onClick={() => setSelectedId(row.id)}><span className="st-project-initial">{row.projectName.slice(0, 1)}</span><span><strong>{row.title || "Untitled update"}</strong><small>{row.projectName}<br />{updateKindLabels[row.kind]} · {formattedDate(row.updatedAt)}</small><UpdateStatusBadge status={row.status} /></span><ArrowUpRight size={14} /></button>)}</aside>
      <article className="st-panel up-review-detail"><div className="up-review-detail-top"><span className="st-kicker">PROJECT UPDATE REVIEW</span><UpdateStatusBadge status={selected.status} /></div>
        <ProjectUpdatePreview content={selected} projectName={selected.projectName} caption={selected.status === "approved" ? `Published ${formattedDate(selected.publishedAt ?? selected.updatedAt)}` : "Submitted by the project manager"} />
        {selected.linkUrl && <dl className="st-review-links up-review-destination"><div><dt>Destination behind “{selected.linkLabel}”</dt><dd>{safeHttpsLink(selected.linkUrl) ? <a href={selected.linkUrl} target="_blank" rel="noopener noreferrer">{selected.linkUrl}<ArrowUpRight size={14} /></a> : "The saved destination is invalid."}</dd></div></dl>}
        {selected.reviewNote && <div className="up-feedback"><span>PREVIOUS REVIEW NOTE</span><p>{selected.reviewNote}</p></div>}
        {!selected.canManage && <div className="up-state-message"><Clock3 size={17} /><p>The original publisher no longer has matching management access, or this project is no longer public. This update cannot be approved. You can still record feedback or archive a published copy.</p></div>}
        {(selected.status === "pending" || selected.status === "approved") && <section className="st-review-decision up-review-decision"><h3>{selected.status === "pending" ? "Your review" : "Manage this publication"}</h3>
          {selected.status === "pending" && <label className="st-check"><input type="checkbox" checked={checked} onChange={event => setChecked(event.target.checked)} disabled={disabled || !selected.canManage} /><span>I’ve checked this update and its destination, if one is included.</span></label>}
          <label className="st-field">Note to the project owner <span className="st-optional">{selected.status === "pending" ? "Optional when approving · required when requesting changes" : "Required when archiving"}</span><textarea value={note} maxLength={1000} rows={3} disabled={disabled} onChange={event => setNote(event.target.value)} placeholder="Keep the feedback specific and helpful." /></label>
          {actionError && <p className="st-error" role="alert">{actionError}</p>}
          {needsRefresh && <button type="button" className="st-button st-secondary up-refresh-needed" onClick={refresh}><RefreshCw size={14} />Refresh to confirm the saved decision</button>}
          {archivePrompt && <div className="up-confirm" role="alert"><strong>Remove this update from the public showcase?</strong><p>The owner will see your note, and the update will remain in the review history.</p><div><button type="button" className="st-button st-secondary" disabled={disabled} onClick={() => setArchivePrompt(false)}>Cancel</button><button type="button" className="st-button st-danger" disabled={disabled || note.trim().length < 5} onClick={() => void decide("archive")}><Archive size={14} />Confirm archive</button></div></div>}
          <div className="st-review-actions">{selected.status === "pending" ? <><button type="button" className="st-button st-primary" disabled={disabled || !checked || !selected.canManage} onClick={() => void decide("approve")}>{action === "approve" ? <LoaderCircle size={15} className="st-spin" /> : <Check size={15} />}Approve & publish</button><button type="button" className="st-button st-secondary" disabled={disabled || note.trim().length < 5} onClick={() => void decide("reject")}>{action === "reject" ? <LoaderCircle size={15} className="st-spin" /> : <X size={15} />}Request changes</button></> : !archivePrompt && <button type="button" className="st-button st-danger" disabled={disabled || note.trim().length < 5} onClick={() => setArchivePrompt(true)}><Archive size={15} />Archive update</button>}</div>
          <p className="st-review-footnote">The current ownership and update revision are checked again when your decision is saved.</p>
        </section>}
      </article>
    </div>}
    {updates.hasMore && <div className="up-load-more"><button type="button" className="st-button st-secondary" disabled={updates.loading || busy} onClick={() => void updates.loadMore()}>{updates.loading ? <LoaderCircle size={15} className="st-spin" /> : <PlusIcon />}Load more updates</button></div>}
  </section>;
}

function PlusIcon() { return <span aria-hidden="true">+</span>; }
