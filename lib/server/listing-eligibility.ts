import type {Project} from '@/lib/catalog';
import {assessListing,listingContractAddresses,manualEligibility,type Eligibility} from '@/lib/claim-eligibility';
import {reserveClaimRpc} from './claim-budget';
import {inspectClaimModel} from './claim-chain';
import {catalog} from './repository';
import {InputError} from '@/lib/submission-validation';

const hour=3_600_000;
type Cached={binding:string;status:string;result_json:string;expires_at:number};
type Answer={name?:unknown;type?:unknown;data?:unknown;TTL?:unknown};
async function declaration(url:URL,name:string,expected:string):Promise<number>{
  // Fixed resolver destinations; never fetch any URL from a project or TXT record.
  url.searchParams.set('name',name);url.searchParams.set('type','TXT');
  const response=await fetch(url,{headers:{Accept:'application/dns-json'},redirect:'error',signal:AbortSignal.timeout(4000)});
  if(!response.ok||!response.body)throw Error('Resolver unavailable');
  const reader=response.body.getReader(),decoder=new TextDecoder();let text='',bytes=0;
  try{while(true){const {value,done}=await reader.read();if(done)break;
    if((bytes+=value.length)>8192){await reader.cancel();throw Error('Oversized DNS answer');}text+=decoder.decode(value,{stream:true});}
  }finally{reader.releaseLock();}
  const data=JSON.parse(text+decoder.decode()) as {Status:number;AD:boolean;CD:boolean;TC:boolean;Answer?:Answer[];Question?:{name:string;type:number}[]};
  const answers=data.Answer?.filter(r=>r.type!==46); // Some resolvers return the RRSIG alongside TXT.
  if(data.Status!==0||data.AD!==true||data.CD!==false||data.TC!==false||answers?.length!==1||
    data.Question?.length!==1||data.Question[0].type!==16||data.Question[0].name.toLowerCase().replace(/\.$/,'')!==name)return 0;
  const record=answers[0];
  if(typeof record.name!=='string'||record.name.toLowerCase().replace(/\.$/,'')!==name||record.type!==16||
    typeof record.TTL!=='number'||!Number.isSafeInteger(record.TTL)||record.TTL<=0||
    (record.data!==expected && record.data!==JSON.stringify(expected)))return 0;
  return record.TTL;
}

/** Assess only when viewing a claim or checking its proof. Directory reads never contact DNS or RPC. */
export async function listingEligibility(db:D1Database,project:Project,projects:Project[],fresh=false):Promise<Eligibility>{
  const candidate=assessListing(project);
  if('status' in candidate)return candidate;
  const {address,host}=candidate,binding=JSON.stringify([host,address]),now=Date.now();
  if(projects.some(other=>other.id!==project.id&&listingContractAddresses(other).has(address)))
    return manualEligibility('More than one published project references this contract. An administrator must resolve the conflict.');
  const conflict=await db.prepare(`SELECT 1 AS found FROM wallet_claim_evidence e JOIN project_claims c ON c.id=e.claim_id
    WHERE c.project_id<>? AND c.status IN ('pending','approved') AND lower(json_extract(e.evidence_json,'$.contract'))=? LIMIT 1`)
    .bind(project.id,address).first();
  if(conflict)return manualEligibility('The contract could not be uniquely attributed to this project. Submit manual evidence.');
  const existing=await db.prepare('SELECT binding,status,result_json,expires_at FROM claim_eligibility_cache WHERE project_id=?').bind(project.id).first<Cached>();
  if(existing?.binding===binding&&existing.expires_at>now){
    if(existing.status==='checking')return manualEligibility('Verification is in progress. Check again shortly.');
    if(!fresh||existing.status!=='eligible')return JSON.parse(existing.result_json) as Eligibility;
  }
  const lock=crypto.randomUUID();
  const reservation=await db.prepare(`INSERT INTO claim_eligibility_cache(project_id,binding,status,owner_token,result_json,checked_at,expires_at)
    VALUES(?,?,'checking',?,'{}',?,?) ON CONFLICT(project_id) DO UPDATE SET binding=excluded.binding,status='checking',
    owner_token=excluded.owner_token,result_json='{}',checked_at=excluded.checked_at,expires_at=excluded.expires_at
    WHERE claim_eligibility_cache.binding<>excluded.binding OR claim_eligibility_cache.expires_at<=excluded.checked_at
    OR (?=1 AND claim_eligibility_cache.status<>'checking')`).bind(project.id,binding,lock,now,now+30_000,Number(fresh)).run();
  if(!reservation.meta.changes)return manualEligibility('Verification is in progress. Check again shortly.');
  let result=manualEligibility('The domain declaration or chain evidence is unavailable. Submit manual evidence or try later.');
  let ttl=5*60_000;
  try{
    await reserveClaimRpc(db,'rmt-system:automatic-eligibility');
    const name='_rmt-ownership.'+host,expected='rmt-project='+project.id+';chain=4663;contract='+address;
    const ttls=await Promise.all(['https://dns.google/resolve?cd=0&edns_client_subnet=0.0.0.0%2F0','https://cloudflare-dns.com/dns-query?cd=false'].map(u=>declaration(new URL(u),name,expected)));
    if(ttls.every(t=>t>0)){
      const target=await inspectClaimModel(address);
      if(target){ttl=Math.min(hour,...ttls.map(t=>1000*t));
        const source='https://dns.google/resolve?name='+encodeURIComponent(name)+'&type=TXT';
        result={status:'eligible',reason:'Project-domain declaration and independently verified contract authority agree.',contract:{...target,source}};
      }else{ttl=hour;result=manualEligibility('This contract does not match a reviewed standalone authority model.');}
    }else{ttl=hour;result=manualEligibility('The approved project domain has no matching, DNSSEC-validated contract declaration.');}
  }catch{/* Network errors, budget exhaustion and ambiguous evidence keep manual verification available. */}
  const final=await db.prepare(`UPDATE claim_eligibility_cache SET status=?,result_json=?,expires_at=?
     WHERE project_id=? AND binding=? AND owner_token=?`).bind(result.status,JSON.stringify(result),Date.now()+ttl,project.id,binding,lock).run();
  return final.meta.changes===1?result:manualEligibility('The project listing changed during assessment.');
}
export async function projectAssessment(db:D1Database,id:string,fresh=false){
  const {projects}=await catalog(db);
  const project=projects.find(p=>p.id===id);
  if(!project)throw new InputError('This project was not found.',404);
  return {project,eligibility:await listingEligibility(db,project,projects,fresh)};
}
export async function currentEligibility(db:D1Database,id:string,fresh=false){
  return (await projectAssessment(db,id,fresh)).eligibility;
}


// All approved edits and Control Center changes increment one of these revisions.
// Check the value again in the claim transaction after external network reads.
export function listingRevisionSql(projectId:string){
  return `(COALESCE((SELECT revision FROM project_controls WHERE project_id=${projectId}),0)||':'||
    COALESCE((SELECT revision FROM project_overrides WHERE project_id=${projectId}),0)||':'||
    (SELECT COALESCE(SUM(revision),0) FROM project_controls)||':'||
    (SELECT COALESCE(SUM(revision),0) FROM project_overrides)||':'||
    (SELECT COALESCE(SUM(revision),0) FROM submissions))`;
}
export async function listingRevision(db:D1Database,projectId:string){
  const row=await db.prepare(`WITH listing(id) AS (SELECT ?) SELECT ${listingRevisionSql('listing.id')} AS version FROM listing`).bind(projectId).first<{version:string}>();
  if(!row)throw Error('Listing revision unavailable');
  return row.version;
}
