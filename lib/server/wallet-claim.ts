import {claimContract} from '@/lib/claim-contracts';
import {InputError} from '@/lib/submission-validation';
import {claimOptions,createClaim} from './claims';
import {reserveClaimRpc} from './claim-budget';
import {verifyClaimAuthority} from './claim-chain';
import {pendingNotifications} from './outbox-events';
import {activeControlMemberSql} from './control-sql';
import {publicProjectSql} from './control-visibility';
import {requireCommunityIntake} from './control-settings';
import type {PlatformIdentity} from './auth';

export const browserCookie='__Host-rmt-claim-browser';
export function newBrowserKey(){return crypto.randomUUID().replaceAll('-','')+crypto.randomUUID().replaceAll('-','');}
async function digest(value:string){
  const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));
  return Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('');
}
type Challenge={id:string;claim_id:string;project_id:string;user_id:string;address:string;contract:string;message:string;
  consumed_at:number|null;origin:string;browser_hash:string;expires_at:number;revision:number;};
const validAccount=`${activeControlMemberSql('project_claims.user_id')} AND NOT EXISTS
  (SELECT 1 FROM account_links a WHERE 'firebase:'||a.firebase_uid=project_claims.user_id AND a.legacy_user_id<>project_claims.user_id)`;

export async function issueWalletClaim(db:D1Database,user:PlatformIdentity,origin:string,browser:string,projectId:string,address:string){
  if(!/^0x[0-9a-fA-F]{40}$/.test(address)||/^0x0{40}$/i.test(address))throw new InputError('Select a valid wallet address.');
  const target=claimContract(projectId);
  if(!target)throw new InputError('A canonical contract and authority model have not been established for this project. Submit manual evidence.',422);
  const options=await claimOptions(db,projectId);
  if(options.claimed)throw new InputError('This project already has a manager.',409);
  let draft=await db.prepare(`SELECT id,revision FROM project_claims WHERE user_id=? AND project_id=? AND status='draft' AND expires_at>?`)
    .bind(user.userId,projectId,Date.now()).first<{id:string;revision:number}>();
  if(!draft){
    const fallback=options.methods[0];
    if(!fallback)throw new InputError('This listing needs an official project destination before a claim can start.',422);
    draft=await createClaim(db,user,{projectId,method:fallback.method});
  }
  const claim=draft!,now=Date.now(),expiresAt=now+300_000,id=crypto.randomUUID();
  const browserHash=await digest(browser),account=await digest(user.userId),nonce=newBrowserKey();
  const message=[new URL(origin).host+' requests proof of project authority on RMT.','',
    'Claim project: '+options.projectName,'Project ID: '+projectId,'Contract: '+target.address,
    'Wallet: '+address,'Robinhood Chain ID: 4663','Purpose: project ownership review only',
    'This message does not authorize a transaction, token approval or account sign-in.','',
    'Origin: '+origin,'Claim: '+claim.id,'Account binding: '+account,'Browser binding: '+browserHash,
    'Nonce: '+nonce,'Issued at: '+new Date(now).toISOString(),'Expires at: '+new Date(expiresAt).toISOString()].join('\n');
  const result=await db.prepare(`INSERT INTO wallet_claim_challenges
    (id,claim_id,project_id,user_id,address,contract,origin,browser_hash,message,revision,created_at,expires_at)
    SELECT ?,id,project_id,user_id,?,?,?,?,?,revision,?,? FROM project_claims WHERE id=? AND revision=? AND status='draft'
    AND expires_at>? AND ${validAccount}
    AND (SELECT COUNT(*) FROM wallet_claim_challenges WHERE user_id=? AND created_at>=?)<12
    AND (SELECT COUNT(*) FROM wallet_claim_challenges WHERE created_at>=?)<500`)
    .bind(id,address,target.address,origin,browserHash,message,now,expiresAt,claim.id,claim.revision,now,user.userId,now-86_400_000,now-86_400_000).run();
  if(result.meta.changes!==1)throw new InputError('The claim changed or the daily challenge limit was reached. Refresh your claim before trying again.',429);
  return {challengeId:id,claimId:claim.id,message,address,contract:target.address,chainId:4663,expiresAt};
}

export async function verifyWalletClaim(db:D1Database,user:PlatformIdentity,origin:string,browser:string,id:string,signature:string){
  if(!/^[0-9a-f-]{36}$/i.test(id)||!/^0x(?:[0-9a-fA-F]{2}){1,4096}$/.test(signature))throw new InputError('The wallet response is incomplete.');
  const hash=await digest(browser),now=Date.now();
  const row=await db.prepare('SELECT * FROM wallet_claim_challenges WHERE id=? AND user_id=? AND origin=? AND browser_hash=?')
    .bind(id,user.userId,origin,hash).first<Challenge>();
  if(!row)throw new InputError('This wallet request is unavailable in this account and browser.',404);
  const spent=await db.prepare(`UPDATE wallet_claim_challenges SET consumed_at=?,outcome='checking'
    WHERE id=? AND consumed_at IS NULL AND expires_at>? AND EXISTS(SELECT 1 FROM project_claims WHERE id=?
    AND user_id=? AND status='draft' AND revision=? AND expires_at>? AND ${validAccount})`)
    .bind(now,id,now,row.claim_id,user.userId,row.revision,now).run();
  if(spent.meta.changes!==1)throw new InputError('This request expired, was used, or the claim changed. Request a new message.',409);
  try{
    const target=claimContract(row.project_id);
    if(!target||target.address.toLowerCase()!==row.contract.toLowerCase())throw new InputError('The reviewed contract changed. Submit a new request.',409);
    await reserveClaimRpc(db,user.userId);
    const evidence=await verifyClaimAuthority({projectId:row.project_id,contract:row.contract,address:row.address,message:row.message,signature});
    await requireCommunityIntake(db,'claims');
    const done=Date.now(),rev=row.revision+1;
    const results=await db.batch([
      db.prepare(`INSERT INTO wallet_claim_evidence(claim_id,challenge_id,evidence_json)
        SELECT id,?,? FROM project_claims WHERE id=? AND user_id=? AND status='draft' AND revision=? AND expires_at>? AND ?>?
        AND ${validAccount} AND ${publicProjectSql('project_claims.project_id')} AND NOT EXISTS(SELECT 1 FROM project_owners o
          WHERE o.project_id=project_claims.project_id AND o.status='active')`)
        .bind(id,JSON.stringify({...evidence,source:target.source,codeHash:target.codeHash}),row.claim_id,user.userId,row.revision,done,row.expires_at,done),
      db.prepare(`UPDATE project_claims SET status='pending',proof_method='wallet',revision=revision+1,updated_at=?
        WHERE id=? AND revision=? AND status='draft' AND EXISTS(SELECT 1 FROM wallet_claim_evidence
          WHERE challenge_id=? AND claim_id=project_claims.id)`).bind(done,row.claim_id,row.revision,id),
      db.prepare(`UPDATE wallet_claim_challenges SET outcome='verified',signature=? WHERE id=? AND EXISTS(
        SELECT 1 FROM wallet_claim_evidence WHERE challenge_id=? AND claim_id=?)`).bind(signature,id,id,row.claim_id),
      ...pendingNotifications(db,{kind:'claim',id:row.claim_id,projectName:(await db.prepare('SELECT project_name FROM project_claims WHERE id=?')
        .bind(row.claim_id).first<{project_name:string}>())!.project_name,revision:rev,now:done})
    ]);
    if(results.slice(0,3).some(r=>r.meta.changes!==1))throw new InputError('The claim or challenge changed during verification. Refresh your claim.',409);
    return {claimId:row.claim_id,status:'pending'};
  }catch(error){
    const reason=error instanceof InputError?'rejected-'+error.status:'unavailable';
    await db.prepare("UPDATE wallet_claim_challenges SET outcome=? WHERE id=? AND outcome='checking'").bind(reason,id).run();
    throw error;
  }
}
