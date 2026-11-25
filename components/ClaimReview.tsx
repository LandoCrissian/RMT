"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUpRight, Check, Clock3, Inbox, KeyRound, Link2, LoaderCircle, RefreshCw, ShieldCheck, X } from "lucide-react";
import type { Project } from "@/lib/catalog";
import type { ProjectEdit } from "./ManageProjects";
import { claimStatusLabel, formattedDate, readApiResponse, safeHttpsLink, stageLabel, statusLabel, type ProjectClaim, type WalletAuthorityEvidence, type StudioProps } from "./studio-shared";
import "./studio.css";
import { ArtworkPreview } from "./ProjectArtworkFields";

function ReviewArtwork({project,edit}: {project?: Project; edit?: ProjectEdit}) {
  return <div className="pa-review-images">{(['logo','banner'] as const).map(kind => {
    const published = project?.artwork?.[kind];
    const key = `${kind}AssetId` as const;
    const id = edit ? edit[key] === undefined ? published?.id : edit[key] : published?.id;
    return <div className="pa-review-image" key={kind}><strong>{kind === 'logo' ? 'Project logo' : 'Project & share banner'}</strong>{id ? <ArtworkPreview assetId={id} publicImage={published} kind={kind} /> : <p className="pa-review-empty">{edit && published ? 'This uploaded image will be removed.' : 'Original project artwork / RMT default.'}</p>}</div>;
  })}</div>;
}



function ReviewLink({ label, url }: { label: string; url: string }) {
  return <div><dt>{label}</dt><dd>{safeHttpsLink(url) ? <a href={url} target="_blank" rel="noopener noreferrer">{url}<ArrowUpRight size={14} /></a> : <span>{url || "Not supplied"}</span>}</dd></div>;
}
function AuthorityCheck({evidence}:{evidence:WalletAuthorityEvidence}) {
  return <dl className="st-review-links"><div><dt>Network</dt><dd>Robinhood Chain ({evidence.chainId})</dd></div>
    <div><dt>Project contract</dt><dd><code>{evidence.contract}</code></dd></div>
    <div><dt>Signing wallet</dt><dd><code>{evidence.address}</code></dd></div>
    <div><dt>Contract authority · {evidence.model}</dt><dd><code>{evidence.authority}</code></dd></div>
    <div><dt>Signature verification</dt><dd>{evidence.signatureType==="erc1271"?"Contract wallet · ERC-1271":"Account signature"}</dd></div>
    <div><dt>Verified block</dt><dd>{evidence.blockNumber} · {new Date(evidence.blockTimestamp*1000).toISOString()}<br/><code>{evidence.blockHash}</code></dd></div>
    <div><dt>Checked at</dt><dd>{new Date(evidence.checkedAt).toISOString()}</dd></div></dl>;
}
function WalletEvidence({claim}:{claim:ProjectClaim}){
  const evidence=claim.walletEvidence;
  return <section className="st-evidence wc-evidence"><h3>Wallet authority evidence</h3>
    {evidence?.verification?<><AuthorityCheck evidence={evidence.verification}/>
    {evidence.lastRecheck?(evidence.lastRecheck.outcome==="failed"?<p className="st-error">Approval check failed · {new Date(evidence.lastRecheck.checkedAt).toISOString()}. {evidence.lastRecheck.concern}</p>:
    <details><summary>Authority at final review</summary><AuthorityCheck evidence={evidence.lastRecheck}/></details>):
    <p>Contract authority must be rechecked when an administrator approves this claim.</p>}</>:<p>Verification evidence is unavailable. Approval requires a verified authority record.</p>}</section>;
}
type CheckEntry={id:string;reviewerId:string;revision:number;checkedAt:number;result:NonNullable<NonNullable<ProjectClaim["walletEvidence"]>["lastRecheck"]>};
function AuthorityHistory({claimId,account}:{claimId:string;account:string}){
  const [rows,setRows]=useState<CheckEntry[]>([]),[cursor,setCursor]=useState<string|null>(null),[loaded,setLoaded]=useState(false);
  const [error,setError]=useState(""),[busy,setBusy]=useState(false);
  const active=useRef<AbortController|null>(null);
  useEffect(()=>()=>active.current?.abort(),[]);
  async function fetchPage(){
    if(active.current)return;
    const controller=new AbortController();active.current=controller;setBusy(true);setError("");
    try{
      const query=cursor?"?before="+encodeURIComponent(cursor):"";
      const data=await readApiResponse(await fetch("/api/admin/claims/"+encodeURIComponent(claimId)+query,{
        headers:{"X-RMT-Account":account},cache:"no-store",signal:controller.signal}));
      if(!Array.isArray(data.checks)||!(data.nextCursor===null||typeof data.nextCursor==="string"))throw Error("The review history could not be verified.");
      if(!controller.signal.aborted){setRows(old=>[...old,...data.checks as CheckEntry[]]);setCursor(data.nextCursor);setLoaded(true);}
    }catch(e){if(!controller.signal.aborted)setError(e instanceof Error?e.message:"Review history is unavailable.");}
    finally{if(!controller.signal.aborted){active.current=null;setBusy(false);}}
  }
  return <details className="wc-evidence" onToggle={e=>{if(e.currentTarget.open&&!loaded)void fetchPage();}}><summary>Authority check history</summary>
    {rows.map(row=><article key={row.id}><strong>{row.result.outcome==="verified"?"Authority confirmed":"Approval check failed"}</strong>
    <p>{new Date(row.checkedAt).toISOString()} · Claim revision {row.revision}</p><p>Reviewer: <code>{row.reviewerId}</code></p>
    {row.result.outcome==="verified"?<AuthorityCheck evidence={row.result}/>:<p>{row.result.concern}</p>}</article>)}
    {loaded&&!rows.length&&<p>No approval checks recorded.</p>}{busy&&<p role="status">Loading checks…</p>}
    {error&&<p role="alert">{error}</p>}{(error||cursor)&&<button type="button" className="st-text-button" disabled={busy} onClick={()=>void fetchPage()}>{error?"Retry":"Older checks"}</button>}</details>;
}
function effectiveClaimStatus(claim: ProjectClaim) {
  return ["draft", "pending"].includes(claim.status) && claim.expiresAt <= Date.now() ? "expired" : claim.status;
}

export function ClaimReview({ session, onToast }: StudioProps) {
  const [claims, setClaims] = useState<ProjectClaim[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("pending");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [confirmedOwnership, setConfirmedOwnership] = useState(false);
  const [busy, setBusy] = useState<"approve" | "reject" | "revoke" | null>(null);
  const [actionError, setActionError] = useState("");

  const load = useCallback(async () => {
    if (!session.isAdmin) return;
    setLoading(true); setError("");
    try { const data = await readApiResponse(await fetch("/api/admin/claims", { cache: "no-store" })); setClaims(Array.isArray(data.claims) ? data.claims as ProjectClaim[] : []); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Ownership claims could not be loaded."); }
    finally { setLoading(false); }
  }, [session.isAdmin]);
  useEffect(() => { void load(); }, [load]);
  const filtered = claims.filter(claim => filter === "all" || effectiveClaimStatus(claim) === filter);
  const selected = filtered.find(claim => claim.id === selectedId) ?? filtered[0] ?? null;
  const selectedStatus = selected ? effectiveClaimStatus(selected) : null;
  const walletClaim=selected?.proofMethod==="wallet";
  const walletApprover=session.controlRole==="owner"||session.controlRole==="admin";
  const mayApprove=!walletClaim||Boolean(walletApprover&&selected?.walletEvidence?.verification);
  useEffect(() => { setNote(""); setConfirmedOwnership(false); setActionError(""); }, [selected?.id, selected?.revision]);

  async function decide(action: "approve" | "reject" | "revoke") {
    if (!selected || busy) return;
    setActionError("");
    if (note.trim().length < 5) { setActionError("Add a review note of at least 5 characters."); return; }
    if (action === "approve" && !confirmedOwnership) { setActionError("Check the ownership proof before approving this claim."); return; }
    setBusy(action);
    try {
      await readApiResponse(await fetch(`/api/admin/claims/${encodeURIComponent(selected.id)}`, { method: "POST", headers: { "Content-Type": "application/json", "X-RMT-Account":session.userId||"" }, body: JSON.stringify({ action, note, expectedRevision: selected.revision, confirmedOwnership }) }));
      onToast(action === "approve" ? "Ownership confirmed. The project manager can now propose changes." : action === "revoke" ? "Project management access removed." : "Ownership claim declined.");
      setSelectedId(null); await load();
    } catch (cause) { setActionError(cause instanceof Error ? cause.message : "The ownership decision could not be saved."); if(walletClaim)void load(); }
    finally { setBusy(null); }
  }

  if (!session.isAdmin) return null;
  return <div className="st-queue-section">
    <div className="st-section-heading"><div><h2>Ownership claims</h2><span className="st-count">{claims.filter(claim => effectiveClaimStatus(claim) === "pending").length} in review</span></div><button type="button" className="st-text-button" disabled={loading} onClick={() => void load()}><RefreshCw size={14} className={loading ? "st-spin" : ""} /> Refresh</button></div>
    <p className="st-panel-intro">Review evidence of control over the project’s contract or official channel. Only an administrator can approve wallet evidence.</p>
    <div className="st-review-filters" aria-label="Filter ownership claims">{[{ value: "pending", label: "In review" }, { value: "approved", label: "Confirmed managers" }, { value: "all", label: "All claims" }].map(item => <button type="button" key={item.value} aria-pressed={filter === item.value} className={filter === item.value ? "active" : ""} onClick={() => { setFilter(item.value); setSelectedId(null); }}>{item.label}</button>)}</div>
    {error ? <div className="st-panel st-form"><p className="st-error" role="alert">{error}</p><button type="button" className="st-button st-secondary" onClick={() => void load()}>Try again</button></div> : loading && !claims.length ? <div className="st-panel st-review-empty" role="status"><LoaderCircle className="st-spin" size={24} /><p>Loading ownership claims…</p></div> : !filtered.length ? <div className="st-panel st-review-empty"><div className="st-symbol"><KeyRound size={26} /></div><h2>No claims waiting here.</h2><p>Submitted ownership proofs appear here. Creating a code alone doesn’t submit a claim for approval.</p></div> : <div className="st-review-layout">
      <aside className="st-panel st-review-list" aria-label="Ownership claims">{filtered.map(claim => <button type="button" key={claim.id} className={`st-review-list-item ${selected?.id === claim.id ? "selected" : ""}`} onClick={() => setSelectedId(claim.id)}><span className="st-project-initial">{claim.projectName.slice(0, 1)}</span><span><strong>{claim.projectName}</strong><small>{claim.proofMethod==="wallet" ? "Wallet verification" : claim.method === "x" ? "X account" : claim.method === "opensea" ? "OpenSea collection" : "Website"} · {formattedDate(claim.createdAt)}</small><span className={`st-status st-status-${effectiveClaimStatus(claim)}`}>{claimStatusLabel(effectiveClaimStatus(claim))}</span></span><ArrowUpRight size={15} /></button>)}</aside>
      {selected && <article className="st-panel st-review-detail"><div className="st-review-detail-title"><div><span className="st-kicker">OWNERSHIP PROOF</span><h2>{selected.projectName}</h2></div><span className={`st-status st-status-${selectedStatus}`}>{claimStatusLabel(selectedStatus!)}</span></div><dl className="st-review-links">{walletClaim?<ReviewLink label="Canonical contract source" url={selected.walletEvidence?.source??""}/>:<><ReviewLink label="Existing official channel" url={selected.officialChannelUrl} /><ReviewLink label="Applicant’s proof" url={selected.proofUrl} /></>}{selected.accountEmail && <div><dt>Applicant account</dt><dd>{selected.accountEmail}</dd></div>}</dl>{walletClaim?<><WalletEvidence claim={selected}/><AuthorityHistory key={selected.id+JSON.stringify(selected.walletEvidence?.lastRecheck)} claimId={selected.id} account={session.userId??""}/></>:<section className="st-evidence"><h3>The exact code to check</h3><code>{selected.verificationCode}</code><p className="st-expiry">Code expires {formattedDate(selected.expiresAt)}.</p>{selected.note && <><h3>Applicant’s note</h3><p>{selected.note}</p></>}</section>}{selected.reviewNote && <div className="st-information"><strong>Recorded decision</strong><p>{selected.reviewNote}</p></div>}
        {selectedStatus === "draft" && <div className="st-information">The applicant has created a code but hasn’t submitted proof yet.</div>}
        {selectedStatus === "expired" && <div className="st-information">This code has expired. The applicant must start a new claim with a fresh code.</div>}
        {["pending", "approved"].includes(selectedStatus ?? "") && <div className="st-review-decision"><h3>{selectedStatus === "approved" ? "Manage access" : "Record the ownership review"}</h3>{selectedStatus === "pending" && <label className="st-check"><input type="checkbox" checked={confirmedOwnership} onChange={event => setConfirmedOwnership(event.target.checked)} disabled={!!busy||!mayApprove} /><span>{walletClaim?"I reviewed the project contract, signing wallet and recorded authority.":"I found this exact code on the listed official channel and confirmed the applicant controls it."}</span></label>}<label className="st-field">Review note<textarea value={note} onChange={event => setNote(event.target.value)} minLength={5} maxLength={1000} rows={3} placeholder={selectedStatus === "approved" ? "Explain why project management access is being removed." : "What did you check, or why could ownership not be confirmed?"} /><span className="st-hint">The applicant can see this note.</span></label>{actionError && <p className="st-error" role="alert">{actionError}</p>}<div className="st-review-actions">{selectedStatus === "approved" ? <button type="button" className="st-button st-danger" disabled={!!busy || note.trim().length < 5} onClick={() => void decide("revoke")}>{busy === "revoke" ? <LoaderCircle size={16} className="st-spin" /> : <X size={16} />} Remove management access</button> : <><button type="button" className="st-button st-primary" disabled={!!busy || !mayApprove || !confirmedOwnership || note.trim().length < 5} onClick={() => void decide("approve")}>{busy === "approve" ? <LoaderCircle size={16} className="st-spin" /> : <Check size={16} />} Confirm ownership</button><button type="button" className="st-button st-danger" disabled={!!busy || note.trim().length < 5} onClick={() => void decide("reject")}>{busy === "reject" ? <LoaderCircle size={16} className="st-spin" /> : <X size={16} />} Decline claim</button></>}</div><p className="st-review-footnote">{walletClaim&&!walletApprover?"A site administrator must approve this wallet claim. ":""}Confirming ownership allows the applicant to propose changes. Public edits still require review.</p></div>}
      </article>}
    </div>}
  </div>;
}

export function EditReview({ session, onToast }: StudioProps) {
  const [edits, setEdits] = useState<ProjectEdit[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("pending");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [checkedLinks, setCheckedLinks] = useState(false);
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [actionError, setActionError] = useState("");
  const load = useCallback(async () => {
    if (!session.isAdmin) return;
    setLoading(true); setError("");
    try {
      const [data, catalog] = await Promise.all([fetch("/api/admin/project-edits", { cache: "no-store" }).then(readApiResponse), fetch("/api/catalog", { cache: "no-store" }).then(readApiResponse)]);
      setEdits(Array.isArray(data.edits) ? data.edits as ProjectEdit[] : []);
      setProjects(Array.isArray(catalog.projects) ? catalog.projects as Project[] : []);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Proposed project changes could not be loaded."); }
    finally { setLoading(false); }
  }, [session.isAdmin]);
  useEffect(() => { void load(); }, [load]);
  const filtered = edits.filter(edit => filter === "all" || edit.status === filter);
  const selected = filtered.find(edit => edit.id === selectedId) ?? filtered[0] ?? null;
  const current = projects.find(project => project.id === selected?.projectId);
  useEffect(() => { setNote(""); setCheckedLinks(false); setActionError(""); }, [selected?.id, selected?.revision]);
  async function decide(action: "approve" | "reject") {
    if (!selected || busy) return;
    setActionError("");
    if (note.trim().length < 5) { setActionError("Add a review note of at least 5 characters."); return; }
    if (action === "approve" && !checkedLinks) { setActionError("Check the proposed links before approving this update."); return; }
    setBusy(action);
    try {
      await readApiResponse(await fetch(`/api/admin/project-edits/${encodeURIComponent(selected.id)}`, { method: "POST", headers: { "Content-Type": "application/json", "X-RMT-Account":session.userId||"" }, body: JSON.stringify({ action, note, checkedLinks, expectedRevision: selected.revision }) }));
      onToast(action === "approve" ? "Project changes approved and published." : "Proposed changes declined. The current page is unchanged.");
      setSelectedId(null); await load();
    } catch (cause) { setActionError(cause instanceof Error ? cause.message : "The project update decision could not be saved."); }
    finally { setBusy(null); }
  }
  if (!session.isAdmin) return null;
  return <div className="st-queue-section"><div className="st-section-heading"><div><h2>Proposed project updates</h2><span className="st-count">{edits.filter(edit => edit.status === "pending").length} in review</span></div><button type="button" className="st-text-button" disabled={loading} onClick={() => void load()}><RefreshCw size={14} className={loading ? "st-spin" : ""} /> Refresh</button></div><p className="st-panel-intro">Compare the current page with the manager’s proposed changes. New links and artwork only become public after approval.</p><div className="st-review-filters" aria-label="Filter project updates">{[{ value: "pending", label: "In review" }, { value: "all", label: "All updates" }].map(item => <button type="button" key={item.value} aria-pressed={filter === item.value} className={filter === item.value ? "active" : ""} onClick={() => { setFilter(item.value); setSelectedId(null); }}>{item.label}</button>)}</div>
    {error ? <div className="st-panel st-form"><p className="st-error" role="alert">{error}</p><button type="button" className="st-button st-secondary" onClick={() => void load()}>Try again</button></div> : loading && !edits.length ? <div className="st-panel st-review-empty" role="status"><LoaderCircle className="st-spin" size={24} /><p>Loading proposed changes…</p></div> : !filtered.length ? <div className="st-panel st-review-empty"><div className="st-symbol"><Link2 size={26} /></div><h2>No updates waiting.</h2><p>When a confirmed manager proposes a new description, image, or link, it will appear here for review.</p></div> : <div className="st-review-layout"><aside className="st-panel st-review-list" aria-label="Project updates">{filtered.map(edit => <button type="button" key={edit.id} className={`st-review-list-item ${selected?.id === edit.id ? "selected" : ""}`} onClick={() => setSelectedId(edit.id)}><span className="st-project-initial">{edit.projectName.slice(0, 1)}</span><span><strong>{edit.projectName}</strong><small>{formattedDate(edit.createdAt)}</small><span className={`st-status st-status-${edit.status}`}>{edit.status === "approved" ? "Changes published" : statusLabel(edit.status)}</span></span><ArrowUpRight size={15} /></button>)}</aside>{selected && <article className="st-panel st-review-detail"><div className="st-review-detail-title"><div><span className="st-kicker">PROJECT UPDATE</span><h2>{selected.projectName}</h2></div><span className={`st-status st-status-${selected.status}`}>{selected.status === "approved" ? "Changes published" : statusLabel(selected.status)}</span></div><div className="st-edit-comparison"><section><span className="st-kicker">CURRENT PAGE</span>{current ? <><p>{current.description}</p><div className="st-stage-line">{current.category} · {stageLabel(current.stage)}</div><ReviewArtwork project={current} /><dl className="st-review-links"><ReviewLink label="Website" url={current.website} /><ReviewLink label="Main destination" url={current.launchUrl} />{current.links.map((link, index) => <ReviewLink key={`${link.url}-${index}`} label={link.label} url={link.url} />)}</dl></> : <p className="st-muted">This project is not in the current public directory. Check its status before reviewing changes.</p>}</section><section><span className="st-kicker">PROPOSED UPDATE</span><p>{selected.summary}</p><div className="st-stage-line">{selected.category} · {stageLabel(selected.stage)}</div><ReviewArtwork project={current} edit={selected} /><dl className="st-review-links"><ReviewLink label="Website" url={selected.website} /><ReviewLink label="X profile" url={selected.xProfile} /><ReviewLink label="Main destination" url={selected.launchUrl} />{selected.links.map((link, index) => <ReviewLink key={`${link.url}-${index}`} label={`${link.label}${link.type ? ` · ${link.type}` : ""}`} url={link.url} />)}</dl></section></div>{selected.reviewNote && <div className="st-information"><strong>Recorded decision</strong><p>{selected.reviewNote}</p></div>}{selected.status === "pending" && <div className="st-review-decision"><h3>Review the proposed update</h3><label className="st-check"><input type="checkbox" checked={checkedLinks} onChange={event => setCheckedLinks(event.target.checked)} disabled={!!busy} /><span>I checked the changed details, uploaded artwork, and all proposed official links.</span></label><label className="st-field">Review note<textarea value={note} onChange={event => setNote(event.target.value)} minLength={5} maxLength={1000} rows={3} placeholder="Explain the decision or what needs to be corrected." /><span className="st-hint">The project manager can see this note.</span></label>{actionError && <p className="st-error" role="alert">{actionError}</p>}<div className="st-review-actions"><button type="button" className="st-button st-primary" disabled={!!busy || !checkedLinks || note.trim().length < 5} onClick={() => void decide("approve")}>{busy === "approve" ? <LoaderCircle size={16} className="st-spin" /> : <Check size={16} />} Approve changes</button><button type="button" className="st-button st-danger" disabled={!!busy || note.trim().length < 5} onClick={() => void decide("reject")}>{busy === "reject" ? <LoaderCircle size={16} className="st-spin" /> : <X size={16} />} Decline changes</button></div><p className="st-review-footnote">Approving replaces the public details with this update. Declining keeps the current page as it is.</p></div>}</article>}</div>}
  </div>;
}

export default ClaimReview;
