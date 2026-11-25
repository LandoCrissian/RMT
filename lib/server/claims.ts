import type { Project } from '@/lib/catalog';
import { InputError, normalizeHost, optionalXProfile, type ClaimMethod } from '@/lib/submission-validation';
import type { PlatformIdentity } from './auth';
import {claimContract} from '@/lib/claim-contracts';
import {projectAssessment} from './listing-eligibility';
import {recheckForApproval,type AuthorityEvidence,type Recheck} from './claim-recheck';
import {publicProjectSql} from './control-visibility';
import {activeControlMemberSql} from './control-sql';
import { pendingNotifications } from './outbox-events';

export type ClaimRow = {
  id:string;project_id:string;project_name:string;user_id:string;account_email:string;method:ClaimMethod;
  official_channel_url:string;verification_code:string;proof_url:string;note:string;status:'draft'|'pending'|'approved'|'rejected'|'revoked';
  proof_method:'wallet'|'manual'; evidence_json?:string|null; recheck_json?:string|null;
  review_note:string;revision:number;expires_at:number;created_at:number;updated_at:number;
};
export type OwnerRow = {project_id:string;user_id:string;claim_id:string|null;status:'active'|'revoked';revision:number;created_at:number;updated_at:number};
const privateClaimQuery=`SELECT c.*,e.evidence_json,e.recheck_json FROM project_claims c
  LEFT JOIN wallet_claim_evidence e ON e.claim_id=c.id`;
export function privateClaim(row:ClaimRow, admin=false) {
  const verification=row.proof_method==='wallet'&&row.evidence_json?JSON.parse(row.evidence_json) as AuthorityEvidence & {source?:string;codeHash?:string}:null;
  const expired = ['draft','pending'].includes(row.status) && row.expires_at <= Date.now();
  return {id:row.id,projectId:row.project_id,projectName:row.project_name,method:row.method,officialChannelUrl:row.official_channel_url,
    proofMethod:row.proof_method, walletEvidence:verification?{
      source:verification.source??claimContract(row.project_id)?.source,verification,
      lastRecheck:row.recheck_json?JSON.parse(row.recheck_json) as Recheck:null}:null,
    verificationCode:row.verification_code,proofUrl:row.proof_url,note:row.note,status:expired?'expired':row.status,
    reviewNote:row.review_note,revision:row.revision,expiresAt:row.expires_at,createdAt:row.created_at,updatedAt:row.updated_at,
    ...(admin?{userId:row.user_id,accountEmail:row.account_email}:{})};
}

export function projectClaimMethods(project:Project) {
  const allUrls = [project.website,...(project.collections??[]).map(value=>value.url),...project.links.map(link=>link.url),project.launchUrl].filter(Boolean);
  const methods:{method:ClaimMethod;channelUrl:string;instructions:string}[]=[];
  const website = project.website;
  if (website && !['x.com','twitter.com','opensea.io','linktr.ee','instagram.com','facebook.com','discord.com','discord.gg','t.me'].includes(normalizeHost(website))) {
    methods.push({method:'website',channelUrl:website,instructions:'Publish the exact challenge code on this official website, then submit the public page URL. A reviewer will check that the page is controlled by this project.'});
  }
  const x = allUrls.find(url=>{
    try { return !!optionalXProfile(url); } catch { return false; }
  });
  if(x) methods.push({method:'x',channelUrl:optionalXProfile(x),instructions:'Post the exact challenge code from this official X profile, or add it to its bio. Submit the post or profile URL for manual review.'});
  const collection = allUrls.find(url=>{
    try { return normalizeHost(url)==='opensea.io' && /^\/collection\/[^/]+\/?$/.test(new URL(url).pathname); }catch{return false;}
  });
  if(collection) methods.push({method:'opensea',channelUrl:collection,instructions:'Add the exact challenge code to this collection’s public description using its creator controls. Submit this collection URL. A reviewer will verify the code on the official collection.'});
  return methods;
}
export async function claimOptions(db:D1Database,projectId:string,fresh=false) {
  const {project,eligibility}=await projectAssessment(db,projectId,fresh);
  const owner=await db.prepare("SELECT * FROM project_owners WHERE project_id=? AND status='active'").bind(projectId).first<OwnerRow>();
  return {projectId,projectName:project.name,claimed:!!owner||project.claimed,methods:projectClaimMethods(project),walletContract:eligibility.contract,eligibilityReason:eligibility.reason};
}

export function proofMatchesChannel(method:ClaimMethod,channelUrl:string,proofUrl:string):boolean {
  const channel=new URL(channelUrl),proof=new URL(proofUrl);
  if(method==='website') return normalizeHost(channelUrl)===normalizeHost(proofUrl);
  if(method==='opensea') return normalizeHost(proofUrl)==='opensea.io' && proof.pathname.replace(/\/+$/,'')===channel.pathname.replace(/\/+$/,'');
  const proofHost=normalizeHost(proofUrl);
  if(!['x.com','twitter.com'].includes(proofHost))return false;
  const handle=channel.pathname.split('/').filter(Boolean)[0]?.toLowerCase();
  const parts=proof.pathname.split('/').filter(Boolean);
  return parts[0]?.toLowerCase()===handle && (parts.length===1||(parts.length===3 && parts[1]==='status' && /^\d+$/.test(parts[2])));
}
export async function createClaim(db:D1Database,user:PlatformIdentity,input:{projectId:string;method:ClaimMethod}) {
  const options=await claimOptions(db,input.projectId);
  if(options.claimed)throw new InputError('This project already has a verified builder. Ask an RMT reviewer about an ownership dispute.',409);
  const channel=options.methods.find(value=>value.method===input.method);
  if(!channel)throw new InputError('That channel is not an official destination for this project. Choose an available channel.');
  const now=Date.now(),id=crypto.randomUUID(),code=`rmt-claim-${crypto.randomUUID()}`;
  const result=await db.prepare(`INSERT INTO project_claims
    (id,project_id,project_name,user_id,account_email,method,official_channel_url,verification_code,proof_url,note,status,review_note,revision,expires_at,created_at,updated_at)
    SELECT ?,?,?,?,?,?,?,?,'','','draft','',1,?,?,?
    WHERE (SELECT COUNT(*) FROM project_claims WHERE user_id=? AND created_at>=?)<3
    AND NOT EXISTS(SELECT 1 FROM project_claims WHERE project_id=? AND user_id=? AND status IN ('draft','pending') AND expires_at>?)
    AND NOT EXISTS(SELECT 1 FROM project_owners WHERE project_id=? AND status='active')`)
    .bind(id,input.projectId,options.projectName,user.userId,user.email,input.method,channel.channelUrl,code,now+7*86_400_000,now,now,
      user.userId,now-86_400_000,input.projectId,user.userId,now,input.projectId).run();
  if(result.meta.changes!==1){
    const existing=await db.prepare("SELECT id FROM project_claims WHERE project_id=? AND user_id=? AND status IN ('draft','pending') AND expires_at>?").bind(input.projectId,user.userId,now).first();
    if(existing)throw new InputError('You already have an active claim for this project. Continue it in Builder Studio.',409);
    const owner=await db.prepare("SELECT project_id FROM project_owners WHERE project_id=? AND status='active'").bind(input.projectId).first();
    if(owner)throw new InputError('This project was just claimed. Refresh its page.',409);
    throw new InputError('You can start up to 3 claims in 24 hours. Try again later.',429);
  }
  const row=await db.prepare('SELECT * FROM project_claims WHERE id=? AND user_id=?').bind(id,user.userId).first<ClaimRow>();
  if(!row)throw new Error('Created claim was not readable');
  return privateClaim(row);
}
export async function ownClaims(db:D1Database,userId:string) {
  const result=await db.prepare(privateClaimQuery+' WHERE c.user_id=? ORDER BY c.updated_at DESC LIMIT 100').bind(userId).all<ClaimRow>();
  return result.results.map(row=>privateClaim(row));
}
export async function claimsQueue(db:D1Database) {
  const result=await db.prepare(privateClaimQuery+" ORDER BY CASE c.status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END,updated_at DESC LIMIT 200").all<ClaimRow>();
  return result.results.map(row=>privateClaim(row,true));
}

export async function claimCheckHistory(db:D1Database,id:string,before:string|null){
  if(!await db.prepare('SELECT id FROM project_claims WHERE id=?').bind(id).first())throw new InputError('Claim not found.',404);
  const cursor=before?await db.prepare('SELECT id,checked_at FROM wallet_claim_checks WHERE claim_id=? AND id=?').bind(id,before).first<{id:string;checked_at:number}>():null;
  if(before&&!cursor)throw new InputError('Invalid review history cursor.');
  const guard=cursor?' AND (checked_at<? OR (checked_at=? AND id<?))':'';
  const rows=await db.prepare('SELECT id,reviewer_id,revision,result_json,checked_at FROM wallet_claim_checks WHERE claim_id=?'+guard+' ORDER BY checked_at DESC,id DESC LIMIT 21')
    .bind(id,...(cursor?[cursor.checked_at,cursor.checked_at,cursor.id]:[])).all<{id:string;reviewer_id:string;revision:number;result_json:string;checked_at:number}>();
  const checks=rows.results.slice(0,20).map(r=>({id:r.id,reviewerId:r.reviewer_id,revision:r.revision,result:JSON.parse(r.result_json) as Recheck,checkedAt:r.checked_at}));
  return {checks,nextCursor:rows.results.length>20?checks[19].id:null};
}

export async function submitClaim(db:D1Database,user:PlatformIdentity,id:string,input:{proofUrl:string;note:string;expectedRevision:number}) {
  const row=await db.prepare('SELECT * FROM project_claims WHERE id=? AND user_id=?').bind(id,user.userId).first<ClaimRow>();
  if(!row)throw new InputError('This claim was not found.',404);
  const now=Date.now();
  if(row.status!=='draft'||row.revision!==input.expectedRevision)throw new InputError('Refresh this claim before submitting it. Only a draft can be submitted.',409);
  if(row.expires_at<=now)throw new InputError('This challenge expired. Start a new claim with a new code.',409);
  if(row.proof_method!=='manual')throw new InputError('Wallet evidence must pass the wallet verification check.',409);
  if(!proofMatchesChannel(row.method,row.official_channel_url,input.proofUrl))throw new InputError('The proof link must belong to the official channel shown on this challenge.');
  const results=await db.batch([
    db.prepare("UPDATE project_claims SET proof_url=?,note=?,status='pending',revision=revision+1,updated_at=? WHERE id=? AND user_id=? AND revision=? AND status='draft' AND proof_method='manual' AND expires_at>?")
      .bind(input.proofUrl,input.note,now,id,user.userId,row.revision,now),
    ...pendingNotifications(db,{kind:'claim',id,projectName:row.project_name,revision:row.revision+1,now}),
  ]);
  if(results[0]?.meta.changes!==1)throw new InputError('This claim changed before submission. Refresh it.',409);
  const updated=await db.prepare('SELECT * FROM project_claims WHERE id=? AND user_id=?').bind(id,user.userId).first<ClaimRow>();
  if(!updated)throw new Error('Submitted claim was not readable');
  return privateClaim(updated);
}
export async function reviewClaim(db:D1Database,reviewerId:string,id:string,decision:{action:'approve'|'reject'|'revoke';note:string;expectedRevision:number},reviewerRole?:string) {
  const row=await db.prepare('SELECT * FROM project_claims WHERE id=?').bind(id).first<ClaimRow>();
  if(!row)throw new InputError('This claim was not found.',404);
  const oldStatus=decision.action==='revoke'?'approved':'pending';
  if(row.status!==oldStatus||row.revision!==decision.expectedRevision)throw new InputError('This claim changed or is not ready for that decision. Refresh the queue.',409);
  if(decision.action==='approve'&&row.expires_at<=Date.now())throw new InputError('This challenge expired. The applicant must submit a fresh claim.',409);
  const auditId=crypto.randomUUID();
  let walletChecks:D1PreparedStatement[]=[];
  if(decision.action==='approve' && row.proof_method==='wallet'){
    if(reviewerRole!=='owner'&&reviewerRole!=='admin')throw new InputError('An administrator must approve a wallet ownership claim.',403);
    if(reviewerId===row.user_id)throw new InputError('A different administrator must review your claim.',403);
    walletChecks=await recheckForApproval(db,row,reviewerId,auditId);
  }
  const now=Date.now();
  if(decision.action==='approve'&&row.expires_at<=now)throw new InputError('This claim expired during review. Request fresh evidence.',409);
  const nextStatus=decision.action==='approve'?'approved':decision.action==='reject'?'rejected':'revoked';
  const audit=(extra='',args:(string|number)[]=[])=>db.prepare(`INSERT INTO claim_review_events (id,claim_id,reviewer_id,previous_status,next_status,note,revision,created_at)
    SELECT ?,id,?,status,?,?,revision+1,? FROM project_claims WHERE id=? AND revision=? AND status=? ${extra}`)
    .bind(auditId,reviewerId,nextStatus,decision.note,now,id,row.revision,row.status,...args);
  let statements:D1PreparedStatement[];
  if(decision.action==='approve'){
    const unowned="AND expires_at>? AND NOT EXISTS(SELECT 1 FROM project_owners WHERE project_id=project_claims.project_id AND status='active')";
    const walletEligible=row.proof_method==='wallet'?` AND ${activeControlMemberSql('project_claims.user_id')} AND ${publicProjectSql('project_claims.project_id')}
      AND EXISTS(SELECT 1 FROM wallet_claim_checks wc WHERE wc.id=? AND wc.claim_id=project_claims.id AND wc.revision=project_claims.revision)`:'';
    statements=[...walletChecks,audit(unowned+walletEligible,row.proof_method==='wallet'?[now,auditId]:[now]),
      db.prepare(`INSERT INTO project_owners (project_id,user_id,claim_id,status,revision,created_at,updated_at)
        SELECT project_id,user_id,id,'active',1,?,? FROM project_claims WHERE id=? AND revision=? AND status='pending' AND expires_at>?
        AND NOT EXISTS(SELECT 1 FROM project_owners WHERE project_id=project_claims.project_id AND status='active')
        AND EXISTS(SELECT 1 FROM claim_review_events WHERE id=? AND claim_id=project_claims.id)
        ON CONFLICT(project_id) DO UPDATE SET user_id=excluded.user_id,claim_id=excluded.claim_id,status='active',revision=project_owners.revision+1,updated_at=excluded.updated_at
        WHERE project_owners.status='revoked'`).bind(now,now,id,row.revision,now,auditId),
      db.prepare(`UPDATE project_claims SET status='approved',review_note=?,revision=revision+1,updated_at=? WHERE id=? AND revision=? AND status='pending' AND expires_at>?
        AND EXISTS(SELECT 1 FROM project_owners WHERE project_id=project_claims.project_id AND claim_id=project_claims.id AND user_id=project_claims.user_id AND status='active')`)
        .bind(decision.note,now,id,row.revision,now),
    ];
  }else if(decision.action==='revoke'){
    const active=await db.prepare("SELECT * FROM project_owners WHERE project_id=? AND claim_id=? AND user_id=? AND status='active'").bind(row.project_id,id,row.user_id).first<OwnerRow>();
    if(!active)throw new InputError('This claim no longer controls the project. Refresh the queue.',409);
    const revokedGuard="EXISTS(SELECT 1 FROM project_claims c JOIN project_owners o ON o.project_id=c.project_id WHERE c.id=? AND c.revision=? AND c.status='approved' AND o.claim_id=c.id AND o.status='revoked')";
    statements=[audit("AND EXISTS(SELECT 1 FROM project_owners WHERE project_id=project_claims.project_id AND claim_id=project_claims.id AND status='active')"),
      db.prepare("UPDATE project_owners SET status='revoked',revision=revision+1,updated_at=? WHERE project_id=? AND claim_id=? AND revision=? AND status='active' AND EXISTS(SELECT 1 FROM project_claims WHERE id=? AND revision=? AND status='approved')")
        .bind(now,row.project_id,id,active.revision,id,row.revision),
      db.prepare(`INSERT INTO edit_review_events (id,edit_id,reviewer_id,previous_status,next_status,note,revision,created_at)
        SELECT lower(hex(randomblob(16))),id,?,status,'rejected','Ownership was revoked before this edit was approved.',revision+1,? FROM project_edits WHERE project_id=? AND user_id=? AND status='pending' AND ${revokedGuard}`)
        .bind(reviewerId,now,row.project_id,row.user_id,id,row.revision),
      db.prepare(`UPDATE project_edits SET status='rejected',review_note='Ownership was revoked before this edit was approved.',revision=revision+1,updated_at=? WHERE project_id=? AND user_id=? AND status='pending' AND ${revokedGuard}`)
        .bind(now,row.project_id,row.user_id,id,row.revision),
      db.prepare(`UPDATE project_claims SET status='revoked',review_note=?,revision=revision+1,updated_at=? WHERE id=? AND revision=? AND status='approved'
        AND EXISTS(SELECT 1 FROM project_owners WHERE project_id=project_claims.project_id AND claim_id=project_claims.id AND status='revoked')`).bind(decision.note,now,id,row.revision),
    ];
  }else{
    statements=[audit(),db.prepare("UPDATE project_claims SET status='rejected',review_note=?,revision=revision+1,updated_at=? WHERE id=? AND revision=? AND status='pending'")
      .bind(decision.note,now,id,row.revision)];
  }
  const results=await db.batch(statements);
  if(results[walletChecks.length]?.meta.changes!==1||results.at(-1)?.meta.changes!==1)throw new InputError('The claim changed or another builder already owns this project. Refresh the queue.',409);
  const updated=await db.prepare(privateClaimQuery+' WHERE c.id=?').bind(id).first<ClaimRow>();
  if(!updated)throw new Error('Reviewed claim was not readable');
  return privateClaim(updated,true);
}
