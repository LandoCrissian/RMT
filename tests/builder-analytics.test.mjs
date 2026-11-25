import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readdir,readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';

const root=fileURLToPath(new URL('../',import.meta.url)),environment={};
globalThis.__RMT_BUILDER_ANALYTICS_TEST__=environment;
const bundle=await build({stdin:{contents:`
  export * from './lib/server/builder-analytics';
  export {GET} from './app/api/projects/[projectId]/analytics/route';
`,resolveDir:root,loader:'ts'},absWorkingDir:root,bundle:true,write:false,platform:'node',format:'esm',target:'node24',plugins:[{
  name:'test-env',setup(b){b.onResolve({filter:/^cloudflare:workers$/},()=>({path:'env',namespace:'fake'}));
  b.onLoad({filter:/.*/,namespace:'fake'},()=>({contents:'export const env=globalThis.__RMT_BUILDER_ANALYTICS_TEST__;'}));}
}]});
const api=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const files=(await readdir(new URL('../drizzle/',import.meta.url))).filter(f=>/^\d.*\.sql$/.test(f)).sort();
const schema=(await Promise.all(files.map(f=>readFile(new URL('../drizzle/'+f,import.meta.url),'utf8')))).join('\n');
const ms=86400000,now=Date.UTC(2026,10,25,12);
function dbFor(t){
  const sql=new DatabaseSync(':memory:');sql.exec(schema);t.after(()=>sql.close());
  function prepare(query,args=[]){
    return {bind(...values){return prepare(query,values);},async first(){return sql.prepare(query).get(...args)??null;},
      async all(){return {results:sql.prepare(query).all(...args),meta:{}};},async run(){return {results:[],meta:sql.prepare(query).run(...args)};}};
  }
  const db={sql,prepare,async batch(statements){db.before?.();sql.exec('BEGIN');try{
    const out=await Promise.all(statements.map(s=>s.all()));sql.exec('COMMIT');return out;
  }catch(e){sql.exec('ROLLBACK');throw e;}}};
  environment.DB=db;environment.RMT_ADMIN_USER_IDS='admin';
  sql.prepare("INSERT INTO project_owners(project_id,user_id,status,revision,created_at,updated_at) VALUES('vamps','owner','active',1,?,?)").run(now,now);
  return db;
}
const date=timestamp=>new Date(timestamp).toISOString().slice(0,10);
const meta=(db,d)=>db.sql.prepare("INSERT INTO analytics_meta(id,start_ms,active_day,accepted) VALUES(1,?,?,0)").run(now-d*ms,date(now));
function event(db,id,visitor,day,dimension,project='vamps',kind='project_view'){
 db.sql.prepare('INSERT INTO analytics_events(id,day,project_id,kind,dimension,visitor,created_at) VALUES(?,?,?,?,?,?,?)')
   .run(id,day,project,kind,dimension,visitor,now);
}
test('verified builder reads private aggregates for exactly one managed project, with UTC comparisons and deduplicated browser estimates',async t=>{
 const db=dbFor(t);meta(db,16);
 event(db,'old','b',date(now-9*ms),'Search');
 event(db,'new1','a',date(now-ms),'X');event(db,'new2','a',date(now),'Search');
 event(db,'elsewhere','visitor-other-project',date(now),'Other referral','lammbs');
 event(db,'out','a',date(now),'example.test','vamps','outbound');
 for(const kind of ['impression','discovery_click','share','announcement'])event(db,kind,'a',date(now),'','vamps',kind);
 db.sql.prepare('INSERT INTO project_follows VALUES(?,?,?)').run('private-follower','vamps',now);
 db.sql.prepare('INSERT INTO saved_projects VALUES(?,?,?)').run('private-saver','vamps',now);
 const report=await api.readBuilderAnalytics(db,'owner','vamps','7',now);
 assert.equal(report.current.views,2);assert.equal(report.previous.views,1);assert.equal(report.unique,1);assert.equal(report.trend.length,7);
 assert.equal(report.trend.at(-1).views,1);assert.equal(report.trend.at(-2).views,1);
 assert.equal(report.followers,1);assert.equal(report.savedBy,1);assert.equal(report.current.shares,1);
 assert.equal(report.current.announcements,1);assert.equal(report.current.discoveryClicks,1);assert.equal(report.current.impressions,1);
 assert.deepEqual(report.destinations.map(row=>[row.label,row.count]),[['example.test',1]]);
 assert.deepEqual(report.sources.map(row=>[row.label,row.count]),[['Search',1],['X',1]]);
 assert.doesNotMatch(JSON.stringify(report),/private-follower|private-saver|visitor-other-project|lammbs/);
});
test('builder authorization is checked in the analytics snapshot on transfer, suspended and hidden projects',async t=>{
 const db=dbFor(t);
 await assert.rejects(api.readBuilderAnalytics(db,'visitor','vamps','30',now),e=>e.status===404);
 await assert.rejects(api.readBuilderAnalytics(db,'admin','vamps','30',now),e=>e.status===404);
 db.before=()=>db.sql.exec("UPDATE project_owners SET status='revoked',revision=revision+1");
 await assert.rejects(api.readBuilderAnalytics(db,'owner','vamps','30',now),e=>e.status===404);
 db.before=null;db.sql.exec("UPDATE project_owners SET status='active',revision=3");
 db.sql.exec("INSERT INTO control_members(user_id,email,display_name,status,revision,created_at,updated_at) VALUES('owner','','','suspended',1,1,1)");
 await assert.rejects(api.readBuilderAnalytics(db,'owner','vamps','30',now),e=>e.status===404);
 db.sql.exec("UPDATE control_members SET status='active'; INSERT INTO project_controls(project_id,source,visibility,revision,created_at,updated_at) VALUES('vamps','existing','hidden',1,1,1)");
 await assert.rejects(api.readBuilderAnalytics(db,'owner','vamps','30',now),e=>e.status===404);
});
test('empty data, retention and earlier legacy measurements are explicit',async t=>{
 const db=dbFor(t);
 db.sql.prepare("INSERT INTO control_metric_events VALUES(? ,?,'project_view','vamps',?)").run('legacy',date(now-ms),now-ms);
 const empty=await api.readBuilderAnalytics(db,'owner','vamps','all',now);
 assert.equal(empty.current.views,0);assert.equal(empty.legacy.views,1);assert.equal(empty.start,null);
 assert.equal(empty.unique,null);assert.equal(empty.previous,null);assert.deepEqual(empty.trend,[]);
 meta(db,400);const all=await api.readBuilderAnalytics(db,'owner','vamps','all',now);
 assert.equal(all.truncated,true);assert.equal(all.unique,null);assert.equal(all.trend.length,365);
 const recent=await api.readBuilderAnalytics(db,'owner','vamps','90',now);assert.equal(recent.unique,0);
});
test('analytics route requires authentication, exact account and a supported period',async t=>{
 dbFor(t);
 const url='https://rmt.dev/api/projects/vamps/analytics';
 const call=(q,headers={})=>api.GET(new Request(url+q,{headers}),{params:Promise.resolve({projectId:'vamps'})});
 assert.equal((await call('')).status,401);
 const identity={'oai-authenticated-user-id':'owner','oai-authenticated-user-email':'owner@example.test'};
 assert.equal((await call('',identity)).status,409);
 const headers={...identity,'x-rmt-account':'owner'};
 assert.equal((await call('?period=all&period=7',headers)).status,400);
 assert.equal((await call('?period=6',headers)).status,400);
 assert.equal((await call('?userId=owner',headers)).status,400);
 const ok=await call('?period=30',headers);assert.equal(ok.status,200);assert.match(ok.headers.get('cache-control'),/no-store/);
});

test('builder analytics reports current category names once while preserving recorded traffic totals',async t=>{
 const db=dbFor(t);meta(db,3);
 db.sql.prepare("INSERT INTO analytics_daily(day,project_id,kind,dimension,total) VALUES(?,'vamps','project_view','direct',7)").run(date(now));
 db.sql.exec("INSERT INTO taxonomy_categories(id,name,position) VALUES('culture','Culture',30); INSERT INTO project_categories VALUES('vamps','culture',0)");
 const report=await api.readBuilderAnalytics(db,'owner','vamps','7',now);
 assert.ok(report.categories.includes('Culture'));assert.equal(report.current.views,7);
 db.sql.exec("UPDATE taxonomy_categories SET name='Local culture' WHERE id='culture'");
 const renamed=await api.readBuilderAnalytics(db,'owner','vamps','7',now);
 assert.ok(renamed.categories.includes('Local culture'));assert.equal(renamed.current.views,7);
});
