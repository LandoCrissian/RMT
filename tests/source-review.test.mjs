import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readdir,readFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {generateKeyPair,SignJWT} from 'jose';
import {deliveries} from '../scripts/deliver-source-review.mjs';

const sources=await build({stdin:{contents:"export * from './lib/server/collector-identity';export * from './lib/server/source-review';",resolveDir:process.cwd()},bundle:true,write:false,platform:'node',format:'esm',
 plugins:[{name:'env',setup(b){b.onResolve({filter:/^cloudflare:workers$/},()=>({path:'env',namespace:'test'}));b.onLoad({filter:/.*/,namespace:'test'},()=>({contents:'export const env={};'}));}}]});
const api=await import('data:text/javascript;base64,'+Buffer.from(sources.outputFiles[0].text).toString('base64'));
test('collector accepts only its signed main workflow, scheduled or dispatched',async()=>{
 const {publicKey,privateKey}=await generateKeyPair('RS256');
 const claims={repository:'LandoCrissian/RMT',repository_id:'1469622214',repository_owner_id:'196005653',workflow_ref:'LandoCrissian/RMT/.github/workflows/source-review.yml@refs/heads/main',ref:'refs/heads/main',event_name:'schedule',run_id:'123'};
 async function verify(change={}){
  const token=await new SignJWT({...claims,sub:'repo:LandoCrissian@196005653/RMT@1469622214:ref:refs/heads/main',aud:api.collectorAudience,...change}).setIssuer('https://token.actions.githubusercontent.com').setIssuedAt().setExpirationTime('5m').setProtectedHeader({alg:'RS256'}).sign(privateKey);
  return api.requireCollector(new Request(api.collectorAudience,{headers:{authorization:'Bearer '+token}}),async()=>publicKey);
 }
 assert.equal(await verify(),'123');assert.equal(await verify({event_name:'workflow_dispatch'}),'123');
 for(const change of [{event_name:'pull_request'},{ref:'refs/heads/other'},{repository_id:'2'},{workflow_ref:'other'},{sub:'another-subject'},{aud:'other'}])await assert.rejects(verify(change),e=>e.status===401);
});
test('automatic delivery deduplicates, tracks changed evidence, and never publishes',async t=>{
 const raw=new DatabaseSync(':memory:');t.after(()=>raw.close());raw.exec('PRAGMA foreign_keys=ON');
 for(const f of (await readdir('drizzle')).filter(f=>f.endsWith('.sql')).sort())raw.exec(await readFile('drizzle/'+f,'utf8'));
 function prepare(sql,args=[]){return{bind:(...a)=>prepare(sql,a),first:()=>raw.prepare(sql).get(...args),all:()=>({results:raw.prepare(sql).all(...args)}),run:()=>({meta:{changes:raw.prepare(sql).run(...args).changes}})};}
 const db={prepare,batch:async stmts=>{raw.exec('BEGIN');try{const results=stmts.map(s=>s.run());raw.exec('COMMIT');return results;}catch(e){raw.exec('ROLLBACK');throw e;}}};
 const projectId='vamps',sourceUrl='https://vamps.wtf/',event={projectId,sourceUrl,sourceKey:'a'.repeat(64),title:'Reviewed source fixture',description:'A dated fixture',startsAt:Date.now()+86400000,endsAt:null,destination:sourceUrl,typeId:'community',access:'Free'};
 const payload={kind:'calendar',projectId,sourceUrl,event};const send=b=>api.ingestSuggestion(db,b,'123');
 assert.equal((await send(payload)).result,'queued');assert.equal((await send(payload)).result,'unchanged');
 assert.equal((await send({...payload,event:{...event,title:'Corrected time'}})).result,'queued');
 assert.deepEqual({...raw.prepare('SELECT status,published,revision FROM calendar_events').get()},{status:'pending',published:null,revision:2});
 assert.equal(raw.prepare('SELECT COUNT(*) n FROM calendar_history').get().n,2);
 await assert.rejects(send({...payload,sourceUrl:'https://example.com'}));
 const record={kind:'enrichment',projectId,sourceUrl,evidence:'Reviewed new description'};
 assert.equal((await send(record)).result,'queued');assert.equal((await send(record)).result,'unchanged');
 const [e]=await api.enrichmentQueue(db);const decision={action:'dismissed',id:e.id,expectedRevision:e.revision,reason:'Fixture decision.'};
 await api.decideEnrichment(db,decision,'reviewer');await assert.rejects(api.decideEnrichment(db,decision,'reviewer'),e=>e.status===409);
 assert.equal((await send(record)).result,'unchanged');assert.equal((await api.enrichmentQueue(db)).length,0);
 assert.equal((await send({...record,evidence:'New verified change'})).result,'queued');assert.equal((await api.enrichmentQueue(db))[0].revision,3);
});
test('review transfer includes only changed source metadata',()=>{
 const row={kind:'website',url:'https://vamps.wtf/',shortDescription:'Original'};
 assert.deepEqual(deliveries({suggestions:[]},{vamps:[row]},{vamps:[row]}),[]);
 assert.equal(deliveries({suggestions:[]},{vamps:[{...row,shortDescription:'Updated'}]},{vamps:[row]})[0].evidence,'Description · Updated');
});
