"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { signInHref, studioSectionFromSearch } from "@/lib/account-navigation";
import { ArrowRight, Check, CheckCircle2, Clock3, Copy, ExternalLink, LoaderCircle, Plus, ShieldCheck, FolderKanban, KeyRound, Sprout } from "lucide-react";
import "./studio.css";

import ManageProjects from "./ManageProjects";
import { MyClaims } from "./ClaimProject";
import { formattedDate, readApiResponse, statusLabel, stageLabel, type StudioProps, type Submission, type ProjectStage } from "./studio-shared";
export { formattedDate, readApiResponse, statusLabel } from "./studio-shared";
export type { StudioProps, StudioSession, Submission } from "./studio-shared";

type SubmissionForm = {
  name: string;
  summary: string;
  category: Submission["category"];
  stage: ProjectStage;
  website: string;
  launchUrl: string;
  xProfile: string;
  contactEmail: string;
  ownershipEvidence: string;
  companyFax: string;
};

const emptyForm: SubmissionForm = { name: "", summary: "", category: "Games", stage: "building", website: "", launchUrl: "", xProfile: "", contactEmail: "", ownershipEvidence: "", companyFax: "" };

export default function Studio({ session, onToast }: StudioProps) {
  const [section, setSection] = useState<"add" | "projects" | "claims">("add");
  useEffect(() => { setSection(studioSectionFromSearch(window.location.search)); }, []);
  const [form, setForm] = useState<SubmissionForm>(emptyForm);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [listError, setListError] = useState("");
  const [received, setReceived] = useState<Submission | null>(null);
  const [editing, setEditing] = useState<Submission | null>(null);

  const loadSubmissions = useCallback(async () => {
    if (!session.authenticated) return;
    setLoading(true);
    setListError("");
    try {
      const data = await readApiResponse(await fetch("/api/submissions", { cache: "no-store" }));
      setSubmissions(Array.isArray(data.submissions) ? data.submissions as Submission[] : []);
    } catch (cause) { setListError(cause instanceof Error ? cause.message : "Your applications could not be loaded."); }
    finally { setLoading(false); }
  }, [session.authenticated]);

  useEffect(() => { void loadSubmissions(); }, [loadSubmissions]);

  const change = (key: keyof SubmissionForm, value: string) => setForm(previous => ({ ...previous, [key]: value }));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setError("");
    if (!form.website.trim() && !form.xProfile.trim()) {
      setError("Add your official website or your project’s X profile so we can find you.");
      return;
    }
    setBusy(true);
    try {
      const data = await readApiResponse(await fetch(editing ? `/api/submissions/${encodeURIComponent(editing.id)}` : "/api/submissions", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editing ? { ...form, expectedRevision: editing.revision } : form),
      }));
      const submission = data.submission as Submission | undefined;
      if (!submission?.id) throw new Error("We couldn’t confirm your application. Please check your applications before trying again.");
      setReceived(submission);
      setForm(emptyForm);
      setEditing(null);
      onToast("Application received. Your project is in review.");
      await loadSubmissions();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Your application could not be submitted."); }
    finally { setBusy(false); }
  }

  function startEdit(submission: Submission) {
    setReceived(null);
    setError("");
    setEditing(submission);
    setForm({ name: submission.name, summary: submission.summary, category: submission.category, stage: submission.stage ?? "building", website: submission.website, launchUrl: submission.launchUrl, xProfile: submission.xProfile, contactEmail: submission.contactEmail ?? "", ownershipEvidence: submission.ownershipEvidence, companyFax: "" });
    document.getElementById("st-application")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function copyCode(code: string) {
    try { await navigator.clipboard.writeText(code); onToast("Verification code copied."); }
    catch { onToast("Copy isn’t available here. You can select the code and copy it."); }
  }

  return (
    <section className="st-page" aria-labelledby="studio-title">
      <header className="st-heading">
        <p className="st-eyebrow"><span /> DEVELOPER STUDIO</p>
        <h1 id="studio-title">Bring your project<br />to <span>RMT.</span></h1>
        <p>A new place for people to find what you’re building.<br className="st-desktop-break" /> Start with your idea and an official link. Add your experiences as you build.</p>
        <div className="st-promises"><span><Check size={14} /> Free to join</span><span><Check size={14} /> No NFT required</span><span><Check size={14} /> Reviewed before publishing</span></div>
      </header>

      <nav className="st-workspace-tabs" aria-label="Developer Studio sections">
        <button type="button" className={section === "add" ? "active" : ""} aria-pressed={section === "add"} onClick={() => setSection("add")}><Plus size={15} /> Add a project</button>
        <button type="button" className={section === "projects" ? "active" : ""} aria-pressed={section === "projects"} onClick={() => setSection("projects")}><FolderKanban size={15} /> My projects</button>
        <button type="button" className={section === "claims" ? "active" : ""} aria-pressed={section === "claims"} onClick={() => setSection("claims")}><KeyRound size={15} /> Ownership claims</button>
      </nav>
      {section === "projects" && <ManageProjects session={session} onToast={onToast} onAddProject={() => setSection("add")} />}
      {section === "claims" && <MyClaims session={session} onToast={onToast} />}
      {section === "add" && <div className="st-layout">
        <div className="st-main">
          {!session.authenticated ? (
            <section className="st-panel st-signin">
              <div className="st-symbol"><Plus size={25} /></div>
              <h2>Give your project a home.</h2>
              <p>Sign in to submit your project and follow its review. No wallet is required to browse or apply.</p>
              <a className="st-button st-primary" href={signInHref('/#studio')} target="_top">Sign in to apply <ArrowRight size={17} /></a>
            </section>
          ) : received ? (
            <section className="st-panel st-received" aria-live="polite">
              <div className="st-symbol"><CheckCircle2 size={27} /></div>
              <span className="st-status st-status-pending"><Clock3 size={12} /> In review</span>
              <h2>You’re in the queue.</h2>
              <p><strong>{received.name}</strong> has been submitted. We’ll check the project, its official links, and who’s applying before it appears on RMT.</p>
              <div className="st-code-panel"><span>Your project verification code</span><div><code>{received.verificationCode}</code><button type="button" className="st-icon-button" aria-label="Copy verification code" onClick={() => void copyCode(received.verificationCode)}><Copy size={16} /></button></div><p>Keep this handy. We may ask you to add it to your official website or post it from your project’s X account.</p></div>
              <button type="button" className="st-button st-secondary" onClick={() => setReceived(null)}>Submit another project <Plus size={16} /></button>
            </section>
          ) : (
            <form className="st-panel st-form" id="st-application" onSubmit={submit}>
              <div className="st-section-heading"><div><span className="st-step">01</span><h2>{editing ? "Update your application" : "Tell us what you’re building"}</h2></div><span>Required unless marked optional</span></div>
              {editing && <div className="st-information">Your edits will go back into review. {editing.reviewNote || editing.reviewerNote || "Check the feedback on your application below."}<button type="button" onClick={() => { setEditing(null); setForm(emptyForm); }}>Cancel editing</button></div>}
              <div className="st-fields-two">
                <label className="st-field">Project name<input name="name" autoComplete="organization" placeholder="Your project’s name" minLength={3} maxLength={70} required value={form.name} onChange={event => change("name", event.target.value)} /></label>
                <label className="st-field">Category<select name="category" value={form.category} onChange={event => change("category", event.target.value)}><option>Games</option><option>Music</option><option>Tools</option><option>Community</option></select></label>
              </div>
              <label className="st-field">Short description<textarea name="summary" placeholder="What are you creating, and who is it for? Early ideas are welcome." minLength={30} maxLength={280} rows={3} required value={form.summary} onChange={event => change("summary", event.target.value)} /><span className="st-field-hint"><span>30–280 characters. Keep it clear and useful.</span><span>{form.summary.length}/280</span></span></label>
              <label className="st-field">Where are you in the journey?<select name="stage" value={form.stage} onChange={event => change("stage", event.target.value)}><option value="starting">Starting out — an idea taking shape</option><option value="building">Building — work in progress</option><option value="live">Live — ready to explore</option></select><span className="st-hint">You can join before launching an NFT, token, game, or app.</span></label>
              <div className="st-information">Add your official website, your project’s X profile, or both. One public home is enough to get started.</div>
              <label className="st-field">Official website <span className="st-optional">Optional if you add an X profile</span><input name="website" type="url" placeholder="https://yourproject.com" maxLength={2048} value={form.website} onChange={event => change("website", event.target.value)} /></label>
              <label className="st-field">Game or app link <span className="st-optional">Optional · add when it’s ready</span><input name="launchUrl" type="url" placeholder="https://yourproject.com/play" maxLength={2048} value={form.launchUrl} onChange={event => change("launchUrl", event.target.value)} /><span className="st-hint">Leave this blank while you’re building. We’ll use your official website or X profile as the starting point.</span></label>
              <div className="st-section-heading st-section-divider"><div><span className="st-step">02</span><h2>Show us it’s your project</h2></div></div>
              <label className="st-field">Official X profile <span className="st-optional">Optional if you add a website</span><input name="xProfile" type="url" placeholder="https://x.com/yourproject" maxLength={2048} value={form.xProfile} onChange={event => change("xProfile", event.target.value)} /></label>
              <label className="st-field">Contact email <span className="st-optional">Optional · kept private</span><input name="contactEmail" type="email" autoComplete="email" placeholder="you@yourproject.com" maxLength={254} value={form.contactEmail} onChange={event => change("contactEmail", event.target.value)} /></label>
              <label className="st-field">How can we confirm you represent this project?<textarea name="ownershipEvidence" placeholder="Share a team page, a post from the project’s account, or tell us how you can show you’re the person building it." minLength={20} maxLength={1000} rows={4} required value={form.ownershipEvidence} onChange={event => change("ownershipEvidence", event.target.value)} /><span className="st-hint">Only you and the RMT review team can see this. Never include passwords or wallet recovery phrases.</span></label>
              <div className="st-honeypot" aria-hidden="true"><label>Company fax<input name="companyFax" tabIndex={-1} autoComplete="off" value={form.companyFax} onChange={event => change("companyFax", event.target.value)} /></label></div>
              {error && <p className="st-error" role="alert">{error}</p>}
              <div className="st-submit-row"><p><ShieldCheck size={17} /><span>Nothing goes live until it’s approved.<br /><strong>Joining RMT is free.</strong></span></p><button type="submit" className="st-button st-primary" disabled={busy}>{busy ? <><LoaderCircle size={17} className="st-spin" /> Sending…</> : <>{editing ? "Resubmit for review" : "Submit for review"} <ArrowRight size={17} /></>}</button></div>
            </form>
          )}

          {session.authenticated && <section className="st-panel st-applications" aria-labelledby="my-applications-title"><div className="st-section-heading"><div><h2 id="my-applications-title">Your applications</h2>{submissions.length > 0 && <span className="st-count">{submissions.length}</span>}</div><button type="button" className="st-text-button" onClick={() => void loadSubmissions()} disabled={loading}>{loading ? "Refreshing…" : "Refresh"}</button></div>{listError ? <p className="st-error" role="alert">{listError}</p> : loading && submissions.length === 0 ? <p className="st-muted">Loading your applications…</p> : submissions.length === 0 ? <div className="st-empty-inline"><Clock3 size={19} /><p>Your submissions and review updates will appear here.</p></div> : <div className="st-application-list">{submissions.map(submission => <article key={submission.id} className="st-application"><div className="st-application-top"><div><h3>{submission.name}</h3><p>{stageLabel(submission.stage)} · Submitted {formattedDate(submission.createdAt)}</p></div><span className={`st-status st-status-${submission.status}`}>{statusLabel(submission.status)}</span></div>{(submission.reviewNote || submission.reviewerNote) && <p className="st-feedback">{submission.reviewNote || submission.reviewerNote}</p>}{["needs_changes", "changes_requested"].includes(submission.status) && <button type="button" className="st-text-button" onClick={() => startEdit(submission)}>Update application <ArrowRight size={14} /></button>}<details className="st-application-details"><summary>Application details</summary><dl><div><dt>Reference</dt><dd>{submission.id}</dd></div><div><dt>Verification code</dt><dd>{submission.verificationCode}</dd></div></dl>{(submission.website || submission.xProfile) && <a href={submission.website || submission.xProfile} target="_blank" rel="noopener noreferrer">Official project link <ExternalLink size={13} /></a>}</details></article>)}</div>}</section>}
        </div>

        <aside className="st-aside">
          <section className="st-panel st-guide"><span className="st-kicker">GOOD COMPANY. GOOD EXPERIENCES.</span><h2>A small step.<br />A wider audience.</h2><ol><li><span>1</span><div><h3>Share your project</h3><p>One application. An idea, an official link, and the stage you’re at.</p></div></li><li><span>2</span><div><h3>We take a look</h3><p>A real review of your project and ownership. No automatic publishing.</p></div></li><li><span>3</span><div><h3>Your project, discovered</h3><p>People can find you, save you to their library, and launch your experience.</p></div></li></ol><div className="st-guide-note"><ShieldCheck size={17} /><p>Every project follows the same review, from a first idea to an established community.</p></div></section>
          <section className="st-panel st-starting-card"><Sprout size={23} /><span className="st-kicker">ROOM TO START SMALL</span><h2>Still building?<br />You belong here.</h2><p>You don’t need a minted collection or a finished app. Share what you’re working on and give people a place to follow along.</p><div><Check size={14} /> Free to join and use</div></section>
        </aside>
      </div>}
    </section>
  );
}
