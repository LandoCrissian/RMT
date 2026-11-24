"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, ArrowUpRight, Check, CheckCircle2, Clock3, Copy, Globe2, KeyRound, LoaderCircle, MessageCircle, RefreshCw, ShieldCheck } from "lucide-react";
import type { Project } from "@/lib/catalog";
import { claimStatusLabel, formattedDate, readApiResponse, safeHttpsLink, type ClaimMethod, type ClaimOption, type ProjectClaim, type StudioProps } from "./studio-shared";
import "./studio.css";

export type ClaimProjectProps = StudioProps & {
  project: Project;
  onClose?: () => void;
  onComplete?: () => void;
};

type ClaimOptionsResponse = { projectId: string; projectName: string; claimed: boolean; methods: ClaimOption[] };
const methodNames: Record<ClaimMethod, string> = { website: "Official website", x: "Project X account", opensea: "OpenSea collection" };
const methodDescriptions: Record<ClaimMethod, string> = {
  website: "Place your unique code on a public page you control.",
  x: "Post the code from the project’s official account.",
  opensea: "Add the code to the collection description you manage.",
};

function claimExpired(claim: ProjectClaim | null) {
  return !!claim && ["draft", "pending"].includes(claim.status) && claim.expiresAt <= Date.now();
}

export function ClaimProject({ project, session, onToast, onClose, onComplete }: ClaimProjectProps) {
  const loadSequence = useRef(0);
  const [options, setOptions] = useState<ClaimOptionsResponse | null>(null);
  const [claim, setClaim] = useState<ProjectClaim | null>(null);
  const [method, setMethod] = useState<ClaimMethod | "">("");
  const [proofUrl, setProofUrl] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");

  const load = useCallback(async () => {
    if (!session.authenticated) return;
    const requestId = ++loadSequence.current;
    setLoading(true);
    setLoadError("");
    try {
      const [optionData, claimData] = await Promise.all([
        fetch(`/api/claim-options?projectId=${encodeURIComponent(project.id)}`, { cache: "no-store" }).then(readApiResponse),
        fetch("/api/claims", { cache: "no-store" }).then(readApiResponse),
      ]);
      if (requestId !== loadSequence.current) return;
      const nextOptions = optionData as unknown as ClaimOptionsResponse;
      const existing = (Array.isArray(claimData.claims) ? claimData.claims as ProjectClaim[] : []).filter(item => item.projectId === project.id).sort((a, b) => b.createdAt - a.createdAt)[0] ?? null;
      setOptions(nextOptions);
      setClaim(existing);
      setMethod(existing?.method ?? nextOptions.methods[0]?.method ?? "");
      setProofUrl(existing?.proofUrl ?? "");
      setNote(existing?.note ?? "");
    } catch (cause) { if (requestId === loadSequence.current) setLoadError(cause instanceof Error ? cause.message : "This project’s claim options could not be loaded."); }
    finally { if (requestId === loadSequence.current) setLoading(false); }
  }, [session.authenticated, session.userId, project.id]);

  useEffect(() => { setClaim(null); setOptions(null); setError(""); void load(); return () => { loadSequence.current += 1; }; }, [load]);

  async function createClaim() {
    if (!method || busy) return;
    setBusy(true);
    setError("");
    try {
      const data = await readApiResponse(await fetch("/api/claims", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId: project.id, method }) }));
      const next = data.claim as ProjectClaim | undefined;
      if (!next?.id || !next.verificationCode) throw new Error("We couldn’t confirm your proof code. Refresh this page before trying again.");
      setClaim(next);
      setProofUrl(next.proofUrl ?? "");
      setNote(next.note ?? "");
      onToast("Your proof code is ready.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "A proof code could not be created."); }
    finally { setBusy(false); }
  }

  async function submitProof(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!claim || busy) return;
    setBusy(true);
    setError("");
    try {
      const data = await readApiResponse(await fetch(`/api/claims/${encodeURIComponent(claim.id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ proofUrl, note, expectedRevision: claim.revision }) }));
      const next = data.claim as ProjectClaim | undefined;
      if (!next?.id) throw new Error("We couldn’t confirm your proof submission. Refresh to check its status.");
      setClaim(next);
      onToast("Ownership proof submitted for review.");
      onComplete?.();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Your proof could not be submitted."); }
    finally { setBusy(false); }
  }

  async function copyProof() {
    if (!claim) return;
    try { await navigator.clipboard.writeText(`RMT ownership verification for ${project.name}: ${claim.verificationCode}`); onToast("Verification text copied."); }
    catch { onToast("You can select the verification text and copy it manually."); }
  }

  const expired = claimExpired(claim);
  const currentStatus = expired ? "expired" : claim?.status;
  const editable = claim?.status === "draft" && !expired;
  const mayStart = !claim || ["expired", "rejected", "revoked"].includes(currentStatus ?? "");
  const selectedOption = options?.methods.find(item => item.method === (editable ? claim?.method : method));
  const alreadyManaged = options?.claimed && claim?.status !== "approved";

  return <section className="st-page st-claim-page" aria-labelledby="claim-title">
    {onClose && <button type="button" className="st-text-button st-back-link" onClick={onClose}><ArrowLeft size={14} /> Back to project</button>}
    <header className="st-heading"><p className="st-eyebrow"><span /> PROJECT OWNERSHIP</p><h1 id="claim-title">Your project.<br /><span>Your space.</span></h1><p>Confirm you represent {project.name} to manage its RMT page and keep its official links up to date.</p></header>
    <div className="st-claim-layout">
      <div className="st-main">
        <div className="st-panel st-claim-project"><span className="st-project-initial">{project.initials}</span><div><span className="st-kicker">CLAIMING</span><h2>{project.name}</h2><p>{project.tagline}</p></div><KeyRound size={20} /></div>
        {!session.authenticated ? <div className="st-panel st-signin"><div className="st-symbol"><KeyRound size={24} /></div><h2>Start with your account.</h2><p>Sign in, then prove you control one of this project’s existing official channels.</p><a className="st-button st-primary" href="/#account" target="_top">Sign in to claim <ArrowRight size={16} /></a></div> : loading ? <div className="st-panel st-review-empty"><LoaderCircle size={24} className="st-spin" /><p>Checking official channels and your claim…</p></div> : loadError ? <div className="st-panel st-form"><p className="st-error" role="alert">{loadError}</p><button className="st-button st-secondary" type="button" onClick={() => void load()}><RefreshCw size={15} /> Try again</button></div> : currentStatus === "approved" ? <div className="st-panel st-received"><div className="st-symbol"><CheckCircle2 size={27} /></div><span className="st-status st-status-approved">Ownership confirmed</span><h2>You’re the confirmed manager.</h2><p>You can propose changes to {project.name} from My projects in Developer Studio. Changes go through review before replacing its public details.</p>{claim?.reviewNote && <div className="st-information">{claim.reviewNote}</div>}<a className="st-button st-primary" href="#studio">Open Developer Studio <ArrowRight size={16} /></a></div> : currentStatus === "pending" ? <div className="st-panel st-received" aria-live="polite"><div className="st-symbol"><Clock3 size={27} /></div><span className="st-status st-status-pending">Ownership review</span><h2>Your proof is in review.</h2><p>Keep the code visible on the official channel while the RMT team checks it. Submitting proof doesn’t change the project’s manager or public links.</p>{safeHttpsLink(claim?.proofUrl) && <a className="st-proof-link" href={claim!.proofUrl} target="_blank" rel="noopener noreferrer">View your submitted proof <ArrowUpRight size={14} /></a>}<p className="st-hint">Code expires {formattedDate(claim!.expiresAt)}.</p><button type="button" className="st-button st-secondary" onClick={() => void load()}><RefreshCw size={15} /> Check status</button></div> : alreadyManaged ? <div className="st-panel st-received"><div className="st-symbol"><ShieldCheck size={26} /></div><h2>This project has a manager.</h2><p>RMT has already confirmed a manager for this listing. If that is your account, you’ll find the project in Developer Studio.</p><a className="st-button st-secondary" href="#studio">Open Developer Studio <ArrowRight size={16} /></a></div> : <>
          {claim && mayStart && <div className="st-information"><strong>{claimStatusLabel(currentStatus ?? claim.status)}</strong><p>{currentStatus === "expired" ? "This proof code has expired. Create a fresh code below when you’re ready." : claim.reviewNote || "You can start a fresh claim using an official channel you control."}</p></div>}
          {mayStart && <section className="st-panel st-form"><div className="st-section-heading"><div><span className="st-step">01</span><h2>Choose an official channel</h2></div></div><p className="st-panel-intro">These links are already associated with the project. Choose one you can update.</p>{options?.methods.length ? <><div className="st-method-grid">{options.methods.map(option => { const Icon = option.method === "website" ? Globe2 : option.method === "x" ? MessageCircle : ShieldCheck; return <label key={option.method} className={`st-method-option ${method === option.method ? "selected" : ""}`}><input type="radio" name="claim-method" value={option.method} checked={method === option.method} onChange={() => setMethod(option.method)} /><Icon size={19} /><span><strong>{methodNames[option.method]}</strong><small>{methodDescriptions[option.method]}</small><span>{option.channelUrl}</span></span><Check size={15} className="st-method-check" /></label>; })}</div>{selectedOption && <p className="st-hint">{selectedOption.instructions}</p>}{error && <p className="st-error" role="alert">{error}</p>}<button type="button" className="st-button st-primary" disabled={busy || !method} onClick={() => void createClaim()}>{busy ? <LoaderCircle size={16} className="st-spin" /> : <KeyRound size={16} />} Create my proof code</button></> : <div className="st-empty-inline"><Globe2 size={19} /><p>No claimable official channel is recorded for this listing yet. Its official links need to be reviewed before an ownership claim can begin.</p></div>}</section>}
          {editable && claim && <form className="st-panel st-form" onSubmit={submitProof}><div className="st-section-heading"><div><span className="st-step">02</span><h2>Publish your unique code</h2></div><span>Expires {formattedDate(claim.expiresAt)}</span></div><p className="st-panel-intro">{selectedOption?.instructions || methodDescriptions[claim.method]}</p><a className="st-proof-link" href={claim.officialChannelUrl} target="_blank" rel="noopener noreferrer">{methodNames[claim.method]} <ArrowUpRight size={14} /></a><div className="st-code-panel"><span>Copy this complete verification text</span><div><code>RMT ownership verification for {project.name}: {claim.verificationCode}</code><button type="button" className="st-icon-button" aria-label="Copy ownership verification text" onClick={() => void copyProof()}><Copy size={16} /></button></div><p>Publish it from the official channel above and keep it visible until the review is complete.</p></div><div className="st-section-heading st-section-divider"><div><span className="st-step">03</span><h2>Show us where to check</h2></div></div><label className="st-field">Public link to your proof<input type="url" value={proofUrl} onChange={event => setProofUrl(event.target.value)} placeholder={claim.method === "x" ? "https://x.com/yourproject/status/…" : claim.method === "opensea" ? claim.officialChannelUrl : "https://yourproject.com/rmt"} maxLength={2048} required /><span className="st-hint">{claim.method === "x" ? "Use the direct link to the post containing your code." : claim.method === "opensea" ? "Use the official collection page after adding the code to its description." : "Use a public page on the official website above. We must be able to see the code without signing in."}</span></label><label className="st-field">Anything else we should know? <span className="st-optional">Optional · visible to the review team</span><textarea value={note} onChange={event => setNote(event.target.value)} maxLength={1000} rows={3} placeholder="Where to find the code, or a short note about your role." /></label>{error && <p className="st-error" role="alert">{error}</p>}<div className="st-submit-row"><p><ShieldCheck size={17} /><span>A reviewer checks the official channel.<br /><strong>Nothing changes until it’s approved.</strong></span></p><button type="submit" className="st-button st-primary" disabled={busy}>{busy ? <LoaderCircle size={16} className="st-spin" /> : <ArrowRight size={16} />} Submit ownership proof</button></div></form>}
        </>}
      </div>
      <aside className="st-aside"><section className="st-panel st-guide"><span className="st-kicker">A PAGE YOU CAN STAND BEHIND</span><h2>Confirm once.<br />Keep it current.</h2><ol><li><span>1</span><div><h3>Use an existing channel</h3><p>A project’s website, official X account, or collection settings.</p></div></li><li><span>2</span><div><h3>Publish your code</h3><p>A unique, time-limited code connects that channel to your RMT account.</p></div></li><li><span>3</span><div><h3>Get your workspace</h3><p>After approval, propose updates to your description, apps and official links.</p></div></li></ol><div className="st-guide-note"><ShieldCheck size={17} /><p>Holding an NFT doesn’t prove you run its project. Claims require control of an official project channel.</p></div></section></aside>
    </div>
  </section>;
}

export function MyClaims({ session, onToast }: StudioProps) {
  const [claims, setClaims] = useState<ProjectClaim[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    if (!session.authenticated) return;
    setLoading(true); setError("");
    try {
      const data = await readApiResponse(await fetch("/api/claims", { cache: "no-store" }));
      setClaims(Array.isArray(data.claims) ? data.claims as ProjectClaim[] : []);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Your ownership claims could not be loaded."); }
    finally { setLoading(false); }
  }, [session.authenticated]);
  useEffect(() => { void load(); }, [load]);
  if (!session.authenticated) return <div className="st-panel st-signin"><div className="st-symbol"><KeyRound size={25} /></div><h2>Your projects, in your hands.</h2><p>Sign in to claim an existing project and keep track of your ownership review.</p><a className="st-button st-primary" href="/#account" target="_top">Sign in <ArrowRight size={16} /></a></div>;
  return <section className="st-panel st-form"><div className="st-section-heading"><div><h2>Your ownership claims</h2><span className="st-count">{claims.length}</span></div><button type="button" className="st-text-button" disabled={loading} onClick={() => void load()}>{loading ? "Refreshing…" : "Refresh"}</button></div>{error ? <p className="st-error" role="alert">{error}</p> : loading && !claims.length ? <p className="st-muted">Loading your claims…</p> : !claims.length ? <div className="st-review-empty"><div className="st-symbol"><KeyRound size={25} /></div><h2>Already on RMT?</h2><p>Find your project in Discover, open its page, and choose “Claim project.” You’ll get a code to publish through one of its official channels.</p><a className="st-button st-secondary" href="#discover">Find my project <ArrowRight size={16} /></a></div> : <div className="st-claim-list">{claims.map(item => { const status = claimExpired(item) ? "expired" : item.status; return <article className="st-claim-row" key={item.id}><div><span className="st-kicker">{methodNames[item.method]}</span><h3>{item.projectName}</h3><p>Started {formattedDate(item.createdAt)}</p>{item.reviewNote && <p className="st-feedback">{item.reviewNote}</p>}</div><div className="st-claim-row-actions"><span className={`st-status st-status-${status}`}>{claimStatusLabel(status)}</span><a className="st-text-button" href={`#claim/${encodeURIComponent(item.projectId)}`}>{status === "draft" ? "Continue proof" : "View claim"} <ArrowRight size={14} /></a></div></article>; })}</div>}</section>;
}

export default ClaimProject;
