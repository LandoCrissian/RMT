"use client";
import BuilderAnalytics from "./BuilderAnalytics";
import ProjectLinkInput from "./ProjectLinkInput";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { BarChart3, ArrowLeft, ArrowRight, ArrowUpRight, CheckCircle2, Clock3, FilePenLine, FolderKanban, LoaderCircle, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import type { Project } from "@/lib/catalog";
import { signInHref } from "@/lib/account-navigation";
import { formattedDate, readApiResponse, stageLabel, statusLabel, type ProjectStage, type StudioProps } from "./studio-shared";
import "./studio.css";
import ProjectArtworkFields, { type ArtworkSelection } from "./ProjectArtworkFields";
import ProjectUpdatesManager from "./ProjectUpdatesManager";
import "./project-updates-studio.css";

export type ProjectEdit = {
  id: string;
  projectId: string;
  projectName: string;
  summary: string;
  category: Project["category"];
  stage: ProjectStage;
  website: string;
  launchUrl: string;
  xProfile: string;
  links: Project["links"];
  logoAssetId?: string | null;
  bannerAssetId?: string | null;
  baseRevision: number;
  status: "pending" | "approved" | "rejected";
  revision: number;
  reviewNote: string;
  createdAt: number;
  updatedAt: number;
  userId?: string;
};

type OwnedProject = { project: Project; revision: number; editableLinks: Project["links"]; artworkOverride?:boolean;logoAssetId?:string|null;bannerAssetId?:string|null };
type EditForm = ArtworkSelection & { summary: string; category: Project["category"]; stage: ProjectStage; website: string; launchUrl: string; xProfile: string; links: Project["links"] };
type ManageProjectsProps = StudioProps & { onAddProject?: () => void };

function editableProject({ project, editableLinks,logoAssetId,bannerAssetId }: OwnedProject): EditForm {
  return { summary: project.description, category: project.category, stage: project.stage ?? "building", website: project.website ?? "", launchUrl: project.launchUrl ?? "", xProfile: project.officialXProfile ?? "", links: editableLinks.map(link => ({ ...link })), logoAssetId:logoAssetId===undefined?project.artwork?.logo?.id??null:logoAssetId, bannerAssetId:bannerAssetId===undefined?project.artwork?.banner?.id??null:bannerAssetId };
}

export default function ManageProjects(props: ManageProjectsProps) {
  return <ManagedProjectsWorkspace key={props.session.userId ?? "guest"} {...props} />;
}

function ManagedProjectsWorkspace({ session, onToast, onAddProject }: ManageProjectsProps) {
  const [owned, setOwned] = useState<OwnedProject[]>([]);
  const [edits, setEdits] = useState<ProjectEdit[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [artworkBusy, setArtworkBusy] = useState(false);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [selected, setSelected] = useState<OwnedProject | null>(null);
  const [form, setForm] = useState<EditForm | null>(null);
  const [analyticsProject, setAnalyticsProject] = useState<Project | null>(null);
  const [updatesProject, setUpdatesProject] = useState<Project | null>(null);
  const request = useRef<AbortController | null>(null);
  const sequence = useRef(0);
  const active = useRef(true);
  const hasOfficialCollection = Boolean(selected?.project.collections?.length);

  const load = useCallback(async () => {
    if (!session.authenticated || !session.userId) return;
    const requestSequence = ++sequence.current;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true); setError("");
    try {
      const data = await readApiResponse(await fetch("/api/projects/owned", { cache: "no-store", signal: controller.signal, headers: { "X-RMT-Account": session.userId } }));
      if (!Array.isArray(data.projects) || !Array.isArray(data.edits)) throw new Error("Your projects response was incomplete. Refresh to try again.");
      if (!active.current || controller.signal.aborted || sequence.current !== requestSequence) return;
      setOwned(data.projects as OwnedProject[]);
      setEdits(data.edits as ProjectEdit[]);
    } catch (cause) {
      if (active.current && !controller.signal.aborted && sequence.current === requestSequence) setError(cause instanceof Error ? cause.message : "Your projects could not be loaded.");
    } finally {
      if (active.current && sequence.current === requestSequence) setLoading(false);
    }
  }, [session.authenticated, session.userId]);
  useEffect(() => {
    active.current = true;
    void load();
    return () => { active.current = false; request.current?.abort(); sequence.current++; };
  }, [load]);

  function edit(item: OwnedProject) { setSelected(item); setForm(editableProject(item)); setFormError(""); }
  function change<K extends keyof EditForm>(key: K, value: EditForm[K]) { setForm(previous => previous ? { ...previous, [key]: value } : previous); }
  function changeLink(index: number, key: keyof Project["links"][number], value: string) {
    setForm(previous => previous ? { ...previous, links: previous.links.map((link, position) => position === index ? { ...link, [key]: value } : link) } : previous);
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || !form || busy || artworkBusy) return;
    setFormError("");
    if (form.summary.trim().length < 30 || form.summary.trim().length > 280) { setFormError("Keep the updated description between 30 and 280 characters."); return; }
    if (!form.website.trim() && !form.xProfile.trim() && !hasOfficialCollection) { setFormError("Keep at least one official home: a website or the project’s X profile."); return; }
    setBusy(true);
    try {
      const data = await readApiResponse(await fetch("/api/project-edits", { method: "POST", headers: { "Content-Type": "application/json", "X-RMT-Account": session.userId ?? "" }, body: JSON.stringify({ projectId: selected.project.id, baseRevision: selected.revision, ...form, links: form.links.map(link => ({ label: link.label, url: link.url, ...(link.type?.trim() ? { type: link.type.trim() } : {}) })) }) }));
      if (!active.current) return;
      if (!(data.edit as ProjectEdit | undefined)?.id) throw new Error("We couldn’t confirm your changes were received. Refresh your projects before trying again.");
      onToast("Changes submitted for review. Your current page stays online.");
      setSelected(null); setForm(null);
      await load();
    } catch (cause) { if (active.current) setFormError(cause instanceof Error ? cause.message : "Your changes could not be submitted."); }
    finally { if (active.current) setBusy(false); }
  }

  if (!session.authenticated) return <section className="st-panel st-signin"><div className="st-symbol"><FolderKanban size={25} /></div><h2>A home for your projects.</h2><p>Sign in to manage projects you’ve submitted or claimed.</p><a className="st-button st-primary" href={signInHref("/?studio=projects#studio")} target="_top">Sign in <ArrowRight size={16} /></a></section>;

  if (analyticsProject && session.userId) return <BuilderAnalytics project={analyticsProject} account={session.userId} onBack={() => setAnalyticsProject(null)} />;
  if (updatesProject) return <ProjectUpdatesManager session={session} onToast={onToast} project={updatesProject} onBack={() => setUpdatesProject(null)} />;

  if (selected && form) return <section className="st-owner-editor"><button type="button" className="st-text-button st-back-link" onClick={() => { setSelected(null); setForm(null); }}><ArrowLeft size={14} /> My projects</button><div className="st-section-heading"><div><h2>Update {selected.project.name}</h2></div><span className="st-status st-status-approved">Confirmed manager</span></div><p className="st-panel-intro">Update your project’s artwork, details, and official links. Your current page stays online while the changes are reviewed.</p><form className="st-panel st-form" onSubmit={submit}>
    <div className="st-fields-two"><label className="st-field">Category<select value={form.category} onChange={event => change("category", event.target.value as Project["category"])}><option>Games</option><option>Music</option><option>Tools</option><option>Community</option></select></label><label className="st-field">Project stage<select value={form.stage} onChange={event => change("stage", event.target.value as ProjectStage)}><option value="starting">Starting out</option><option value="building">In development</option><option value="beta">Beta</option><option value="live">Live</option></select></label></div>
    <label className="st-field">Short description<textarea value={form.summary} onChange={event => change("summary", event.target.value)} minLength={30} maxLength={280} required rows={3} /><span className="st-field-hint"><span>30–280 characters</span><span>{form.summary.length}/280</span></span></label>
    {selected.artworkOverride ? <div className="st-information"><span>The RMT administrator is managing this project’s displayed artwork. Your saved builder images remain intact. You can update your details and links below; contact RMT to change the displayed images.</span></div> : <ProjectArtworkFields key={selected.project.id} projectId={selected.project.id} currentArtwork={selected.project.artwork} value={{logoAssetId: form.logoAssetId, bannerAssetId: form.bannerAssetId}} onChange={artwork => setForm(previous => previous ? {...previous,...artwork} : previous)} onBusyChange={setArtworkBusy} disabled={busy} />}
    <div className="st-fields-two"><label className="st-field">Official website<ProjectLinkInput label="Official website" missingHome={!form.website.trim() && !form.xProfile.trim() && !hasOfficialCollection} value={form.website} onChange={event => change("website", event.target.value)} maxLength={2048} placeholder="https://yourproject.com" /></label><label className="st-field">Official X profile<ProjectLinkInput label="X profile" profile value={form.xProfile} onChange={event => change("xProfile", event.target.value)} maxLength={2048} placeholder="https://x.com/yourproject" /></label></div><p className="st-hint st-lift-hint">{hasOfficialCollection ? "Your existing collection remains your official home. A website or X profile is optional." : "Keep at least one official home: your website or X profile."}</p>
    <label className="st-field">Main game or app link <span className="st-optional">Optional</span><ProjectLinkInput label="Launch link" value={form.launchUrl} onChange={event => change("launchUrl", event.target.value)} maxLength={2048} placeholder="https://yourproject.com/play" /><span className="st-hint">This is where the main launch button takes people. {hasOfficialCollection ? "Leave blank to use your website, X profile, or existing collection." : "Leave blank to use your website or X profile."}</span></label>
    <div className="st-section-heading st-section-divider"><div><h2>Apps and official links</h2><span className="st-count">{form.links.length}/12</span></div><button type="button" className="st-text-button" disabled={form.links.length >= 12} onClick={() => change("links", [...form.links, { label: "", url: "", type: "" }])}><Plus size={14} /> Add a link</button></div>
    <p className="st-panel-intro">Give people a direct route to your games, tools, collections, and community.</p>
    <div className="st-edit-links">{form.links.map((link, index) => <div className="st-edit-link" key={index}><div className="st-edit-link-top"><span>LINK {index + 1}</span><button type="button" className="st-icon-button" aria-label={`Remove link ${index + 1}${link.label ? `: ${link.label}` : ""}`} onClick={() => change("links", form.links.filter((_, position) => position !== index))}><Trash2 size={14} /></button></div><div className="st-fields-two"><label className="st-field">Name<input value={link.label} maxLength={50} required placeholder="Your game’s name" onChange={event => changeLink(index, "label", event.target.value)} /></label><label className="st-field">Type <span className="st-optional">Optional</span><input value={link.type ?? ""} maxLength={40} placeholder="Game, tool, music, community…" onChange={event => changeLink(index, "type", event.target.value)} /></label></div><label className="st-field">Official destination<ProjectLinkInput label="Destination link" value={link.url} maxLength={2048} required placeholder="https://" onChange={event => changeLink(index, "url", event.target.value)} /></label></div>)}</div>
    {!form.links.length && <div className="st-empty-inline"><Plus size={18} /><p>Add links as your experiences become ready.</p></div>}
    {formError && <p className="st-error" role="alert">{formError}</p>}
    <div className="st-submit-row"><p><Clock3 size={17} /><span>Reviewed before going live.<br />One set of changes at a time.</span></p><button type="submit" className="st-button st-primary" disabled={busy || artworkBusy}>{busy || artworkBusy ? <LoaderCircle size={16} className="st-spin" /> : <ArrowRight size={16} />} {artworkBusy ? "Finishing upload…" : "Submit changes"}</button></div>
  </form></section>;

  return <section className="st-owned-workspace"><div className="st-section-heading"><div><h2>My projects</h2><span className="st-count">{owned.length}</span></div><button type="button" className="st-text-button" disabled={loading} onClick={() => void load()}><RefreshCw size={14} className={loading ? "st-spin" : ""} /> Refresh</button></div>{error ? <p className="st-error" role="alert">{error}</p> : loading && !owned.length ? <div className="st-panel st-review-empty"><LoaderCircle size={25} className="st-spin" /><p>Loading your projects…</p></div> : !owned.length ? <div className="st-panel st-review-empty"><div className="st-symbol"><FolderKanban size={26} /></div><h2>Your next chapter starts here.</h2><p>Approved applications and confirmed project claims will appear here. You can add a new project or claim an existing listing from its project page.</p><div className="st-empty-actions">{onAddProject && <button type="button" className="st-button st-primary" onClick={onAddProject}><Plus size={15} /> Add a project</button>}<a href="#discover" className="st-button st-secondary">Find my listing <ArrowRight size={15} /></a></div></div> : <div className="st-owned-grid">{owned.map(item => { const pending = edits.find(edit => edit.projectId === item.project.id && edit.status === "pending"); const latest = edits.filter(edit => edit.projectId === item.project.id).sort((a, b) => b.createdAt - a.createdAt)[0]; return <article className="st-panel st-owned-card" key={item.project.id}><div className="st-owned-card-heading"><span className="st-project-initial">{item.project.initials}</span><div><span className="st-kicker">{stageLabel(item.project.stage)} · {item.project.category}</span><h3>{item.project.name}</h3></div><CheckCircle2 size={17} /></div><p>{item.project.description}</p><div className="up-owned-actions"><button type="button" className="st-button st-primary" onClick={() => setUpdatesProject(item.project)}><FilePenLine size={14} />Post an update</button><button type="button" className="st-button st-secondary" onClick={() => setAnalyticsProject(item.project)}><BarChart3 size={14}/> Analytics</button></div><div className="st-owned-actions"><a className="st-text-button" href={`#project/${encodeURIComponent(item.project.id)}`}>View project page <ArrowUpRight size={14} /></a><button type="button" className="st-button st-secondary" disabled={!!pending} onClick={() => edit(item)}><Pencil size={14} /> {pending ? "Changes in review" : "Edit project"}</button></div>{pending ? <div className="st-information"><Clock3 size={14} /><span>Your changes from {formattedDate(pending.createdAt)} are in review. The current public page is still visible.</span></div> : latest && <div className="st-edit-outcome"><span className={`st-status st-status-${latest.status}`}>{latest.status === "approved" ? "Changes published" : statusLabel(latest.status)}</span>{latest.reviewNote && <p>{latest.reviewNote}</p>}</div>}</article>; })}</div>}
    {edits.length > 0 && <section className="st-panel st-form st-edit-history"><div className="st-section-heading"><div><h2>Recent changes</h2></div></div>{edits.slice(0, 12).map(edit => <article className="st-history-row" key={edit.id}><div><h3>{edit.projectName}</h3><p>Submitted {formattedDate(edit.createdAt)}</p>{edit.reviewNote && <p className="st-feedback">{edit.reviewNote}</p>}</div><span className={`st-status st-status-${edit.status}`}>{edit.status === "approved" ? "Changes published" : statusLabel(edit.status)}</span></article>)}</section>}
  </section>;
}
