"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ArrowRight, Check, CheckCircle2, Clock3, Copy, ExternalLink, LoaderCircle, Plus, ShieldCheck, Sparkles } from "lucide-react";
import "./studio.css";

export type StudioSession = {
  authenticated: boolean;
  userId: string | null;
  displayName: string | null;
  isAdmin: boolean;
};

export type StudioProps = { session: StudioSession; onToast: (text: string) => void };

export type Submission = {
  id: string;
  name: string;
  summary: string;
  category: "Games" | "Music" | "Tools" | "Community";
  website: string;
  launchUrl: string;
  xProfile: string;
  contactEmail?: string | null;
  ownershipEvidence: string;
  verificationCode: string;
  status: string;
  revision: number;
  createdAt: string | number;
  updatedAt?: string | number;
  reviewNote?: string | null;
  reviewerNote?: string | null;
};

type SubmissionForm = {
  name: string;
  summary: string;
  category: Submission["category"];
  website: string;
  launchUrl: string;
  xProfile: string;
  contactEmail: string;
  ownershipEvidence: string;
  companyFax: string;
};

const emptyForm: SubmissionForm = { name: "", summary: "", category: "Games", website: "", launchUrl: "", xProfile: "", contactEmail: "", ownershipEvidence: "", companyFax: "" };

export function statusLabel(status: string) {
  return ({ pending: "In review", needs_changes: "Changes requested", changes_requested: "Changes requested", approved: "Published", rejected: "Not approved", suspended: "Suspended" } as Record<string, string>)[status] ?? "In review";
}

export function formattedDate(value: string | number) {
  const date = new Date(typeof value === "number" && value < 1e12 ? value * 1000 : value);
  return Number.isNaN(date.getTime()) ? "Recently" : date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export async function readApiResponse(response: Response) {
  let data: Record<string, unknown>;
  try { data = await response.json(); } catch { throw new Error("We couldn’t reach RMT. Please try again in a moment."); }
  if (!response.ok) {
    const details = data.error;
    const message = typeof details === "string" ? details : details && typeof details === "object" && "message" in details ? String(details.message) : typeof data.message === "string" ? data.message : "Something went wrong. Please try again.";
    throw new Error(message);
  }
  return data;
}

export default function Studio({ session, onToast }: StudioProps) {
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
    setForm({ name: submission.name, summary: submission.summary, category: submission.category, website: submission.website, launchUrl: submission.launchUrl, xProfile: submission.xProfile, contactEmail: submission.contactEmail ?? "", ownershipEvidence: submission.ownershipEvidence, companyFax: "" });
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
        <p>A new place for people to find what you’re building.<br className="st-desktop-break" /> Add your project, connect your experiences, and let people jump in.</p>
        <div className="st-promises"><span><Check size={14} /> Free to list</span><span><Check size={14} /> Open to every community</span><span><Check size={14} /> Reviewed before publishing</span></div>
      </header>

      <div className="st-layout">
        <div className="st-main">
          {!session.authenticated ? (
            <section className="st-panel st-signin">
              <div className="st-symbol"><Plus size={25} /></div>
              <h2>Your next audience is here.</h2>
              <p>Sign in to submit your project and follow its review. Browsing RMT stays open; a wallet is not required.</p>
              <a className="st-button st-primary" href="/signin-with-chatgpt?return_to=/%23studio" target="_top">Sign in to apply <ArrowRight size={17} /></a>
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
              <div className="st-section-heading"><div><span className="st-step">01</span><h2>{editing ? "Update your application" : "Tell us what you’ve built"}</h2></div><span>Required unless marked optional</span></div>
              {editing && <div className="st-information">Your edits will go back into review. {editing.reviewNote || editing.reviewerNote || "Check the feedback on your application below."}<button type="button" onClick={() => { setEditing(null); setForm(emptyForm); }}>Cancel editing</button></div>}
              <div className="st-fields-two">
                <label className="st-field">Project name<input name="name" autoComplete="organization" placeholder="Your project’s name" minLength={3} maxLength={70} required value={form.name} onChange={event => change("name", event.target.value)} /></label>
                <label className="st-field">Category<select name="category" value={form.category} onChange={event => change("category", event.target.value)}><option>Games</option><option>Music</option><option>Tools</option><option>Community</option></select></label>
              </div>
              <label className="st-field">Short description<textarea name="summary" placeholder="What can people discover, play, or create with your project?" minLength={30} maxLength={280} rows={3} required value={form.summary} onChange={event => change("summary", event.target.value)} /><span className="st-field-hint"><span>30–280 characters. Keep it clear and useful.</span><span>{form.summary.length}/280</span></span></label>
              <label className="st-field">Official website<input name="website" type="url" placeholder="https://yourproject.com" maxLength={500} required value={form.website} onChange={event => change("website", event.target.value)} /></label>
              <label className="st-field">Where should “Launch” take people?<input name="launchUrl" type="url" placeholder="https://yourproject.com/play" maxLength={500} required value={form.launchUrl} onChange={event => change("launchUrl", event.target.value)} /><span className="st-hint">Link directly to a working game, app, or your project’s home page.</span></label>
              <div className="st-section-heading st-section-divider"><div><span className="st-step">02</span><h2>Show us it’s your project</h2></div></div>
              <label className="st-field">Official X profile<input name="xProfile" type="url" placeholder="https://x.com/yourproject" maxLength={500} required value={form.xProfile} onChange={event => change("xProfile", event.target.value)} /></label>
              <label className="st-field">Contact email <span className="st-optional">Optional · kept private</span><input name="contactEmail" type="email" autoComplete="email" placeholder="you@yourproject.com" maxLength={254} value={form.contactEmail} onChange={event => change("contactEmail", event.target.value)} /></label>
              <label className="st-field">How can we confirm you represent this project?<textarea name="ownershipEvidence" placeholder="Share a link to an announcement from the official account, a team page naming you, or explain how you can prove ownership." minLength={20} maxLength={1000} rows={4} required value={form.ownershipEvidence} onChange={event => change("ownershipEvidence", event.target.value)} /><span className="st-hint">Only you and the RMT review team can see this. Never include passwords or wallet recovery phrases.</span></label>
              <div className="st-honeypot" aria-hidden="true"><label>Company fax<input name="companyFax" tabIndex={-1} autoComplete="off" value={form.companyFax} onChange={event => change("companyFax", event.target.value)} /></label></div>
              {error && <p className="st-error" role="alert">{error}</p>}
              <div className="st-submit-row"><p><ShieldCheck size={17} /><span>Nothing goes live until it’s approved.<br /><strong>Your standard listing is free.</strong></span></p><button type="submit" className="st-button st-primary" disabled={busy}>{busy ? <><LoaderCircle size={17} className="st-spin" /> Sending…</> : <>{editing ? "Resubmit for review" : "Submit for review"} <ArrowRight size={17} /></>}</button></div>
            </form>
          )}

          {session.authenticated && <section className="st-panel st-applications" aria-labelledby="my-applications-title"><div className="st-section-heading"><div><h2 id="my-applications-title">Your applications</h2>{submissions.length > 0 && <span className="st-count">{submissions.length}</span>}</div><button type="button" className="st-text-button" onClick={() => void loadSubmissions()} disabled={loading}>{loading ? "Refreshing…" : "Refresh"}</button></div>{listError ? <p className="st-error" role="alert">{listError}</p> : loading && submissions.length === 0 ? <p className="st-muted">Loading your applications…</p> : submissions.length === 0 ? <div className="st-empty-inline"><Clock3 size={19} /><p>Your submissions and review updates will appear here.</p></div> : <div className="st-application-list">{submissions.map(submission => <article key={submission.id} className="st-application"><div className="st-application-top"><div><h3>{submission.name}</h3><p>Submitted {formattedDate(submission.createdAt)}</p></div><span className={`st-status st-status-${submission.status}`}>{statusLabel(submission.status)}</span></div>{(submission.reviewNote || submission.reviewerNote) && <p className="st-feedback">{submission.reviewNote || submission.reviewerNote}</p>}{["needs_changes", "changes_requested"].includes(submission.status) && <button type="button" className="st-text-button" onClick={() => startEdit(submission)}>Update application <ArrowRight size={14} /></button>}<details className="st-application-details"><summary>Application details</summary><dl><div><dt>Reference</dt><dd>{submission.id}</dd></div><div><dt>Verification code</dt><dd>{submission.verificationCode}</dd></div></dl><a href={submission.website} target="_blank" rel="noopener noreferrer">Project website <ExternalLink size={13} /></a></details></article>)}</div>}</section>}
        </div>

        <aside className="st-aside">
          <section className="st-panel st-guide"><span className="st-kicker">GOOD COMPANY. GOOD EXPERIENCES.</span><h2>A small step.<br />A wider audience.</h2><ol><li><span>1</span><div><h3>Share your project</h3><p>One application. Your official links and what people can do.</p></div></li><li><span>2</span><div><h3>We take a look</h3><p>A real review of your project and ownership. No automatic publishing.</p></div></li><li><span>3</span><div><h3>Your project, discovered</h3><p>People can find you, save you to their library, and launch your experience.</p></div></li></ol><div className="st-guide-note"><ShieldCheck size={17} /><p>Every project follows the same review. Paying never skips the queue.</p></div></section>
          <section className="st-spotlight"><div className="st-spotlight-top"><Sparkles size={20} /><span>COMING LATER</span></div><h2>A little more<br />time in the spotlight.</h2><p>Optional homepage exposure for approved projects.</p><div className="st-price"><strong>$5</strong><span>/ 7 days</span></div><button type="button" className="st-button st-spotlight-disabled" disabled>Planned · payments not open</button><small>Proposed pricing. Standard listings stay free.</small></section>
        </aside>
      </div>
    </section>
  );
}
