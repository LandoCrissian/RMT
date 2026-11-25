import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFile,readdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';

const root=fileURLToPath(new URL('../',import.meta.url));
const environment={};globalThis.__RMT_SETTINGS_ENV__=environment;
const bundle=await build({stdin:{contents:`
 export * from './lib/server/engagement';export * from './lib/engagement';
 export {POST} from './app/api/engagement/route';export {POST as legacy} from './app/api/metrics/route';
`,resolveDir:root,loader:'ts'},absWorkingDir:root,bundle:true,write:false,platform:'node',format:'esm',target:'node24',plugins:[{name:'settings-runtime',setup(builder){
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
const epoch=Date.parse('2026-11-25T00:00:00Z'),day=86_400_000;
const signal=(kind,projectId='',dimension='')=>({kind,projectId,dimension});
const batch=(events,browser=crypto.randomUUID(),session=crypto.randomUUID())=>({session,browser,events});
function total(db,kind){return db.raw.prepare('SELECT SUM(total) n FROM analytics_daily WHERE kind=?').get(kind).n??0;}
test('concurrent delivery deduplicates, requires a click impression, and groups only approved destination hosts',async t=>{
 const db=database(t),b=batch([signal('outbound','vamps','arbitrary-private-host.example'),signal('outbound','vamps','vamps.wtf'),
  signal('discovery_click','vamps'),signal('project_view','unknown','Search'),signal('share','vamps','x'),
  signal('announcement','vamps','missing-post')]);
 await Promise.all([api.recordEngagement(db,b,epoch),api.recordEngagement(db,b,epoch)]);
 assert.equal(total(db,'discovery_click'),1);assert.equal(total(db,'impression'),1);assert.equal(total(db,'outbound'),2);
 assert.equal(total(db,'project_view'),0);assert.equal(total(db,'announcement'),0);assert.equal(total(db,'share'),1);
 assert.deepEqual(db.raw.prepare("SELECT dimension FROM analytics_daily WHERE kind='outbound' ORDER BY dimension").all().map(r=>r.dimension),['Other destination','vamps.wtf']);
 const rows=JSON.stringify(db.raw.prepare('SELECT * FROM analytics_events').all());
 for(const s of [b.browser,b.session,'arbitrary-private-host'])assert.equal(rows.includes(s),false);
 await assert.rejects(api.recordEngagement(db,batch([signal('share','vamps','x.com/private')]),epoch));
 await assert.rejects(api.recordEngagement(db,batch([signal('project_view','vamps','Sensitive topic')]),epoch));
});
test('returning and unique estimates are browser-scoped and different projects have distinct pseudonyms',async t=>{
 const db=database(t),browser=crypto.randomUUID();
 const events=[signal('visit','','Direct or unknown'),signal('project_view','vamps','X'),signal('project_view','lammbs','Other social')];
 await api.recordEngagement(db,batch(events,browser),epoch);
 await api.recordEngagement(db,batch(events,browser),epoch+day);
 assert.equal(total(db,'returning'),1);assert.equal(total(db,'visit'),2);
 assert.equal(db.raw.prepare("SELECT COUNT(DISTINCT visitor) n FROM analytics_events WHERE kind='project_view'").get().n,2);
 await api.recordEngagement(db,batch(events,browser),epoch+95*day);
 assert.equal(db.raw.prepare("SELECT COUNT(*) n FROM analytics_events WHERE day='2026-11-25'").get().n,0);
 assert.equal(total(db,'visit'),3);assert.equal(total(db,'returning'),1);
 await api.recordEngagement(db,batch(events,browser),epoch+366*day);assert.equal(total(db,'visit'),2);
});
test('authoritative follow/save changes count committed edges and preserve user privacy',t=>{
 const db=database(t);
 for(const [table,timestamp,added,removed] of [['saved_projects','created_at','save','unsave'],['project_follows','followed_at','follow','unfollow']]){
   const insert=db.raw.prepare('INSERT INTO '+table+'(user_id,project_id,'+timestamp+') VALUES(?,?,?) ON CONFLICT DO NOTHING');
   insert.run('sensitive-member','vamps',epoch);insert.run('sensitive-member','vamps',epoch);assert.equal(total(db,added),1);
   db.raw.prepare('DELETE FROM '+table+' WHERE project_id=?').run('vamps');assert.equal(total(db,removed),1);
 }
 assert.equal(JSON.stringify(db.raw.prepare('SELECT * FROM analytics_daily').all()).includes('sensitive-member'),false);
});
test('public quota is atomic, including legacy clients; skips bots, privacy opt-out and cross-origin requests',async t=>{
 const db=database(t),now=Date.now(),today=new Date(now).toISOString().slice(0,10);
 db.raw.prepare('INSERT INTO analytics_meta VALUES(1,?,?,?)').run(now,today,api.DAILY_EVENT_LIMIT-1);
 const post=(fn,payload,headers={})=>fn(new Request('https://rmt.dev/api/engagement',{method:'POST',headers:{'content-type':'application/json',origin:'https://rmt.dev',...headers},body:JSON.stringify(payload)}));
 const b=batch([signal('visit','','Search')]);
 for(const h of [{dnt:'1'},{'sec-gpc':'1'},{'user-agent':'Twitterbot/1.0'}])assert.equal((await post(api.POST,b,h)).status,200);
 assert.equal((await post(api.POST,b,{origin:'https://elsewhere.example'})).status,403);
 assert.equal(total(db,'visit'),0);await Promise.all([post(api.POST,b),post(api.legacy,{kind:'visit',sessionId:crypto.randomUUID()})]);
 assert.equal(total(db,'visit'),1);assert.equal(db.raw.prepare('SELECT accepted FROM analytics_meta').get().accepted,api.DAILY_EVENT_LIMIT);
 assert.equal(db.raw.prepare('SELECT COUNT(*) n FROM control_metric_events').get().n,0);
 assert.equal(api.referralBucket('https://x.com.evil.example/a','https://rmt.dev'),'Other referral');
 assert.equal(api.referralBucket('https://t.co/x','https://rmt.dev'),'X');
});
