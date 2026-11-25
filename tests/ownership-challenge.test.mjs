import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFile,readdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';

const root=fileURLToPath(new URL('../',import.meta.url));
const environment={};globalThis.__RMT_SETTINGS_ENV__=environment;
const bundle=await build({stdin:{contents:`
 export {POST} from './app/api/claims/wallet/route';
 export {reserveClaimRpc} from './lib/server/claim-budget';
`,resolveDir:root,loader:'ts'},absWorkingDir:root,bundle:true,write:false,platform:'node',format:'esm',target:'node24',plugins:[{name:'settings-runtime',setup(builder){
 builder.onResolve({filter:/claim-chain$/},()=>({path:'chain',namespace:'fixture-chain'}));
 builder.onLoad({filter:/.*/,namespace:'fixture-chain'},()=>({contents:'export const inspectClaimModel=()=>{throw Error("Unexpected model probe")};export const verifyClaimAuthority=(request)=>globalThis.__RMT_CHAIN_CHECK__(request);'}));
 builder.onResolve({filter:/^cloudflare:workers$/},()=>({path:'fixture-runtime',namespace:'fixture-runtime'}));
 builder.onLoad({filter:/.*/,namespace:'fixture-runtime'},()=>({contents:'export const env=globalThis.__RMT_SETTINGS_ENV__;'}));
}}]});
const api=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const files=(await readdir(new URL('../drizzle/',import.meta.url))).filter(file=>/^\d.*\.sql$/.test(file)).sort();
const schema=(await Promise.all(files.map(file=>readFile(new URL('../drizzle/'+file,import.meta.url),'utf8')))).join('\n');
function database(t){
 const raw=new DatabaseSync(':memory:');raw.exec('PRAGMA foreign_keys=ON;');raw.exec(schema);t.after(()=>raw.close());let chain=Promise.resolve();const db={raw,beforeBatch:null};
 function prepare(sql,values=[]){return {bind(...args){return prepare(sql,args);},async first(){return raw.prepare(sql).get(...values)??null;},async all(){return {success:true,results:raw.prepare(sql).all(...values),meta:{changes:0}};},async run(){return {success:true,results:[],meta:{changes:Number(raw.prepare(sql).run(...values).changes)}};}};}
 db.prepare=prepare;db.batch=statements=>{const result=chain.then(async()=>{if(db.beforeBatch){const fn=db.beforeBatch;db.beforeBatch=null;fn();}raw.exec('BEGIN');try{const results=[];for(const statement of statements)results.push(await statement.run());raw.exec('COMMIT');return results;}catch(error){raw.exec('ROLLBACK');throw error;}});chain=result.catch(()=>{});return result;};
 Object.assign(environment,{DB:db,RMT_ADMIN_USER_IDS:'owner'});return db;
}
const origin='https://rmt.example', member='member-test', address='0x'+'21'.repeat(20);
function post(body,options={}){
 const headers={'content-type':'application/json',origin,'oai-authenticated-user-id':member,'oai-authenticated-user-email':'member@example.test','x-rmt-account':member,...options.headers};
 if(options.cookie)headers.cookie=options.cookie;
 return api.POST(new Request(origin+'/api/claims/wallet',{method:'POST',headers,body:JSON.stringify(body)}));
}
async function begin(){
 const response=await post({action:'challenge',projectId:'bored-traders',address});
 const body=await response.json();assert.equal(response.status,200,JSON.stringify(body));
 const header=response.headers.get('set-cookie');assert.match(header,/HttpOnly; Secure; SameSite=Strict/);
 return {body,cookie:header.split(';')[0]};
}
const proof=id=>({action:'verify',challengeId:id,signature:'0x'+'11'.repeat(65)});
test('a verified wallet submits one pending claim under concurrent delivery; only the bound browser can submit',async t=>{
 const db=database(t);let calls=0;
 globalThis.__RMT_CHAIN_CHECK__=async q=>{calls++;return {contract:q.contract,address:q.address,chainId:4663,blockHash:'0x'+'11'.repeat(32),blockNumber:100,checkedAt:Date.now()};};
 const {body,cookie}=await begin();
 for(const v of [origin,'bored-traders',body.contract,'4663',body.claimId,address])assert.ok(body.message.includes(v));
 assert.equal((await post(proof(body.challengeId))).status,409);
 assert.equal((await post(proof(body.challengeId),{cookie:'__Host-rmt-claim-browser='+'a'.repeat(64)})).status,404);
 assert.equal((await post(proof(body.challengeId),{cookie,headers:{'x-rmt-account':'somebody-else'}})).status,409);
 assert.equal((await post(proof(body.challengeId),{cookie,headers:{origin:'https://elsewhere.example'}})).status,403);
 const responses=await Promise.all([post(proof(body.challengeId),{cookie}),post(proof(body.challengeId),{cookie})]);
 assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);assert.equal(calls,1);
 assert.equal(db.raw.prepare('SELECT proof_method FROM project_claims').get().proof_method,'wallet');
 assert.equal(db.raw.prepare('SELECT status FROM project_claims').get().status,'pending');
 assert.equal(db.raw.prepare('SELECT count(*) n FROM wallet_claim_evidence').get().n,1);
 assert.equal(db.raw.prepare('SELECT count(*) n FROM project_owners').get().n,0);
 assert.throws(()=>db.raw.exec("UPDATE project_claims SET status='approved',revision=revision+1"),/administrator authority review/);
});
test('expired, changed and unavailable authority verification never advance a draft',async t=>{
 const db=database(t);let calls=0;globalThis.__RMT_CHAIN_CHECK__=async()=>{calls++;throw Error('unavailable');};
 const one=await begin();db.raw.prepare('UPDATE wallet_claim_challenges SET expires_at=0 WHERE id=?').run(one.body.challengeId);
 assert.equal((await post(proof(one.body.challengeId),one)).status,409);
 const two=await begin();db.raw.prepare('UPDATE wallet_claim_challenges SET contract=? WHERE id=?').run(address,two.body.challengeId);
 assert.equal((await post(proof(two.body.challengeId),two)).status,409);assert.equal(calls,0);
 const three=await begin();assert.equal((await post(proof(three.body.challengeId),three)).status,503);
 assert.equal((await post(proof(three.body.challengeId),three)).status,409);assert.equal(calls,1);
 assert.equal(db.raw.prepare('SELECT count(*) n FROM wallet_claim_evidence').get().n,0);
 assert.equal(db.raw.prepare('SELECT status FROM project_claims').get().status,'draft');
 assert.equal((await post({action:'challenge',projectId:'unknown',address})).status,422);
});
test('RPC ceilings are enforced across sessions and concurrent reservations',async t=>{
 const db=database(t);
 const first=await Promise.allSettled(Array.from({length:20},()=>api.reserveClaimRpc(db,'one')));
 assert.equal(first.filter(x=>x.status==='fulfilled').length,12);
 for(let i=0;i<108;i++)await api.reserveClaimRpc(db,'user-'+i);
 await assert.rejects(api.reserveClaimRpc(db,'later'),e=>e.status===429);
 assert.equal(db.raw.prepare('SELECT count(*) n FROM claim_rpc_usage').get().n,120);
});
