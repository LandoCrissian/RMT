import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {fileURLToPath} from 'node:url';
import {readFile,readdir} from 'node:fs/promises';
import {build} from 'esbuild';

const root=fileURLToPath(new URL('..',import.meta.url));
const built=await build({stdin:{contents:"export * from './lib/claim-eligibility';export * from './lib/server/listing-eligibility';export {getSeedProjects} from './lib/catalog';",resolveDir:root,loader:'ts'},
  absWorkingDir:root,bundle:true,write:false,platform:'node',format:'esm',plugins:[{name:'eligibility-rpc',setup(builder){
    builder.onResolve({filter:/^\.\/claim-chain$/},()=>({path:'mock-chain',namespace:'chain'}));
    builder.onLoad({filter:/.*/,namespace:'chain'},()=>({contents:'export const inspectClaimModel=address=>globalThis.__checkModel(address);'}));
  }}]});
const api=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].contents).toString('base64'));
const files=(await readdir(new URL('../drizzle/',import.meta.url))).filter(f=>/^\d.*\.sql$/.test(f)).sort();
const sql=(await Promise.all(files.map(f=>readFile(new URL('../drizzle/'+f,import.meta.url),'utf8')))).join('\n');
const audited=api.getSeedProjects().find(p=>p.id==='bored-traders');
const addr='0x'+'14'.repeat(20);
function project(){return {...audited,id:'new-project',website:'https://project-site.net/',links:[{url:'https://robinhoodchain.blockscout.com/address/'+addr}]};}
function fixture(t){
  const raw=new DatabaseSync(':memory:');raw.exec(sql);t.after(()=>raw.close());
  const prepare=(q,v=[])=>({bind:(...args)=>prepare(q,args),async first(){return raw.prepare(q).get(...v)??null;},
    async run(){return {meta:{changes:raw.prepare(q).run(...v).changes}};}});
  return {raw,prepare};
}
function resolvers(t,p){
  const state={calls:0,modelCalls:0,signed:true,model:true,conflict:false,failed:false};
  const name='_rmt-ownership.'+new URL(p.website).hostname, txt='rmt-project='+p.id+';chain=4663;contract='+addr;
  t.mock.method(globalThis,'fetch',async url=>{
    assert.ok(['dns.google','cloudflare-dns.com'].includes(url.hostname));assert.equal(url.searchParams.get('name'),name);
    state.calls++;
    if(state.failed)throw Error('No resolver');
    const data=state.conflict&&url.hostname==='dns.google'?'different claim':txt;
    return Response.json({Status:0,AD:state.signed,TC:false,CD:false,Question:[{name:name+'.',type:16}],
      Answer:[{name:name+'.',TTL:300,type:16,data:url.hostname==='dns.google'?data:JSON.stringify(data)},{name,type:46,data:'DNSSEC'}]});
  });
  globalThis.__checkModel=async address=>{state.modelCalls++;
    return state.model?{chainId:4663,address,codeHash:'0x'+'12'.repeat(32),model:'owner()'}:null;};
  return state;
}
test('all 23 listings assessed; conflicting, copied and changed reviewed evidence cannot authorize a claim',()=>{
  const results=api.getSeedProjects().map(p=>api.assessListing(p));
  assert.equal(results.length,23);assert.equal(results.filter(r=>r.status==='eligible').length,1);
  assert.equal(results.filter(r=>r.reason?.includes('proxy')).length,2);
  for(const p of [{...audited,id:'another-project'}, {...audited,website:'https://elsewhere.site/'},
    {...audited,links:audited.links.filter(l=>!l.url.includes('/whitepaper'))},
    {...audited,links:[...audited.links,...project().links]}, {...project(),website:'https://x.com/'},
    {...project(),website:'https://pages.example.org/users/somebody'}])assert.equal(api.assessListing(p).status,'manual');
});
test('a newly approved project can qualify, reuses its bounded assessment, and loses eligibility when evidence changes',async t=>{
  const db=fixture(t),p=project(),s=resolvers(t,p);
  const both=await Promise.all([api.listingEligibility(db,p,[p]),api.listingEligibility(db,p,[p])]);
  assert.ok(both.some(r=>r.status==='eligible'));assert.equal(s.calls,2);assert.equal(s.modelCalls,1);
  const cached=await api.listingEligibility(db,p,[p]);assert.equal(cached.contract.address,addr);assert.equal(s.calls,2);
  assert.equal((await api.listingEligibility(db,p,[p,{...p,id:'competing-listing'}])).status,'manual');assert.equal(s.calls,2);
  s.conflict=true;assert.equal((await api.listingEligibility(db,p,[p],true)).status,'manual');
  assert.equal(s.modelCalls,1);assert.equal(s.calls,4);
  assert.equal((await api.listingEligibility(db,p,[p])).status,'manual');assert.equal(s.calls,4);
  assert.equal(db.raw.prepare('SELECT COUNT(*) n FROM project_owners').get().n,0);
});
test('unsigned DNS, resolver failure, unsupported runtime, and exhausted quotas retain manual evidence',async t=>{
  const db=fixture(t),p=project(),s=resolvers(t,p);
  s.signed=false;assert.equal((await api.listingEligibility(db,p,[p])).status,'manual');assert.equal(s.modelCalls,0);
  db.raw.exec('DELETE FROM claim_eligibility_cache');s.signed=true;s.model=false;
  assert.equal((await api.listingEligibility(db,p,[p])).status,'manual');assert.equal(s.modelCalls,1);
  db.raw.exec('DELETE FROM claim_eligibility_cache');s.failed=true;
  assert.equal((await api.listingEligibility(db,p,[p])).status,'manual');
  const before=s.calls;
  for(let i=0;i<12;i++)db.raw.prepare('INSERT INTO claim_rpc_usage VALUES(?,?,?)').run('quota-'+i,'rmt-system:automatic-eligibility',Date.now());
  db.raw.exec('DELETE FROM claim_eligibility_cache');assert.equal((await api.listingEligibility(db,p,[p])).status,'manual');assert.equal(s.calls,before);
});
