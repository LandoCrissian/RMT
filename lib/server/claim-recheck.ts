import {currentEligibility,listingRevision,listingRevisionSql} from './listing-eligibility';
import {InputError} from '@/lib/submission-validation';
import {verifyClaimAuthority} from './claim-chain';
import {reserveClaimRpc} from './claim-budget';

type StoredProof = {
  challenge_id:string; project_id:string; contract:string; address:string;
  message:string; signature:string; evidence_json:string;
};
export type AuthorityEvidence=Awaited<ReturnType<typeof verifyClaimAuthority>>;
export type Recheck=({outcome:'verified'} & AuthorityEvidence) | {outcome:'failed';concern:string;checkedAt:number};
type Review = {claimId:string;revision:number;reviewer:string;checkId:string;challengeId:string;result:Recheck;listingVersion?:string};

function checkRecords(db:D1Database,review:Review){
  const {claimId,reviewer,revision,checkId,challengeId,result}=review;
  const saved=JSON.stringify(result);
  return [
    db.prepare(`INSERT INTO wallet_claim_checks(id,claim_id,challenge_id,reviewer_id,revision,result_json,checked_at)
      SELECT ?,c.id,e.challenge_id,?,?,?,? FROM project_claims c JOIN wallet_claim_evidence e ON e.claim_id=c.id
      WHERE c.id=? AND c.proof_method='wallet' AND c.status='pending' AND c.revision=? AND e.challenge_id=?
      AND (? IS NULL OR ${listingRevisionSql('c.project_id')}=?)`)
      .bind(checkId,reviewer,revision,saved,result.checkedAt,claimId,revision,challengeId,review.listingVersion??null,review.listingVersion??null),
    db.prepare(`UPDATE wallet_claim_evidence SET recheck_json=? WHERE claim_id=? AND challenge_id=?
      AND EXISTS(SELECT 1 FROM wallet_claim_checks WHERE id=? AND claim_id=wallet_claim_evidence.claim_id)`)
      .bind(saved,claimId,challengeId,checkId)
  ];
}

/** Read a fresh confirmed block and revalidate the exact original signed proof.
 * Checks are stored privately. A failed check leaves the claim pending.
 */
export async function recheckForApproval(db:D1Database,row:{id:string;revision:number;user_id:string},reviewer:string,checkId:string){
  const proof=await db.prepare(`SELECT e.challenge_id,e.evidence_json,c.project_id,w.contract,w.address,w.message,w.signature
    FROM project_claims c JOIN wallet_claim_evidence e ON e.claim_id=c.id JOIN wallet_claim_challenges w
    ON w.id=e.challenge_id AND w.claim_id=c.id AND w.project_id=c.project_id AND w.user_id=c.user_id
    WHERE c.id=? AND c.status='pending' AND c.revision=? AND c.proof_method='wallet'`).bind(row.id,row.revision).first<StoredProof>();
  if(!proof?.signature)throw new InputError('The original signed project evidence is unavailable. This claim needs manual review.',409);
  const review={claimId:row.id,revision:row.revision,reviewer,checkId,challengeId:proof.challenge_id};
  let version:string;
  let verified:AuthorityEvidence & {source?:string;codeHash?:string};
  try{
    const original=JSON.parse(proof.evidence_json) as AuthorityEvidence & {source?:string;codeHash?:string};
    version=await listingRevision(db,proof.project_id);
    const target=(await currentEligibility(db,proof.project_id,true)).contract;
    if(!target || target.address.toLowerCase()!==proof.contract.toLowerCase() ||
      (original.codeHash!==undefined && original.codeHash!==target.codeHash) ||
      (original.source!==undefined && original.source!==target.source))
      throw new InputError('The reviewed project contract or its provenance changed. Request new evidence or use manual review.',409);
    await reserveClaimRpc(db,reviewer);
    verified=await verifyClaimAuthority({projectId:proof.project_id,contract:proof.contract,address:proof.address,message:proof.message,signature:proof.signature},target);
    verified={...verified,codeHash:target.codeHash,source:target.source};
    if(verified.chainId!==original.chainId || verified.contract.toLowerCase()!==original.contract.toLowerCase() ||
      verified.authority.toLowerCase()!==original.authority.toLowerCase() || verified.address.toLowerCase()!==original.address.toLowerCase() ||
      verified.model!==original.model || verified.signatureType!==original.signatureType ||
      verified.blockNumber<original.blockNumber || (verified.blockNumber===original.blockNumber && verified.blockHash!==original.blockHash))
      throw new InputError('The authority or confirmed block changed. Request new evidence or use manual review.',409);
  }catch(error){
    const failure=error instanceof InputError?error:new InputError('The contract authority check is unavailable. Retry or request manual evidence.',503);
    await db.batch(checkRecords(db,{...review,result:{outcome:'failed',concern:failure.message,checkedAt:Date.now()}}));
    throw failure;
  }
  return checkRecords(db,{...review,listingVersion:version,result:{...verified,outcome:'verified'}});
}
