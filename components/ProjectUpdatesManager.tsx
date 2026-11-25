"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Archive, ArrowLeft, ArrowUpRight, Check, Clock3, FilePenLine, Layers3, LoaderCircle, Plus, RefreshCw, Save, Send, Undo2 } from "lucide-react";
import type { Project } from "@/lib/catalog";
import { projectPath } from "@/lib/project-sharing";
import type { ProjectUpdate, UpdateContent, UpdateStatus } from "@/lib/project-updates";
import { formattedDate, type StudioProps } from "./studio-shared";
import ProjectUpdatePreview, { UpdateStatusBadge, updateKindLabels } from "./ProjectUpdatePreview";
import { UpdateRequestError, useProjectUpdates } from "./use-project-updates";
import "./project-updates-studio.css";

const emptyContent: UpdateContent = { kind: "announcement", title: "", body: "", linkLabel: "", linkUrl: "" };
function contentOf(row: ProjectUpdate): UpdateContent { return { kind: row.kind, title: row.title, body: row.body, linkLabel: row.linkLabel, linkUrl: row.linkUrl }; }
type Navigation = { action: "select"; id: string } | { action: "new" | "back" | "refresh" };

export default function ProjectUpdatesManager(props: StudioProps & { project: Project; onBack: () => void }) {
  return <UpdatesWorkspace key={`${props.session.userId ?? "guest"}:${props.project.id}`} {...props} />;
}

function UpdatesWorkspace({ session, onToast, project, onBack }: StudioProps & { project: Project; onBack: () => void }) {
  const updates = useProjectUpdates(session, { projectId: project.id });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<UpdateContent>({ ...emptyContent });
  const [operation, setOperation] = useState<string | null>(null);
  const [formError, setFormError] = useState("");
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<Navigation | null>(null);
  const [archivePrompt, setArchivePrompt] = useState(false);
  const [filter, setFilter] = useState<"all" | UpdateStatus>("all");
  const editor = useRef<HTMLDivElement>(null);
  const active = useRef(true);
  const operationRef = useRef(false);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const selected = updates.updates.find(row => row.id === selectedId) ?? null;
  const editable = !selected || ((selected.status === "draft" || selected.status === "rejected") && selected.canManage);
  const dirty = !updates.accountChanged && editable && JSON.stringify(form) !== JSON.stringify(selected ? contentOf(selected) : emptyContent);
  const busy = Boolean(operation) || updates.busy;
  const disabled = busy || updates.loading || !updates.ready || needsRefresh || !session.authenticated;
  const checkingSavedResult = needsRefresh && pendingNavigation?.action === "refresh";
  const filtered = updates.updates.filter(row => filter === "all" || row.status === filter);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function moveToEditor() { editor.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }
  function navigate(destination: Navigation, discard = false) {
    if (busy) return;
    if (dirty && !discard) { setPendingNavigation(destination); return; }
    setPendingNavigation(null); setFormError(""); setArchivePrompt(false);
    if (destination.action === "back") { onBack(); return; }
    if (destination.action === "refresh") {
      setSelectedId(null); setForm({ ...emptyContent }); setNeedsRefresh(false); void updates.refresh(); return;
    }
    const row = destination.action === "select" ? updates.updates.find(value => value.id === destination.id) : null;
    setSelectedId(row?.id ?? null); setForm(row ? contentOf(row) : { ...emptyContent });
    moveToEditor();
  }

  function change<K extends keyof UpdateContent>(key: K, value: UpdateContent[K]) { setForm(previous => ({ ...previous, [key]: value })); setFormError(""); }
  function accept(row: ProjectUpdate) { setSelectedId(row.id); setForm(contentOf(row)); setFormError(""); }

  async function save(send = false) {
    if (disabled || !editable || operationRef.current) return;
    setFormError("");
    if (send && (form.title.trim().length < 5 || form.body.trim().length < 20)) { setFormError("Add a title of at least 5 characters and an update of at least 20 characters before sending it for review."); return; }
    if (Boolean(form.linkLabel.trim()) !== Boolean(form.linkUrl.trim()) || (form.linkLabel.trim() && form.linkLabel.trim().length < 2)) { setFormError("Add both a link label of at least 2 characters and its HTTPS address, or leave both blank."); return; }
    if (!selected && !form.title.trim() && !form.body.trim()) { setFormError("Give your draft a title or a few words before saving it."); return; }
    operationRef.current = true; setOperation(send ? "submit" : "save");
    try {
      let row = selected;
      if (!row || dirty || row.status === "rejected") {
        row = await updates.mutate(row?.id ?? null, row ? { action: "save", expectedRevision: row.revision, ...form } : { projectId: project.id, ...form });
        if (!row || !active.current) return;
        accept(row);
      }
      if (send) {
        row = await updates.mutate(row.id, { action: "submit", expectedRevision: row.revision });
        if (!row || !active.current) return;
        accept(row);
      }
      if (active.current) onToast(send ? "Update sent for review. You’ll see the decision here." : "Draft saved to your RMT account.");
    } catch (cause) {
      if (!active.current) return;
      setFormError(cause instanceof Error ? cause.message : "Your update could not be saved.");
      if (cause instanceof UpdateRequestError && cause.uncertain) setNeedsRefresh(true);
    } finally { if (active.current) { operationRef.current = false; setOperation(null); } }
  }

  async function changeStatus(action: "withdraw" | "archive") {
    if (!selected || disabled || operationRef.current || !selected.canManage) return;
    operationRef.current = true; setOperation(action); setFormError("");
    try {
      const row = await updates.mutate(selected.id, { action, expectedRevision: selected.revision });
      if (!row || !active.current) return;
      accept(row); setArchivePrompt(false);
      onToast(action === "withdraw" ? "Update returned to drafts. You can keep working on it." : selected.status === "approved" ? "Update archived. It is no longer shown on the project page." : "Draft archived. Your saved copy stays in the update history.");
    } catch (cause) {
      if (!active.current) return;
      setFormError(cause instanceof Error ? cause.message : "Your change could not be saved.");
      if (cause instanceof UpdateRequestError && cause.uncertain) setNeedsRefresh(true);
    } finally { if (active.current) { operationRef.current = false; setOperation(null); } }
  }

  const submitForm = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); void save(true); };

  if (updates.accountChanged) return <section className="st-panel st-signin" role="alert"><div className="st-symbol"><RefreshCw size={25} /></div><h2>Your account or access changed.</h2><p>Refresh RMT to check your current account and project access. Private drafts have been hidden.</p><button type="button" className="st-button st-primary" onClick={() => window.location.reload()}>Refresh RMT <RefreshCw size={15} /></button></section>;

  return <section className="up-workspace" aria-labelledby="up-workspace-title">
    <div className="up-toolbar"><button type="button" className="st-text-button" disabled={busy} onClick={() => navigate({ action: "back" })}><ArrowLeft size={14} />My projects</button><a href={`${projectPath(project)}#updates`} className="st-text-button">View showcase <ArrowUpRight size={14} /></a></div>
    <header className="up-heading"><div><span className="st-kicker">{project.name} · PROJECT UPDATES</span><h2 id="up-workspace-title">Keep the story moving<span>.</span></h2><p>Share a new release, a work in progress, or a small win. Give people a reason to come back.</p></div><div className="up-heading-mark" aria-hidden="true"><FilePenLine size={29} /></div></header>
    <div className="up-process" aria-label="Publishing steps"><span><Save size={14} />Save privately</span><span className="up-process-divider" aria-hidden="true" /><span><Clock3 size={14} />RMT reviews</span><span className="up-process-divider" aria-hidden="true" /><span><Check size={14} />Appears on your showcase</span></div>

    {pendingNavigation && <div className="up-confirm" role="alert"><strong>{checkingSavedResult ? "We couldn’t confirm the saved result." : "You have unsaved changes."}</strong><p>{checkingSavedResult ? "This update may already be saved. Reloading will replace the local editor with your saved update history so you can check before trying again." : "Keep writing, save your draft, or discard these changes before leaving this view."}</p><div><button type="button" className="st-button st-secondary" onClick={() => setPendingNavigation(null)}>{checkingSavedResult ? "Keep this view" : "Keep writing"}</button><button type="button" className="st-button st-danger" onClick={() => navigate(pendingNavigation, true)}>{checkingSavedResult ? "Reload saved updates" : "Discard changes"}</button></div></div>}
    {updates.error && <div className="st-error" role="alert">{updates.error}<button type="button" className="st-text-button up-error-action" disabled={busy || updates.loading} onClick={() => navigate({ action: "refresh" })}>Refresh updates <RefreshCw size={13} /></button></div>}

    <div ref={editor} className="up-editor-anchor">
      <div className="up-editor-heading"><div><h3>{selected ? selected.status === "approved" ? "Published update" : selected.status === "pending" ? "Your update is in review" : selected.status === "archived" ? "Archived update" : "Continue your draft" : "Write an update"}</h3>{selected && <UpdateStatusBadge status={selected.status} />}</div><span className="up-save-state" aria-live="polite">{busy ? "Saving your changes…" : dirty ? "Unsaved changes" : selected ? `Saved ${formattedDate(selected.updatedAt)}` : "Only you can see a draft"}</span></div>
      {selected?.reviewNote && <div className="up-feedback"><span>FROM THE RMT REVIEW TEAM</span><p>{selected.reviewNote}</p></div>}
      {selected && !selected.canManage && <p className="st-error" role="alert">Your management access for this update has changed. This copy is available to read; refresh your projects to check current access.</p>}

      {editable ? <div className="up-editor-layout"><form className="st-panel up-editor-form" onSubmit={submitForm}>
        <fieldset disabled={disabled} className="up-fieldset"><legend className="up-fieldset-title">What’s happening?</legend>
          <div className="up-kind-options" role="group" aria-label="Update type">{(["announcement", "progress", "release", "event"] as const).map(kind => <button type="button" key={kind} aria-pressed={form.kind === kind} className={form.kind === kind ? "active" : ""} onClick={() => change("kind", kind)}>{updateKindLabels[kind]}</button>)}</div>
          <label className="st-field">Title<input value={form.title} maxLength={100} onChange={event => change("title", event.target.value)} placeholder="What should your community know?" /><span className="st-field-hint"><span>A clear headline. 5–100 characters to publish.</span><span>{form.title.length}/100</span></span></label>
          <label className="st-field">Your update<textarea value={form.body} maxLength={2400} rows={9} onChange={event => change("body", event.target.value)} placeholder="Tell people what changed, why it matters, and what they can try next." /><span className="st-field-hint"><span>Plain text, with room for the details.</span><span>{form.body.length}/2400</span></span></label>
          <details className="up-link-fields" open={Boolean(form.linkUrl || form.linkLabel) || undefined}><summary>Add a destination <span>Optional</span></summary><p>Give readers one next step, such as playing a release or reading more.</p><div className="st-fields-two"><label className="st-field">Button label<input value={form.linkLabel} maxLength={50} onChange={event => change("linkLabel", event.target.value)} placeholder="Explore the update" /></label><label className="st-field">HTTPS link<input value={form.linkUrl} maxLength={2048} onChange={event => change("linkUrl", event.target.value)} placeholder="https://yourproject.com" type="url" /></label></div></details>
        </fieldset>
        {formError && <p className="st-error" role="alert">{formError}</p>}
        {needsRefresh && <button type="button" className="st-button st-secondary up-refresh-needed" onClick={() => navigate({ action: "refresh" })}><RefreshCw size={14} />Refresh saved updates</button>}
        {selected && selected.canManage && archivePrompt && <div className="up-confirm" role="alert"><strong>Archive this draft?</strong><p>Your saved copy stays in the update history. It will no longer count toward your open drafts.</p><div><button type="button" className="st-button st-secondary" disabled={disabled} onClick={() => setArchivePrompt(false)}>Keep draft</button><button type="button" className="st-button st-danger" disabled={disabled || dirty} onClick={() => void changeStatus("archive")}><Archive size={14} />Archive draft</button></div></div>}
        <div className="up-editor-actions"><button type="button" className="st-button st-secondary" disabled={disabled || (!dirty && Boolean(selected))} onClick={() => void save(false)}>{operation === "save" ? <LoaderCircle size={15} className="st-spin" /> : <Save size={15} />}Save draft</button><button type="submit" className="st-button st-primary" disabled={disabled}>{operation === "submit" ? <LoaderCircle size={15} className="st-spin" /> : <Send size={15} />}Send for review</button></div>
        {selected && selected.canManage && !archivePrompt && <button type="button" className="st-text-button up-archive-draft" disabled={disabled || dirty} onClick={() => setArchivePrompt(true)}><Archive size={13} />Archive draft{dirty ? " · save changes first" : ""}</button>}
        <p className="up-editor-footnote">Drafts are saved to your account. Sending an update for review saves your latest changes first. It appears publicly only after approval.</p>
      </form><aside className="up-preview-aside" aria-label="Preview of your update"><span className="up-preview-label">A LOOK AT YOUR SHOWCASE</span><ProjectUpdatePreview content={form} projectName={project.name} initials={project.initials} /><p className="up-preview-note">A focused update, attached to your project. Your community sees the story and a clear next step.</p></aside></div>
      : <div className="st-panel up-saved-detail"><ProjectUpdatePreview content={contentOf(selected!)} projectName={project.name} initials={project.initials} caption={selected!.status === "approved" ? `Published ${formattedDate(selected!.publishedAt ?? selected!.updatedAt)}` : selected!.status === "pending" ? "Private · awaiting RMT review" : "Private · kept in your update history"} />
        {selected!.status === "pending" && <div className="up-state-message"><Clock3 size={17} /><p>RMT will check this update before it appears on your project. Need to change something? Return it to drafts.</p></div>}
        {selected!.status === "archived" && <div className="up-state-message"><Archive size={17} /><p>This update is kept in your history and is no longer visible on your project page.</p></div>}
        {formError && <p className="st-error" role="alert">{formError}</p>}
        {needsRefresh && <button type="button" className="st-button st-secondary up-refresh-needed" onClick={() => navigate({ action: "refresh" })}><RefreshCw size={14} />Refresh saved updates</button>}
        {archivePrompt && <div className="up-confirm" role="alert"><strong>Archive this published update?</strong><p>It will leave your public showcase. Your saved copy stays in this history, and you can use it to create a new draft.</p><div><button type="button" className="st-button st-secondary" disabled={disabled} onClick={() => setArchivePrompt(false)}>Keep published</button><button type="button" className="st-button st-danger" disabled={disabled} onClick={() => void changeStatus("archive")}><Archive size={14} />Archive update</button></div></div>}
        {selected!.canManage && <div className="up-saved-actions">{selected!.status === "pending" && <button type="button" className="st-button st-secondary" disabled={disabled} onClick={() => void changeStatus("withdraw")}><Undo2 size={15} />Return to drafts</button>}{selected!.status === "approved" && !archivePrompt && <button type="button" className="st-button st-secondary" disabled={disabled} onClick={() => setArchivePrompt(true)}><Archive size={15} />Archive update</button>}{["approved", "archived"].includes(selected!.status) && <button type="button" className="st-button st-secondary" disabled={disabled} onClick={() => { setSelectedId(null); setForm(contentOf(selected!)); setArchivePrompt(false); setFormError(""); }}><FilePenLine size={15} />Use as a new draft</button>}</div>}
      </div>}
    </div>

    <section className="up-history" aria-labelledby="up-history-title"><div className="up-history-heading"><div><span className="st-kicker">THE STORY SO FAR</span><h3 id="up-history-title">Your updates</h3></div><div><button type="button" className="st-text-button" disabled={busy || updates.loading} onClick={() => navigate({ action: "refresh" })}><RefreshCw size={14} />Refresh</button><button type="button" className="st-button st-secondary" disabled={disabled} onClick={() => navigate({ action: "new" })}><Plus size={15} />New update</button></div></div>
      <div className="st-review-filters" aria-label="Filter project updates">{(["all", "draft", "pending", "approved", "rejected", "archived"] as const).map(value => <button type="button" key={value} aria-pressed={filter === value} className={filter === value ? "active" : ""} onClick={() => setFilter(value)}>{({all:"All updates",draft:"Drafts",pending:"In review",approved:"Published",rejected:"Changes needed",archived:"Archived"})[value]}</button>)}</div>
      {updates.loading && !updates.updates.length ? <div className="st-panel st-review-empty"><LoaderCircle className="st-spin" size={25} /><p>Loading saved updates…</p></div> : updates.ready && filtered.length === 0 ? <div className="st-panel up-history-empty"><Layers3 size={24} /><div><h4>{updates.hasMore ? "No matching updates loaded yet." : filter === "all" ? "Every project has a first update." : "No updates with this status yet."}</h4><p>{updates.hasMore ? "Load older updates to keep looking through your history." : filter === "all" ? "Start with what you’re building. Saved drafts and review decisions will stay here." : "Your matching updates will appear here."}</p></div></div> : <div className="up-history-grid">{filtered.map(row => <button type="button" key={row.id} className={`st-panel up-history-card${selectedId === row.id ? " selected" : ""}`} disabled={busy} onClick={() => navigate({ action: "select", id: row.id })}><div><span className="st-kicker">{updateKindLabels[row.kind]}</span><UpdateStatusBadge status={row.status} /></div><h4>{row.title || "Untitled draft"}</h4><p>{row.body || "Your draft is waiting for a few words."}</p><footer><span>{formattedDate(row.updatedAt)}</span><span>{row.status === "draft" || row.status === "rejected" ? "Continue writing" : "View update"}<ArrowUpRight size={13} /></span></footer></button>)}</div>}
      {updates.hasMore && <div className="up-load-more"><button type="button" className="st-button st-secondary" disabled={updates.loading || busy} onClick={() => void updates.loadMore()}>{updates.loading ? <LoaderCircle size={15} className="st-spin" /> : <Plus size={15} />}Load older updates</button></div>}
    </section>
  </section>;
}
