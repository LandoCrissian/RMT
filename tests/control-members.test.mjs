import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFile,readdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
const root=fileURLToPath(new URL('../',import.meta.url)),env={};globalThis.__RMT_CONTROL_MEMBER_ENV__=env;
const bundle=await build({stdin:{contents:`export * from './lib/server/control-access';export * from './lib/server/control-members';export * from './lib/server/control-audit';export * from './lib/server/control-overview';export * from './lib/server/control-health';export * from './lib/server/control-exports';export * from './lib/server/control-database';export * from './lib/server/runtime';export {InputError,validateSubmission,validateDecision} from './lib/submission-validation';export {createSubmission,reviewSubmission} from './lib/server/repository';export {GET as overviewGET} from './app/api/control/overview/route';export {GET as membersGET} from './app/api/control/members/route';export {GET as memberGET,PATCH as memberPATCH} from './app/api/control/members/[id]/route';export {POST as rolePOST} from './app/api/control/roles/route';export {GET as auditGET} from './app/api/control/audit/route';export {GET as healthGET} from './app/api/control/health/route';export {GET as exportGET} from './app/api/control/exports/route';export {GET as sessionGET} from './app/api/session/route';`,resolveDir:root,loader:'ts'},absWorkingDir:root,bundle:true,write:false,platform:'node',format:'esm',target:'node24',plugins:[{name:'control-test-environment',setup(build){
 build.onResolve({filter:/^cloudflare:workers$/},()=>({path:'env',namespace:'env'}));build.onLoad({filter:/.*/,namespace:'env'},()=>({contents:'export const env=globalThis.__RMT_CONTROL_MEMBER_ENV__;'}));
 build.onResolve({filter:/^\.\/firebase-auth$/},()=>({path:'auth',namespace:'auth'}));build.onLoad({filter:/.*/,namespace:'auth'},()=>({contents:`export const sessionCookie='fixture-session';export function cookieValue(request,name){return request.headers.get('cookie')?.split(';').map(s=>s.trim()).find(s=>s.startsWith(name+'='))?.slice(name.length+1)??null;}export async function verifyFirebaseToken(token){if(token!=='verified'||!globalThis.__RMT_CONTROL_MEMBER_AUTH__)throw new Error('Invalid fixture');return globalThis.__RMT_CONTROL_MEMBER_AUTH__;}export async function checkFirebaseAccount(){}`}));
}}]});
const api=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const migrationFiles=(await readdir(new URL('../drizzle/',import.meta.url))).filter(x=>/^\d.*\.sql$/.test(x)).sort(),migrations=await Promise.all(migrationFiles.map(x=>readFile(new URL('../drizzle/'+x,import.meta.url),'utf8')));
const owner={userId:'owner',email:'PRIVATE-owner@rmt.dev',displayName:'Owner',emailVerified:true,provider:'legacy',role:'owner',roleRevision:0,capabilities:api.capabilitiesForRole('owner')};
const reject=status=>e=>e instanceof api.InputError&&e.status===status;
function database(t){
 const raw=new DatabaseSync(':memory:');raw.exec('PRAGMA foreign_keys=ON');raw.exec(migrations.join('\n'));let chain=Promise.resolve();const db={raw,beforeBatch:null};
 function prepare(sql,params=[]){return{bind(...v){return prepare(sql,v);},async first(){return raw.prepare(sql).get(...params)??null;},async all(){return {success:true,results:raw.prepare(sql).all(...params),meta:{changes:0}};},async run(){const r=raw.prepare(sql).run(...params);return{success:true,results:[],meta:{changes:Number(r.changes)}};}};}
 db.prepare=prepare;db.batch=statements=>{const result=chain.then(async()=>{if(db.beforeBatch){const hook=db.beforeBatch;db.beforeBatch=null;hook();}raw.exec('BEGIN');try{const out=[];for(const statement of statements)out.push(await statement.run());raw.exec('COMMIT');return out;}catch(e){raw.exec('ROLLBACK');throw e;}});chain=result.catch(()=>{});return result;};
 for(const key of Object.keys(env))delete env[key];Object.assign(env,{DB:db,RMT_ADMIN_USER_IDS:'owner'});globalThis.__RMT_CONTROL_MEMBER_AUTH__=null;t.after(()=>raw.close());return db;
}
function request(path,{user='owner',account=user,method='GET',body,origin='https://rmt.dev',cookie}={}){const headers={};if(user){headers['oai-authenticated-user-id']=user;headers['oai-authenticated-user-email']='PRIVATE-'+user+'@rmt.dev';}if(account)headers['x-rmt-account']=account;if(cookie)headers.cookie=cookie;if(method!=='GET'){headers['content-type']='application/json';headers.origin=origin;}return new Request('https://rmt.dev'+path,{method,headers,...(body===undefined?{}:{body:JSON.stringify(body)})});}
const ctx=id=>({params:Promise.resolve({id})});
async function member(db,id,extra={}){await api.observeMember(db,{userId:id,email:'PRIVATE-'+id+'@rmt.dev',displayName:id,emailVerified:true,provider:'legacy',...extra});return api.controlMember(db,id,'owner');}
async function grant(db,id,role='admin'){await api.setControlRole(db,owner,{userId:id,role,expectedRevision:0,reason:'Approved helper for the site.'},'owner');return {...await api.requireControl(request('/api/control/overview',{user:id}),role==='moderator'?'content':'members')};}

test('control endpoints require a verified reviewer with the exact account scope and owner-only grants',async t=>{
 const db=database(t);await member(db,'person');
 assert.equal((await api.overviewGET(request('/api/control/overview',{user:null}))).status,401);
 assert.equal((await api.overviewGET(request('/api/control/overview',{user:'person'}))).status,403);
 const wrongAccount=await api.membersGET(request('/api/control/members',{account:'person'}));assert.equal(wrongAccount.status,409);assert.equal((await wrongAccount.json()).code,'account_changed');
 assert.equal((await api.rolePOST(request('/api/control/roles',{user:'person',method:'POST',body:{userId:'person',role:'admin',expectedRevision:0,reason:'Elevate myself.'}}))).status,403);
 const admin=await grant(db,'person');assert.equal(admin.role,'admin');
 assert.equal((await api.rolePOST(request('/api/control/roles',{user:'person',method:'POST',body:{userId:'owner',role:'member',expectedRevision:0,reason:'Remove the owner.'}}))).status,403);
 assert.equal((await api.memberPATCH(request('/api/control/members/person',{method:'PATCH',origin:'https://foreign.dev',body:{action:'suspend',expectedRevision:1,reason:'Cross origin request.'}}),ctx('person'))).status,403);
 assert.equal((await api.memberPATCH(request('/api/control/members/person',{method:'PATCH',body:{action:'suspend',expectedRevision:1,reason:'Unexpected authority field.',userId:'owner'}}),ctx('person'))).status,400);
});

test('protected owner and self cannot be suspended or downgraded; unknown accounts cannot receive roles',async t=>{
 const db=database(t);await member(db,'owner');await member(db,'helper');const admin=await grant(db,'helper');
 await assert.rejects(api.setMemberStatus(db,admin,'owner',{action:'suspend',expectedRevision:1,reason:'Try to suspend protected owner.'},'owner'),reject(403));
 await assert.rejects(api.setMemberStatus(db,admin,'helper',{action:'suspend',expectedRevision:1,reason:'Try to suspend self.'},'owner'),reject(403));
 await assert.rejects(api.setControlRole(db,owner,{userId:'owner',role:'member',expectedRevision:0,reason:'Try to remove owner.'},'owner'),reject(403));
 await assert.rejects(api.setControlRole(db,owner,{userId:'unknown',role:'admin',expectedRevision:0,reason:'Invent a user by ID.'},'owner'),reject(404));
 assert.equal((await api.controlRole(db,'owner','owner')).role,'owner');
});

test('moderators can review and moderate content but cannot read member emails or site configuration',async t=>{
 const db=database(t);await member(db,'moderator');await grant(db,'moderator','moderator');
 assert.equal((await api.requireAdmin(request('/api/admin/submissions',{user:'moderator'}))).role,'moderator');
 assert.equal((await api.overviewGET(request('/api/control/overview',{user:'moderator'}))).status,200);
 assert.equal((await api.membersGET(request('/api/control/members',{user:'moderator'}))).status,403);
 assert.equal((await api.healthGET(request('/api/control/health',{user:'moderator'}))).status,403);
 assert.equal((await api.exportGET(request('/api/control/exports',{user:'moderator'}))).status,403);
 assert.deepEqual((await api.requireControl(request('/api/control/overview',{user:'moderator'}),'content')).capabilities,['overview','review','content']);
});

test('member status is reversible, audited, revision guarded, and enforced on later authenticated calls',async t=>{
 const db=database(t),before=await member(db,'builder');
 const suspended=await api.setMemberStatus(db,owner,'builder',{action:'suspend',expectedRevision:before.revision,reason:'Repeated junk project submissions.'},'owner');
 assert.equal(suspended.member.status,'suspended');assert.equal(suspended.member.revision,2);
 await assert.rejects(api.requireIdentity(request('/api/profile',{user:'builder'})),reject(403));
 const session=await api.sessionGET(request('/api/session',{user:'builder'}));assert.equal(session.status,200);assert.equal((await session.json()).suspended,true);
 await assert.rejects(api.setMemberStatus(db,owner,'builder',{action:'restore',expectedRevision:1,reason:'Stale restore request.'},'owner'),reject(409));
 await api.setMemberStatus(db,owner,'builder',{action:'restore',expectedRevision:2,reason:'Owner checked and restored access.'},'owner');
 assert.equal((await api.requireIdentity(request('/',{user:'builder'}))).userId,'builder');
 assert.equal(db.raw.prepare("SELECT COUNT(*) AS n FROM control_audit_events WHERE entity_type='member'").get().n,2);
});

test('stale roles and concurrent grants cannot grant extra access or emit orphan audit events',async t=>{
 const db=database(t);await member(db,'helper');
 const results=await Promise.allSettled(['admin','moderator'].map(role=>api.setControlRole(db,owner,{userId:'helper',role,expectedRevision:0,reason:'Choose one current helper role.'},'owner')));
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.filter(r=>r.status==='rejected').length,1);
 assert.equal(db.raw.prepare("SELECT COUNT(*) AS n FROM control_audit_events WHERE entity_type='role'").get().n,1);
 const current=await api.controlMember(db,'helper','owner');
 await api.setControlRole(db,owner,{userId:'helper',role:'member',expectedRevision:current.roleRevision,reason:'Remove delegated access.'},'owner');
 await assert.rejects(api.requireAdmin(request('/',{user:'helper'})),reject(403));
 await assert.rejects(api.setControlRole(db,owner,{userId:'helper',role:'admin',expectedRevision:0,reason:'Stale original grant.'},'owner'),reject(409));
});

test('a delegated administrator revoked during a member save cannot change the member or audit trail',async t=>{
 const db=database(t);await member(db,'helper');await member(db,'builder');const admin=await grant(db,'helper');
 const count=db.raw.prepare('SELECT COUNT(*) AS n FROM control_audit_events').get().n;
 db.beforeBatch=()=>db.raw.exec("UPDATE control_roles SET role='member',revision=revision+1 WHERE user_id='helper'");
 await assert.rejects(api.setMemberStatus(db,admin,'builder',{action:'suspend',expectedRevision:1,reason:'A permission race must fail.'},'owner'),reject(409));
 assert.equal((await api.controlMember(db,'builder','owner')).status,'active');assert.equal(db.raw.prepare('SELECT COUNT(*) AS n FROM control_audit_events').get().n,count);
});

test('delegated review database aborts the whole legacy review transaction if role access is revoked',async t=>{
 const db=database(t);await member(db,'helper');const admin=await grant(db,'helper','moderator');
 const input=api.validateSubmission({name:'Control Fixture',summary:'A local fixture project with a genuine review lifecycle for this test.',category:'Tools',stage:'building',website:'https://fixture.rmt.dev',launchUrl:'',xProfile:'',contactEmail:'',ownershipEvidence:'I can place the verification code on the official project site.',companyFax:''});
 const submission=await api.createSubmission(db,{userId:'builder',email:'private@rmt.dev',displayName:'Builder'},input),wrapped=api.controlDatabase(db,admin);
 db.beforeBatch=()=>db.raw.exec("UPDATE control_roles SET role='member',revision=revision+1 WHERE user_id='helper'");
 await assert.rejects(api.reviewSubmission(wrapped,'helper',submission.id,api.validateDecision({action:'approve',expectedRevision:1,note:'Check must happen in the transaction.',confirmedOwnership:true,checkedLinks:true})),reject(403));
 assert.equal(db.raw.prepare('SELECT status FROM submissions WHERE id=?').get(submission.id).status,'pending');assert.equal(db.raw.prepare('SELECT COUNT(*) AS n FROM review_events').get().n,0);assert.equal(db.raw.prepare('SELECT COUNT(*) AS n FROM project_owners').get().n,0);
});

test('delegated standalone writes also reject suspension and leave rows unchanged',async t=>{
 const db=database(t);await member(db,'helper');const admin=await grant(db,'helper'),wrapped=api.controlDatabase(db,admin);
 const before=db.raw.prepare("SELECT display_name FROM control_members WHERE user_id='helper'").get().display_name;
 db.beforeBatch=()=>db.raw.exec("UPDATE control_members SET status='suspended',revision=revision+1 WHERE user_id='helper'");
 await assert.rejects(wrapped.prepare("UPDATE control_members SET display_name='Changed' WHERE user_id='helper'").run(),reject(403));
 assert.equal(db.raw.prepare("SELECT display_name FROM control_members WHERE user_id='helper'").get().display_name,before);
});

test('observed sign-ins keep provider methods, canonical linked identities, and unknown historical dates honest',async t=>{
 const db=database(t);await api.observeMember(db,{userId:'legacy-builder',email:'email@rmt.dev',displayName:'Builder',emailVerified:true,provider:'legacy'},1000);
 await api.observeMember(db,{userId:'firebase:builder',email:'email@rmt.dev',displayName:'Builder',emailVerified:true,provider:'firebase',signInProvider:'google.com'},2000);
 db.raw.prepare('INSERT INTO account_links VALUES(?,?,?)').run('builder','legacy-builder',3000);
 await api.observeMember(db,{userId:'legacy-builder',email:'email@rmt.dev',displayName:'Builder',emailVerified:true,provider:'firebase',signInProvider:'google.com'},4000);
 await api.mergeLinkedObservation(db,'firebase:builder','legacy-builder');
 const page=await api.controlMembers(db,new URLSearchParams(),'owner');assert.equal(page.items.length,1);assert.equal(page.items[0].id,'legacy-builder');assert.equal(page.items[0].firstSeenAt,1000);assert.equal(page.items[0].lastSeenAt,4000);assert.deepEqual(page.items[0].providers.sort(),['chatgpt','google']);
 await api.observeMember(db,{userId:'legacy-builder',email:'email@rmt.dev',displayName:'Builder',emailVerified:true,provider:'firebase',signInProvider:'password'},6000);
 assert.deepEqual((await api.controlMember(db,'legacy-builder','owner')).providers.sort(),['chatgpt','google','password']);
 await assert.rejects(api.controlMember(db,'firebase:builder','owner'),reject(404));
});

test('member search and pages remain bounded and cursor filters cannot be swapped',async t=>{
 const db=database(t);for(const id of ['a','b','c'])await member(db,id,{displayName:'日本 builder '+id});
 const page=await api.controlMembers(db,new URLSearchParams({limit:'2',q:'日本'}),'owner');assert.equal(page.items.length,2);assert.equal(page.hasMore,true);
 const next=await api.controlMembers(db,new URLSearchParams({limit:'2',q:'日本',cursor:page.nextCursor}),'owner');assert.equal(next.items.length,1);assert.equal(next.items[0].id,'c');assert.equal(next.hasMore,false);
 await assert.rejects(api.controlMembers(db,new URLSearchParams({limit:'2',q:'different',cursor:page.nextCursor}),'owner'),reject(400));
 assert.equal((await api.membersGET(request('/api/control/members?limit=1000'))).status,400);
 assert.equal((await api.membersGET(request('/api/control/members?q=a&q=b'))).status,400);
});

test('overview counts real records and health distinguishes configuration from verified backups',async t=>{
 const db=database(t);await member(db,'builder');await member(db,'second');const result=await api.controlOverview(db,owner);assert.equal(result.metrics.members,2);assert.equal(result.metrics.observedMembers,2);assert.equal(result.metrics.listedProjects,20);assert.equal(result.metrics.confirmedBuilders,0);assert.ok(result.observedSince>0);
 const health=await api.controlHealth(db,{DB:db,RMT_ADMIN_USER_IDS:'owner',BUCKET:{}},Date.now());assert.equal(health.checks.find(c=>c.id==='database').status,'ok');assert.equal(health.checks.find(c=>c.id==='backups').status,'unknown');assert.equal(health.exports.fullBackup,false);assert.equal(JSON.stringify(health).includes('PRIVATE'),false);
});

test('audit history joins existing review records and new management actions without raw snapshots',async t=>{
 const db=database(t);await member(db,'builder');await api.setMemberStatus(db,owner,'builder',{action:'suspend',expectedRevision:1,reason:'A local test moderation decision.'},'owner');
 const history=await api.controlAudit(db,new URLSearchParams());assert.equal(history.items.length,1);assert.equal(history.items[0].action,'member.suspend');assert.equal('beforeJson'in history.items[0],false);assert.equal('afterJson'in history.items[0],false);
 assert.deepEqual((await api.controlAudit(db,new URLSearchParams({kind:'claim'}))).items,[]);
});

test('exports are authenticated, bounded, formula-safe operational pages without private evidence or credentials',async t=>{
 const db=database(t);await member(db,'builder',{displayName:'=HYPERLINK("https://bad.dev")'});await member(db,'second');
 const response=await api.controlExport(db,owner,new URLSearchParams({dataset:'members',format:'json',limit:'1'}),'owner');const body=await response.json();assert.equal(body.items.length,1);assert.equal(body.hasMore,true);assert.ok(body.nextCursor);assert.equal(response.headers.get('cache-control'),'no-store');assert.match(body.scope,/excludes authentication credentials/);assert.equal(JSON.stringify(body).includes('ownershipEvidence'),false);
 const csv=await api.controlExport(db,owner,new URLSearchParams({dataset:'members',format:'csv'}),'owner');assert.match(await csv.text(),/'=HYPERLINK/);assert.equal(csv.headers.get('x-rmt-has-more'),'false');
 for(const value of ['=A1',' +SUM(A1)','\t=1','\ufeff=1'])assert.match(api.csvCell(value),/^"'/);
 assert.equal((await api.exportGET(request('/api/control/exports?dataset=secrets'))).status,400);
 assert.equal((await api.exportGET(request('/api/control/exports?limit=501'))).status,400);
});

test('release 13 migration preserves every pre-existing row and definition while backfilling only known history',()=>{
 const raw=new DatabaseSync(':memory:');try{
 raw.exec(migrations.filter((_,index)=>Number(migrationFiles[index].slice(0,4))<=7).join('\n'));
 raw.prepare("INSERT INTO profiles(user_id,handle,display_name,created_at,updated_at) VALUES('known','known-builder','Known builder',100,200)").run();
 raw.prepare("INSERT INTO saved_projects VALUES('known','vamps',150)").run();
 raw.prepare("INSERT INTO account_links VALUES('uid','known',170)").run();
 const tables=raw.prepare("SELECT name,sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
 const indexes=raw.prepare("SELECT name,sql FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
 const rows=new Map(tables.map(table=>[table.name,raw.prepare('SELECT * FROM '+table.name).all()]));
 raw.exec(migrations[migrationFiles.findIndex(file=>Number(file.slice(0,4))===8)]);
 for(const table of tables){assert.equal(raw.prepare('SELECT sql FROM sqlite_master WHERE name=?').get(table.name).sql,table.sql);assert.deepEqual(raw.prepare('SELECT * FROM '+table.name).all(),rows.get(table.name));}
 for(const index of indexes)assert.equal(raw.prepare('SELECT sql FROM sqlite_master WHERE name=?').get(index.name).sql,index.sql);
 const historical=raw.prepare("SELECT * FROM control_members WHERE user_id='known'").get();assert.equal(historical.historical_since_at,100);assert.equal(historical.first_seen_at,null);assert.equal(historical.last_seen_at,null);assert.equal(historical.email_verified,null);assert.equal(historical.display_name,'Known builder');assert.equal(raw.prepare('SELECT COUNT(*) AS n FROM control_members').get().n,1);
 }finally{raw.close();}
});
