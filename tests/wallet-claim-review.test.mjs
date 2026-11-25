import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFile,readdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';

const root=fileURLToPath(new URL('../',import.meta.url));
const bundle=await build({stdin:{contents:"export * from './lib/server/claims'; export * from './lib/submission-validation';",resolveDir:root,loader:'ts'},
 absWorkingDir:root,bundle:true,format:'esm',platform:'node',write:false,plugins:[{name:'isolated-review-rpc',setup(b){
  b.onResolve({filter:/^\.\/claim-chain$/},()=>({path:'verifier',namespace:'test-verifier'}));
  b.onLoad({filter:/.*/,namespace:'test-verifier'},()=>({contents:'export const inspectClaimModel=()=>{throw Error("Unexpected model probe")};export const verifyClaimAuthority=input=>globalThis.__reviewRpc(input);'}));
 }}]});
const api=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const names=(await readdir(new URL('../drizzle/',import.meta.url))).filter(n=>/^\d.*\.sql$/.test(n)).sort();
const schema=(await Promise.all(names.map(n=>readFile(new URL('../drizzle/'+n,import.meta.url),'utf8')))).join('\n');

const address='0x'+'a'.repeat(40),contract='0x0c036d11be6b5839cfe2bfe5c4c6e3854193d959';
const evidence={source:'https://boredtrader.co/whitepaper',codeHash:'0x0771fda08e5d6dc90b951db0a736e5abcc6b5be5ae3c9c21bf363c18aa4990eb',chainId:4663,address,contract,authority:address,blockNumber:40,blockHash:'0x'+'c'.repeat(64),
 blockTimestamp:1,checkedAt:1,model:'owner()',signatureType:'erc1271'};
const approve={action:'approve',expectedRevision:2,note:'Administrator verified the canonical contract and its signing authority.'};
function fixture(t){
 const raw=new DatabaseSync(':memory:');raw.exec('PRAGMA foreign_keys=ON;');raw.exec(schema);t.after(()=>raw.close());
 function prepare(sql,values=[]){return {bind(...next){return prepare(sql,next);},async first(){return raw.prepare(sql).get(...values)??null;},
  async all(){return {results:raw.prepare(sql).all(...values)};},async run(){return {meta:{changes:Number(raw.prepare(sql).run(...values).changes)}};}};}
 let queue=Promise.resolve();
 const db={raw,prepare,batch(stmts){const r=queue.then(async()=>{raw.exec('BEGIN');try{const results=[];for(const stmt of stmts)results.push(await stmt.run());
 raw.exec('COMMIT');return results;}catch(e){raw.exec('ROLLBACK');throw e;}});queue=r.catch(()=>{});return r;}};
 const now=Date.now();
 raw.prepare(`INSERT INTO project_claims(id,project_id,project_name,user_id,account_email,method,proof_method,official_channel_url,verification_code,
 proof_url,note,status,review_note,revision,expires_at,created_at,updated_at) VALUES('claim','bored-traders','Bored Traders','applicant','a@member.test','website','wallet',
 'https://boredtrader.co','code','','','pending','',2,?,?,?)`).run(now+86400000,now,now);
 raw.prepare(`INSERT INTO wallet_claim_challenges(id,claim_id,project_id,user_id,address,contract,origin,browser_hash,message,revision,created_at,
 expires_at,consumed_at,outcome,signature) VALUES('challenge','claim','bored-traders','applicant',?,?,'https://rmt.test','hash','exact original signed statement',1,?,?,?,'verified','0xaabb')`).run(address,contract,now,now+300000,now);
 raw.prepare("INSERT INTO wallet_claim_evidence(claim_id,challenge_id,evidence_json)VALUES('claim','challenge',?)").run(JSON.stringify(evidence));
 globalThis.__reviewRpc=async input=>{assert.deepEqual(input,{projectId:'bored-traders',contract,address,message:'exact original signed statement',signature:'0xaabb'});
   return {...evidence,blockNumber:45,blockHash:'0x'+'d'.repeat(64),checkedAt:Date.now()};};
 return db;
}
test('verified wallet proof stays pending until independent administrator confirmation and a fresh authority check',async t=>{
 const db=fixture(t);
 for(const [who,role] of [['reader','moderator'],['applicant','admin'],['test',undefined]]){
   await assert.rejects(api.reviewClaim(db,who,'claim',approve,role),e=>e.status===403);
 }
 assert.equal(db.raw.prepare('SELECT COUNT(*) n FROM project_owners').get().n,0);
 const reviewed=await api.reviewClaim(db,'administrator','claim',approve,'admin');
 assert.equal(reviewed.status,'approved');assert.equal(reviewed.walletEvidence.lastRecheck.blockNumber,45);
 assert.equal(db.raw.prepare('SELECT user_id FROM project_owners').get().user_id,'applicant');
 const history=await api.claimCheckHistory(db,'claim',null);assert.equal(history.checks.length,1);
 assert.equal(history.checks[0].id,db.raw.prepare('SELECT id FROM claim_review_events').get().id);
 assert.equal(history.checks[0].result.outcome,'verified');
 await assert.rejects(api.reviewClaim(db,'administrator','claim',approve,'admin'),e=>e.status===409);
 assert.equal((await api.claimCheckHistory(db,'claim',null)).checks.length,1);
});
test('authority change and RPC uncertainty remain on record through manual referral and rejection',async t=>{
 const db=fixture(t);
 for(const [rpc,status] of [[async()=>({...evidence,authority:'0x'+'e'.repeat(40)}),409],[async()=>{throw new Error('RPC temporarily unavailable');},503]]){
  globalThis.__reviewRpc=rpc;await assert.rejects(api.reviewClaim(db,'administrator','claim',approve,'owner'),e=>e.status===status);
  const claim=(await api.claimsQueue(db))[0];assert.equal(claim.status,'pending');assert.equal(claim.walletEvidence.lastRecheck.outcome,'failed');
  assert.equal(db.raw.prepare('SELECT COUNT(*) n FROM project_owners').get().n,0);
 }
 assert.equal((await api.claimCheckHistory(db,'claim',null)).checks.length,2);
 const rejected=await api.reviewClaim(db,'administrator','claim',{...approve,action:'reject',note:'Please submit separate manual evidence.'},'admin');
 assert.equal(rejected.status,'rejected');assert.equal(rejected.walletEvidence.verification.contract,contract);
});
test('database refuses a wallet approval from a worker without the fresh verification audit',async t=>{
 const db=fixture(t);
 assert.throws(()=>db.raw.exec("UPDATE project_claims SET status='approved' WHERE id='claim'"));
 assert.equal(db.raw.prepare('SELECT status FROM project_claims').get().status,'pending');
});


test('concurrent administrator decisions cannot approve the same wallet claim twice',async t=>{
 const db=fixture(t);
 const results=await Promise.allSettled(['one','two'].map(reviewer=>api.reviewClaim(db,reviewer,'claim',approve,'admin')));
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 assert.equal(results.filter(r=>r.status==='rejected'&&r.reason.status===409).length,1);
 const recipient=db.raw.prepare('SELECT user_id,revision FROM project_owners').get();
 assert.deepEqual({...recipient},{user_id:'applicant',revision:1});
 assert.equal(db.raw.prepare('SELECT COUNT(*) n FROM claim_review_events').get().n,1);
 assert.equal(db.raw.prepare('SELECT COUNT(*) n FROM wallet_claim_checks').get().n,1);
});

test('changed runtime pin or canonical source requires fresh evidence before approval',async t=>{
 const db=fixture(t);
 let calls=0;globalThis.__reviewRpc=async()=>{calls++;return evidence;};
 for(const adjustment of [{codeHash:'0x'+'e'.repeat(64)},{source:'https://old.example/contract'}]){
  db.raw.prepare('UPDATE wallet_claim_evidence SET evidence_json=? WHERE claim_id=?').run(JSON.stringify({...evidence,...adjustment}),'claim');
  await assert.rejects(api.reviewClaim(db,'administrator','claim',approve,'admin'),e=>e.status===409&&e.message.includes('provenance changed'));
 }
 assert.equal(calls,0);assert.equal((await api.claimCheckHistory(db,'claim',null)).checks.length,2);
 assert.equal(db.raw.prepare('SELECT COUNT(*) n FROM project_owners').get().n,0);
});

test('an approved listing change during the ownership recheck leaves the claim pending',async t=>{
 const db=fixture(t);
 const original=globalThis.__reviewRpc;
 globalThis.__reviewRpc=async input=>{
   const verified=await original(input);
   db.raw.prepare("INSERT INTO project_controls(project_id,source,visibility,revision,created_at,updated_at) VALUES('bored-traders','existing','public',1,?,?)").run(Date.now(),Date.now());
   return verified;
 };
 await assert.rejects(api.reviewClaim(db,'administrator','claim',approve,'admin'),e=>e.status===409);
 assert.equal(db.raw.prepare("SELECT status FROM project_claims WHERE id='claim'").get().status,'pending');
 assert.equal(db.raw.prepare('SELECT COUNT(*) n FROM project_owners').get().n,0);
});
