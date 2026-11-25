import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFile,readdir,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';

const root=fileURLToPath(new URL('../',import.meta.url));
const environment={};
globalThis.__RMT_UPDATES_TEST_ENV__=environment;
const bundle=await build({stdin:{contents:`
 export * from './lib/project-updates'; export * from './lib/server/project-updates';
 export {InputError,validateSubmission,validateDecision} from './lib/submission-validation';
 export {createSubmission,reviewSubmission} from './lib/server/repository';
 export * from './lib/server/review-monitor';
 export {GET as ownGET,POST as createPOST} from './app/api/project-updates/route';
 export {PATCH as changePATCH} from './app/api/project-updates/[id]/route';
 export {GET as publicGET} from './app/api/projects/[projectId]/updates/route';
 export {GET as queueGET} from './app/api/admin/project-updates/route';
 export {POST as reviewPOST} from './app/api/admin/project-updates/[id]/route';
`,resolveDir:root,loader:'ts'},absWorkingDir:root,bundle:true,write:false,platform:'node',format:'esm',target:'node24',plugins:[{name:'updates-test-runtime',setup(build){build.onResolve({filter:/^cloudflare:workers$/},()=>({path:'test-runtime',namespace:'test-runtime'}));build.onLoad({filter:/.*/,namespace:'test-runtime'},()=>({contents:'export const env=globalThis.__RMT_UPDATES_TEST_ENV__;'}));}}]});
const api=await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const migrations=(await readdir(new URL('../drizzle/',import.meta.url))).filter(f=>/^\d.*\.sql$/.test(f)).sort();
const schema=(await Promise.all(migrations.map(f=>readFile(new URL(`../drizzle/${f}`,import.meta.url),'utf8')))).join('\n');
const owner={userId:'builder',email:'builder@rmt.dev',displayName:'Builder'};
function database(t,filename=':memory:',initialize=true){
 const raw=new DatabaseSync(filename);raw.exec('PRAGMA foreign_keys=ON;');if(initialize)raw.exec(schema);
 let chain=Promise.resolve(),closed=false;
 const db={raw,beforeBatch:null,beforeRun:null,close(){if(!closed){raw.close();closed=true;}}};
 function prepare(sql,values=[]){return{bind(...args){return prepare(sql,args);},async first(){return raw.prepare(sql).get(...values)??null;},async all(){return{success:true,results:raw.prepare(sql).all(...values),meta:{changes:0}};},async run(){if(db.beforeRun){const hook=db.beforeRun;db.beforeRun=null;hook();}const result=raw.prepare(sql).run(...values);return{success:true,results:[],meta:{changes:Number(result.changes)}};}};}
 db.prepare=prepare;db.batch=statements=>{const result=chain.then(async()=>{if(db.beforeBatch){const hook=db.beforeBatch;db.beforeBatch=null;hook();}raw.exec('BEGIN');try{const values=[];for(const s of statements)values.push(await s.run());raw.exec('COMMIT');return values;}catch(e){raw.exec('ROLLBACK');throw e;}});chain=result.catch(()=>{});return result;};
 t.after(()=>db.close());for(const key of Object.keys(environment))delete environment[key];Object.assign(environment,{DB:db,RMT_ADMIN_USER_IDS:'reviewer',RMT_PUBLIC_URL:'https://rmt.dev/'});return db;
}
function seedOwner(db,projectId='vamps',userId=owner.userId,revision=1){const now=Date.now();db.raw.prepare("INSERT INTO project_owners(project_id,user_id,status,revision,created_at,updated_at) VALUES(?,?,'active',?,?,?)").run(projectId,userId,revision,now,now);}
function fields(projectId='vamps',changes={}){return{projectId,kind:'progress',title:'A fresh development update',body:'We have finished the next part of our independent project.',linkLabel:'Explore the project',linkUrl:'https://vamps.wtf/',...changes};}
const reject=status=>error=>error instanceof api.InputError&&error.status===status;
async function draft(db,projectId='vamps',changes={}){return api.createProjectUpdate(db,owner,api.validateCreateUpdate(fields(projectId,changes)));}
async function action(db,row,action,extra={}){return api.changeProjectUpdate(db,owner,row.id,api.validateChangeUpdate({action,expectedRevision:row.revision,...extra}));}
async function decision(db,row,action='approve'){return api.reviewProjectUpdate(db,'reviewer',row.id,api.validateReviewUpdate({action,expectedRevision:row.revision,note:action==='approve'?'':'Needs a clearer project description.'}));}
const page={limit:6,cursor:null};
function request(path,{method='GET',user='builder',account=user,body,origin='https://rmt.dev',extraHeaders={}}={}){const headers={...extraHeaders};if(user){headers['oai-authenticated-user-id']=user;headers['oai-authenticated-user-email']=`${user}@rmt.dev`;}if(account)headers['x-rmt-account']=account;if(method!=='GET'){headers['content-type']='application/json';if(origin)headers.origin=origin;}return new Request(`https://rmt.dev${path}`,{method,headers,...(body!==undefined?{body:JSON.stringify(body)}:{})});}
const context=id=>({params:Promise.resolve({id})});

test('draft validation preserves plain text, allows unfinished text and rejects authority fields or unsafe links',()=>{
 const empty=api.validateCreateUpdate(fields('vamps',{title:'',body:'',linkLabel:'',linkUrl:''}));assert.equal(empty.title,'');assert.equal(empty.body,'');
 assert.equal(api.validateCreateUpdate(fields('vamps',{body:'<script>alert(1)</script> is literal update text.'})).body,'<script>alert(1)</script> is literal update text.');
 for(const value of [{status:'approved'},{userId:'reviewer'},{publishedAt:Date.now()},{ownershipRevision:1},{reviewNote:'ok'},{isAdmin:true}])assert.throws(()=>api.validateCreateUpdate({...fields(),...value}),reject(400));
 for(const linkUrl of ['javascript:alert(1)','http://vamps.wtf','https://127.1/','https://user:pass@vamps.wtf','https://private.local/'])assert.throws(()=>api.validateCreateUpdate(fields('vamps',{linkUrl})),reject(400));
 assert.throws(()=>api.validateCreateUpdate(fields('vamps',{linkLabel:'',linkUrl:'https://vamps.wtf'})),reject(400));
 assert.throws(()=>api.validateCreateUpdate(fields('vamps',{title:'Line one\nLine two'})),reject(400));
 assert.throws(()=>api.validateCreateUpdate(fields('vamps',{body:'x'.repeat(2401)})),reject(400));
 assert.throws(()=>api.validateChangeUpdate({action:'submit',expectedRevision:1,title:'New title'}),reject(400));
 assert.throws(()=>api.validateReviewUpdate({action:'reject',expectedRevision:1,note:''}),reject(400));
});

test('private drafts persist after reopening and never enter public output, reviewer queue or notifications',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'rmt-updates-'));const file=join(dir,'data.sqlite');let db=database(t,file);seedOwner(db);
 const saved=await draft(db,'vamps',{title:'',body:'',linkLabel:'',linkUrl:''});assert.equal(saved.status,'draft');assert.equal(saved.canManage,true);assert.equal(db.raw.prepare('SELECT COUNT(*) AS n FROM notification_outbox').get().n,0);
 db.close();db=database(t,file,false);t.after(()=>rm(dir,{recursive:true,force:true}));const own=await api.ownProjectUpdates(db,owner.userId,page);assert.equal(own.updates[0].id,saved.id);
 assert.equal((await api.publicProjectUpdates(db,'vamps',page)).updates.length,0);assert.equal((await api.projectUpdatesQueue(db,page)).updates.length,0);
 await assert.rejects(action(db,own.updates[0],'submit'),reject(400));assert.equal(db.raw.prepare('SELECT COUNT(*) AS n FROM project_update_events').get().n,0);
});

test('only current confirmed owners can create; claimed status and client-supplied user cannot grant access',async t=>{
 const db=database(t);await assert.rejects(draft(db),reject(404));seedOwner(db,'vamps','different-builder');await assert.rejects(draft(db),reject(404));
 seedOwner(db,'suited-apes');await assert.rejects(draft(db,'not-a-real-project'),reject(404));
 db.beforeRun=()=>db.raw.exec("UPDATE project_owners SET revision=2,status='revoked' WHERE project_id='suited-apes'");await assert.rejects(draft(db,'suited-apes'),reject(409));assert.equal(db.raw.prepare('SELECT COUNT(*) AS n FROM project_updates').get().n,0);
});

test('review lifecycle stores private feedback, publishes explicit fields and keeps approved content immutable',async t=>{
 const db=database(t);seedOwner(db);const first=await draft(db);const pending=await action(db,first,'submit');assert.equal(pending.status,'pending');assert.equal(pending.revision,2);
 assert.equal((await api.publicProjectUpdates(db,'vamps',page)).updates.length,0);const rejected=await decision(db,pending,'reject');assert.match(rejected.reviewNote,/clearer/);
 const revised=await action(db,rejected,'save',{kind:'announcement',title:'The next part is ready',body:'The project has a working experience for people to explore.',linkLabel:'',linkUrl:''});assert.equal(revised.status,'draft');
 const approved=await decision(db,await action(db,revised,'submit'));assert.equal(approved.status,'approved');assert.ok(approved.publishedAt>0);
 const published=(await api.publicProjectUpdates(db,'vamps',page)).updates[0];assert.deepEqual(Object.keys(published).sort(),['id','projectId','projectName','kind','title','body','linkLabel','linkUrl','publishedAt'].sort());
 for(const key of ['userId','reviewNote','canManage','ownershipRevision','status','revision','createdAt','updatedAt'])assert.equal(key in published,false,key);
 await assert.rejects(action(db,approved,'save',{kind:'progress',title:'Change public title',body:'Changes cannot bypass another review of an approved update.',linkLabel:'',linkUrl:''}),reject(409));
 const archived=await action(db,approved,'archive');assert.equal(archived.status,'archived');assert.equal((await api.publicProjectUpdates(db,'vamps',page)).updates.length,0);
});

test('withdrawal returns pending content to private draft and leaves stale review decisions with no audit effects',async t=>{
 const db=database(t);seedOwner(db);const pending=await action(db,await draft(db),'submit');const oldKey=`update:${pending.id}:revision:${pending.revision}:pending`;
 assert.equal((await api.reviewDigest(db,'reviewer',environment)).newPendingCount,1);
 const withdrawn=await action(db,pending,'withdraw');assert.equal(withdrawn.status,'draft');const events=db.raw.prepare('SELECT COUNT(*) AS n FROM project_update_events').get().n;
 await assert.rejects(decision(db,pending),reject(409));assert.equal(db.raw.prepare('SELECT COUNT(*) AS n FROM project_update_events').get().n,events);
 assert.equal((await api.projectUpdatesQueue(db,page)).updates.length,0);assert.equal((await api.reviewDigest(db,'reviewer',environment)).pendingCount,0);
 assert.equal((await api.acknowledgeReviewAlerts(db,'reviewer',{eventKeys:[oldKey]})).acknowledgedCount,0);
 const resubmitted=await action(db,withdrawn,'submit');const digest=await api.reviewDigest(db,'reviewer',environment);assert.equal(digest.items[0].eventKey,`update:${resubmitted.id}:revision:${resubmitted.revision}:pending`);
});

test('concurrent duplicate submissions produce exactly one pending post, event and notification',async t=>{
 const db=database(t);seedOwner(db);const a=await draft(db),b=await draft(db);const result=await Promise.allSettled([action(db,a,'submit'),action(db,b,'submit')]);
 assert.equal(result.filter(r=>r.status==='fulfilled').length,1);assert.equal(result.find(r=>r.status==='rejected').reason.status,409);
 assert.equal(db.raw.prepare("SELECT COUNT(*) AS n FROM project_updates WHERE status='pending'").get().n,1);
 assert.equal(db.raw.prepare("SELECT COUNT(*) AS n FROM project_update_events WHERE action='submit'").get().n,1);assert.equal(db.raw.prepare('SELECT COUNT(*) AS n FROM notification_outbox').get().n,1);
});

test('stale saves and concurrent reviewer decisions cannot overwrite content or duplicate audit events',async t=>{
 const db=database(t);seedOwner(db);const d=await draft(db);const saved=await action(db,d,'save',{kind:'progress',title:'A changed draft title',body:'The draft has a meaningful change that should survive retries.',linkLabel:'',linkUrl:''});
 await assert.rejects(action(db,d,'archive'),reject(409));assert.equal((await api.ownProjectUpdates(db,owner.userId,page)).updates[0].title,saved.title);
 const pending=await action(db,saved,'submit');const outcomes=await Promise.allSettled([decision(db,pending),decision(db,pending)]);assert.equal(outcomes.filter(r=>r.status==='fulfilled').length,1);
 assert.equal(db.raw.prepare("SELECT COUNT(*) AS n FROM project_update_events WHERE action='approve'").get().n,1);
});

test('revocation or ownership replacement immediately hides published posts and blocks stale writes or approval',async t=>{
 const db=database(t);seedOwner(db);const published=await decision(db,await action(db,await draft(db),'submit'));const pending=await action(db,await draft(db),'submit');
 const count=db.raw.prepare('SELECT COUNT(*) AS n FROM project_update_events').get().n;
 db.beforeBatch=()=>db.raw.exec("UPDATE project_owners SET revision=2,status='revoked' WHERE project_id='vamps'");
 await assert.rejects(decision(db,pending),reject(409));assert.equal(db.raw.prepare('SELECT COUNT(*) AS n FROM project_update_events').get().n,count);
 assert.equal((await api.publicProjectUpdates(db,'vamps',page)).updates.length,0);await assert.rejects(action(db,published,'archive'),reject(409));
 db.raw.exec("UPDATE project_owners SET status='active',revision=3,user_id='new-builder' WHERE project_id='vamps'");assert.equal((await api.publicProjectUpdates(db,'vamps',page)).updates.length,0);assert.equal((await api.ownProjectUpdates(db,owner.userId,page)).updates.every(r=>!r.canManage),true);
 const rejected=await decision(db,pending,'reject');assert.equal(rejected.status,'rejected');
 const archived=await decision(db,published,'archive');assert.equal(archived.status,'archived');
});

test('submitted community projects need approval before updates and suspension removes their public posts',async t=>{
 const db=database(t);const input=api.validateSubmission({name:'Future House',summary:'A genuinely useful independent app being built for its community.',category:'Tools',stage:'beta',website:'https://future.rmt.dev',launchUrl:'',xProfile:'',contactEmail:'',ownershipEvidence:'I can place the verification code on the official website.',companyFax:''});
 const submission=await api.createSubmission(db,owner,input);const projectId=`community-${submission.id}`;await assert.rejects(draft(db,projectId),reject(404));
 await api.reviewSubmission(db,'reviewer',submission.id,api.validateDecision({action:'approve',expectedRevision:submission.revision,note:'Confirmed project ownership and official links.',confirmedOwnership:true,checkedLinks:true}));
 const approved=await decision(db,await action(db,await draft(db,projectId),'submit'));assert.equal((await api.publicProjectUpdates(db,projectId,page)).updates[0].id,approved.id);
 const pending=await action(db,await draft(db,projectId),'submit');db.beforeBatch=()=>db.raw.prepare("UPDATE submissions SET status='suspended' WHERE id=?").run(submission.id);await assert.rejects(decision(db,pending),reject(409));await assert.rejects(api.publicProjectUpdates(db,projectId,page),reject(404));
});

test('submission quota counts actual transitions and over-limit attempts leave no event or outbox residue',async t=>{
 const db=database(t);seedOwner(db);let current=await draft(db);for(let n=0;n<api.UPDATE_SUBMISSIONS_PER_DAY;n++){current=await action(db,current,'submit');current=await action(db,current,'withdraw');}
 const events=db.raw.prepare('SELECT COUNT(*) AS n FROM project_update_events').get().n,outbox=db.raw.prepare('SELECT COUNT(*) AS n FROM notification_outbox').get().n;
 await assert.rejects(action(db,current,'submit'),reject(429));assert.equal(db.raw.prepare('SELECT COUNT(*) AS n FROM project_update_events').get().n,events);assert.equal(db.raw.prepare('SELECT COUNT(*) AS n FROM notification_outbox').get().n,outbox);assert.equal((await api.ownProjectUpdates(db,owner.userId,page)).updates[0].status,'draft');
});

test('new draft quota is atomic and unused drafts can be archived without publishing',async t=>{
 const db=database(t);seedOwner(db);const results=await Promise.allSettled(Array.from({length:api.UPDATE_DRAFTS_PER_DAY+1},()=>draft(db)));
 assert.equal(results.filter(r=>r.status==='fulfilled').length,api.UPDATE_DRAFTS_PER_DAY);assert.equal(results.find(r=>r.status==='rejected').reason.status,429);
 const first=results.find(r=>r.status==='fulfilled').value;assert.equal((await action(db,first,'archive')).status,'archived');assert.equal((await api.projectUpdatesQueue(db,page)).updates.length,0);assert.equal((await api.publicProjectUpdates(db,'vamps',page)).updates.length,0);
});

test('public keyset pages are bounded and deterministic across identical publication times',async t=>{
 const db=database(t);seedOwner(db);const first=await decision(db,await action(db,await draft(db),'submit'));const source=db.raw.prepare('SELECT * FROM project_updates WHERE id=?').get(first.id);const at=Date.now();
 db.raw.prepare('UPDATE project_updates SET published_at=?').run(at);for(let n=0;n<14;n++){const values={...source,id:`page-${String(n).padStart(2,'0')}`,published_at:at};db.raw.prepare(`INSERT INTO project_updates(${Object.keys(values).join(',')}) VALUES(${Object.keys(values).map(()=>'?').join(',')})`).run(...Object.values(values));}
 const all=[];let cursor=null;do{const input=api.validateUpdatesPage(new URL(`https://rmt.dev/?limit=6${cursor?`&cursor=${cursor}`:''}`),'public');const result=await api.publicProjectUpdates(db,'vamps',input);assert.ok(result.updates.length<=6);all.push(...result.updates.map(r=>r.id));cursor=result.nextCursor;}while(cursor);
 assert.equal(all.length,15);assert.equal(new Set(all).size,15);assert.deepEqual(all,[...all].sort().reverse());
 for(const query of ['limit=0','limit=13','limit=abc','limit=6&limit=12','cursor=%','cursor=e30','status=draft'])assert.throws(()=>api.validateUpdatesPage(new URL(`https://rmt.dev/?${query}`),'public'),reject(400));
});

test('owner and reviewer keyset lists keep private drafts separate and expose honest continuation',async t=>{
 const db=database(t);seedOwner(db);const one=await draft(db),two=await draft(db);let three=await draft(db);three=await action(db,three,'submit');await decision(db,three,'reject');
 const own=await api.ownProjectUpdates(db,owner.userId,{limit:1,cursor:null});assert.equal(own.updates.length,1);assert.equal(own.hasMore,true);assert.ok(own.nextCursor);
 const following=await api.ownProjectUpdates(db,owner.userId,api.validateUpdatesPage(new URL(`https://rmt.dev/?limit=1&cursor=${own.nextCursor}`),'owner'));assert.notEqual(own.updates[0].id,following.updates[0].id);
 const pending=await action(db,one,'submit');const review=await api.projectUpdatesQueue(db,{limit:1,cursor:null});assert.equal(review.updates[0].id,pending.id);assert.equal(review.hasMore,true);
 const reviewNext=await api.projectUpdatesQueue(db,api.validateUpdatesPage(new URL(`https://rmt.dev/?limit=1&cursor=${review.nextCursor}`),'review'));assert.equal(reviewNext.updates.length,1);assert.equal(reviewNext.updates[0].status,'rejected');assert.equal(reviewNext.hasMore,false);assert.equal(reviewNext.updates.some(r=>r.id===two.id),false);
 assert.equal((await api.ownProjectUpdates(db,'other-builder',page)).updates.length,0);
});

test('Dot update alerts contain no draft text and acknowledgements only mark the exact pending revision',async t=>{
 const db=database(t);seedOwner(db);const row=await action(db,await draft(db,'vamps',{title:'PRIVATE announcement title',body:'PRIVATE draft material intended only for confirmed reviewers.'}),'submit');
 const digest=await api.reviewDigest(db,'reviewer',environment);assert.equal(digest.items[0].kind,'update');assert.equal(digest.pendingCount,1);assert.equal(JSON.stringify(digest).includes('PRIVATE'),false);assert.equal(JSON.stringify(digest).includes(owner.email),false);
 const key=digest.items[0].eventKey;assert.equal((await api.acknowledgeReviewAlerts(db,'reviewer',{eventKeys:[key]})).acknowledgedCount,1);assert.equal((await api.reviewDigest(db,'reviewer',environment)).newPendingCount,0);
 assert.equal(db.raw.prepare('SELECT status FROM project_updates WHERE id=?').get(row.id).status,'pending');assert.equal((await api.reviewDigest(db,'another-reviewer',environment)).newPendingCount,1);
});

test('routes enforce authenticated identity, exact account expectation, same-origin writes and reviewer access',async t=>{
 const db=database(t);seedOwner(db);
 assert.equal((await api.ownGET(request('/api/project-updates',{user:null}))).status,401);
 for(const account of [null,'previous-user']){assert.equal((await api.ownGET(request('/api/project-updates',{account}))).status,409);assert.equal((await api.createPOST(request('/api/project-updates',{method:'POST',account,body:fields()}))).status,409);}
 assert.equal((await api.createPOST(request('/api/project-updates',{method:'POST',origin:'https://evil.dev',body:fields()}))).status,403);
 assert.equal((await api.queueGET(request('/api/admin/project-updates'))).status,403);
 assert.equal((await api.queueGET(request('/api/admin/project-updates',{user:'reviewer',account:'builder'}))).status,409);
 const created=await api.createPOST(request('/api/project-updates',{method:'POST',body:fields()}));assert.equal(created.status,201);assert.equal(created.headers.get('cache-control'),'no-store');const row=(await created.json()).update;
 assert.equal((await api.changePATCH(request(`/api/project-updates/${row.id}`,{method:'PATCH',account:'other',body:{action:'submit',expectedRevision:row.revision}}),context(row.id))).status,409);
 const submit=await api.changePATCH(request(`/api/project-updates/${row.id}`,{method:'PATCH',body:{action:'submit',expectedRevision:row.revision}}),context(row.id));assert.equal(submit.status,200);const pending=(await submit.json()).update;
 assert.equal((await api.reviewPOST(request(`/api/admin/project-updates/${row.id}`,{method:'POST',body:{action:'approve',expectedRevision:pending.revision}}),context(row.id))).status,403);
 const approve=await api.reviewPOST(request(`/api/admin/project-updates/${row.id}`,{method:'POST',user:'reviewer',body:{action:'approve',expectedRevision:pending.revision,note:''}}),context(row.id));assert.equal(approve.status,200);
 const publicResponse=await api.publicGET(request('/api/projects/vamps/updates',{user:null}),{params:Promise.resolve({projectId:'vamps'})});assert.equal(publicResponse.status,200);assert.equal(publicResponse.headers.get('cache-control'),'no-store');assert.equal((await publicResponse.json()).updates.length,1);
 assert.equal((await api.ownGET(request('/api/project-updates?userId=builder',{user:'another-user'}))).status,400);
});

test('API database failures surface unavailable rather than false empty updates or false save success',async t=>{
 database(t);environment.DB={prepare(){throw new Error('Database unavailable');}};
 const own=await api.ownGET(request('/api/project-updates'));assert.equal(own.status,503);assert.equal('updates' in await own.json(),false);
 const pub=await api.publicGET(request('/api/projects/vamps/updates',{user:null}),{params:Promise.resolve({projectId:'vamps'})});assert.equal(pub.status,503);assert.equal('updates' in await pub.json(),false);
});

test('withdrawing, privately rewriting and archiving never exposes the rewritten draft to reviewers',async t=>{
 const db=database(t);seedOwner(db);let row=await action(db,await draft(db),'submit');row=await action(db,row,'withdraw');row=await action(db,row,'save',{kind:'progress',title:'PRIVATE never submitted',body:'This revised text was never sent for review by its publisher.',linkLabel:'',linkUrl:''});row=await action(db,row,'archive');
 assert.equal((await api.projectUpdatesQueue(db,page)).updates.some(r=>r.id===row.id),false);
 let published=await decision(db,await action(db,await draft(db),'submit'));published=await action(db,published,'archive');assert.equal((await api.projectUpdatesQueue(db,page)).updates.some(r=>r.id===published.id),true);
});

test('revoked old drafts do not permanently consume the active project draft allowance',async t=>{
 const db=database(t);seedOwner(db);const draftRow=await draft(db),source=db.raw.prepare('SELECT * FROM project_updates WHERE id=?').get(draftRow.id);db.raw.prepare('UPDATE project_updates SET created_at=?').run(Date.now()-172800000);
 for(let n=0;n<api.UPDATE_OPEN_DRAFTS-1;n++){const values={...source,id:`stale-${n}`,created_at:Date.now()-172800000};db.raw.prepare(`INSERT INTO project_updates(${Object.keys(values).join(',')}) VALUES(${Object.keys(values).map(()=>'?').join(',')})`).run(...Object.values(values));}
 await assert.rejects(draft(db),reject(429));db.raw.exec("UPDATE project_owners SET status='revoked',revision=2 WHERE project_id='vamps'");seedOwner(db,'lammbs');assert.equal((await draft(db,'lammbs')).status,'draft');
});


test('normalized Unicode links cannot exceed the public update payload limit', () => {
 const oversized = 'https://vamps.wtf/' + '你'.repeat(1000);
 assert.ok(oversized.length < 2048);
 assert.ok(new URL(oversized).href.length > 2048);
 assert.throws(() => api.validateCreateUpdate(fields('vamps', {linkUrl: oversized})), reject(400));
 const {projectId: _projectId, ...content} = fields('vamps', {linkUrl:oversized});
 assert.throws(() => api.validateChangeUpdate({action:'save',expectedRevision:1,...content}), reject(400));
 const supported = 'https://vamps.wtf/' + '你'.repeat(100);
 const normalized = api.validateCreateUpdate(fields('vamps', {linkUrl:supported}));
 assert.equal(normalized.linkUrl,new URL(supported).href);
 assert.ok(normalized.linkUrl.length <= 2048);
});

test('events use the confirmed builder and reviewer publication workflow',async t=>{
  const db=database(t);seedOwner(db);
  const initial=await draft(db,'vamps',{kind:'event'});assert.equal(initial.kind,'event');
  const pending=await action(db,initial,'submit');assert.equal(pending.kind,'event');
  assert.deepEqual((await api.publicProjectUpdates(db,'vamps',page)).updates,[]);
  await decision(db,pending);
  assert.equal((await api.publicProjectUpdates(db,'vamps',page)).updates[0].kind,'event');
});
