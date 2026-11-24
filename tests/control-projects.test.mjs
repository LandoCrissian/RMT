import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFile,readdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
const root=fileURLToPath(new URL('../',import.meta.url)),environment={};globalThis.__CONTROL_PROJECTS_ENV__=environment;
const bundled=await build({stdin:{contents:`
export {publicActivity} from './lib/server/activity';
export * from './lib/server/control-projects'; export * from './lib/server/control-content';
export * from './lib/server/repository'; export * from './lib/server/project-showcase';
export * from './lib/server/project-updates'; export * from './lib/server/project-edits';
export * from './lib/server/profiles'; export * from './lib/profiles';
export {publicArtworkRow} from './lib/server/project-artwork'; export {publicProfileArtworkRow} from './lib/server/profile-artwork';
export {InputError,validateProjectEdit,validateSubmission} from './lib/submission-validation';
export {GET as projectsGET,POST as projectsPOST} from './app/api/control/projects/route';
export {PATCH as projectPATCH} from './app/api/control/projects/[id]/route';
export {PATCH as contentPATCH} from './app/api/control/content/[id]/route';
export {GET as projectImageGET} from './app/media/project-artwork/[id]/route';
`,resolveDir:root,loader:'ts'},absWorkingDir:root,bundle:true,write:false,format:'esm',platform:'node',target:'node24',plugins:[{name:'runtime',setup(b){b.onResolve({filter:/^cloudflare:workers$/},()=>({path:'env',namespace:'test'}));b.onLoad({filter:/.*/,namespace:'test'},()=>({contents:'export const env=globalThis.__CONTROL_PROJECTS_ENV__;'}));}}]});
const api=await import('data:text/javascript;base64,'+Buffer.from(bundled.outputFiles[0].text).toString('base64'));
const migrations=(await readdir(new URL('../drizzle/',import.meta.url))).filter(v=>/^\d.*\.sql$/.test(v)).sort(),schema=(await Promise.all(migrations.map(v=>readFile(new URL('../drizzle/'+v,import.meta.url),'utf8')))).join('\n');
const actor={userId:'owner',email:'owner@rmt.dev',emailVerified:true,displayName:'Owner',role:'owner',roleRevision:0,capabilities:['projects','content']};
const reject=status=>error=>error instanceof api.InputError&&error.status===status;
function database(t){const raw=new DatabaseSync(':memory:');raw.exec('PRAGMA foreign_keys=ON;');raw.exec(schema);t.after(()=>raw.close());let chain=Promise.resolve();const db={raw,beforeBatch:null};function prepare(sql,values=[]){return{bind(...v){return prepare(sql,v);},async first(){return raw.prepare(sql).get(...values)??null;},async all(){return{results:raw.prepare(sql).all(...values),success:true,meta:{changes:0}};},async run(){return{results:[],success:true,meta:{changes:Number(raw.prepare(sql).run(...values).changes)}};}};}db.prepare=prepare;db.batch=statements=>{const result=chain.then(async()=>{if(db.beforeBatch){const h=db.beforeBatch;db.beforeBatch=null;h();}raw.exec('BEGIN');try{const out=[];for(const s of statements)out.push(await s.run());raw.exec('COMMIT');return out;}catch(e){raw.exec('ROLLBACK');throw e;}});chain=result.catch(()=>{});return result;};for(const key of Object.keys(environment))delete environment[key];Object.assign(environment,{DB:db,RMT_ADMIN_USER_IDS:'owner'});return db;}
function content(changes={}){return{name:'Independent Workshop',summary:'A useful independent browser workshop for the RMT community.',category:'Tools',stage:'building',website:'https://workshop.rmt.dev',launchUrl:'https://workshop.rmt.dev/app',xProfile:'',links:[{label:'Open workshop',url:'https://workshop.rmt.dev/app'}],...changes};}
function creation(changes={}){return api.validateCreateControlProject({content:content(),visibility:'public',featured:false,reason:'Verified the official project destinations.',confirmedLinks:true,...changes});}
async function change(db,id,fields){const item=await api.controlProject(db,id);return api.changeControlProject(db,actor,id,api.validateChangeControlProject({expectedRevision:item.revision,expectedListingRevision:item.listingRevision,reason:'Reviewed this operational project change.',...fields},id));}
function member(db,id='builder'){db.raw.prepare("INSERT INTO control_members(user_id,email,display_name,providers_json,first_seen_at,last_seen_at,historical_since_at,status,status_reason,revision,created_at,updated_at) VALUES(?,?,?,'[]',NULL,NULL,NULL,'active','',1,?,?)").run(id,id+'@rmt.dev',id,Date.now(),Date.now());}
function owner(db,id='vamps',user='builder',revision=1){db.raw.prepare("INSERT INTO project_owners(project_id,user_id,status,revision,created_at,updated_at) VALUES(?,?,'active',?,?,?)").run(id,user,revision,Date.now(),Date.now());}
function update(db,id='post-1',project='vamps',user='builder',revision=1){db.raw.prepare("INSERT INTO project_updates(id,project_id,project_name,user_id,ownership_revision,kind,title,body,link_label,link_url,status,review_note,revision,published_at,created_at,updated_at) VALUES(?,?,?,? ,?,'announcement','A real project announcement','Published details about a useful community project update.','','','approved','',1,?,?,?)").run(id,project,project,user,revision,Date.now(),Date.now(),Date.now());}
function request(path,{method='GET',user='owner',account=user,body,origin='https://rmt.dev'}={}){const headers={};if(user){headers['oai-authenticated-user-id']=user;headers['oai-authenticated-user-email']=user+'@rmt.dev';}if(account)headers['x-rmt-account']=account;if(method!=='GET'){headers['content-type']='application/json';if(origin)headers.origin=origin;}return new Request('https://rmt.dev'+path,{method,headers,...(body===undefined?{}:{body:JSON.stringify(body)})});}
const page={limit:6,cursor:null};

test('admin project creation persists real fields, rejects duplicate concurrent creates and has one atomic audit',async t=>{
 const db=database(t);const results=await Promise.allSettled([api.createControlProject(db,actor,creation()),api.createControlProject(db,actor,creation())]);assert.equal(results.filter(v=>v.status==='fulfilled').length,1);assert.equal(results.find(v=>v.status==='rejected').reason.status,409);
 const item=results.find(v=>v.status==='fulfilled').value;assert.ok(item.project.id.startsWith('admin-'));assert.equal(item.publiclyAvailable,true);assert.equal(item.owner,null);assert.equal(item.project.claimed,false);
 assert.ok((await api.catalog(db)).projects.some(p=>p.id===item.project.id));assert.equal(db.raw.prepare("SELECT COUNT(*) AS n FROM control_audit_events WHERE action='project.create'").get().n,1);
 await assert.rejects(api.createControlProject(db,actor,creation({content:content({name:'VAMPS',website:'https://another.rmt.dev',launchUrl:'https://another.rmt.dev'})})),reject(409));
});

test('project hide/archive/restore removes curated listings from catalog, shares, posts and public builder ties',async t=>{
 const db=database(t);member(db);owner(db);update(db);
 await api.saveProfile(db,{userId:'builder',email:'builder@rmt.dev',emailVerified:true,displayName:'Builder'},api.validateProfileInput({expectedRevision:0,handle:'real-builder',displayName:'Real builder',bio:'',visibility:'public',showManagedProjects:true,avatarAssetId:null,bannerAssetId:null,links:[]}));
 assert.equal((await api.publicProjectUpdates(db,'vamps',page)).updates.length,1);assert.equal((await api.publicProfile(db,'real-builder')).managedProjects.length,1);
 await change(db,'vamps',{action:'visibility',visibility:'hidden'});
 assert.equal((await api.catalog(db)).projects.some(p=>p.id==='vamps'),false);assert.equal(await api.projectShowcase(db,'vamps'),null);await assert.rejects(api.publicProjectUpdates(db,'vamps',page),reject(404));assert.equal((await api.publicProfile(db,'real-builder')).managedProjects.length,0);
 await change(db,'vamps',{action:'visibility',visibility:'archived'});assert.equal((await api.controlProject(db,'vamps')).visibility,'archived');
 await change(db,'vamps',{action:'visibility',visibility:'public'});assert.equal((await api.catalog(db)).projects.some(p=>p.id==='vamps'),true);assert.equal((await api.publicProjectUpdates(db,'vamps',page)).updates.length,1);
});

test('admin content edits invalidate pending owner edits, later reviewed owner edits supersede text and stale admin changes do not audit',async t=>{
 const db=database(t);member(db);owner(db);
 const ownerIdentity={userId:'builder',email:'builder@rmt.dev',emailVerified:true,displayName:'Builder'};
 const input=api.validateProjectEdit({projectId:'vamps',baseRevision:0,summary:'The owner has a useful community update with verified links.',category:'Games',stage:'live',website:'https://vamps.wtf',launchUrl:'https://games.vamps.wtf',xProfile:'',links:[]});
 const pending=await api.createProjectEdit(db,ownerIdentity,input);
 const edited=await change(db,'vamps',{action:'edit',confirmedLinks:true,content:content({name:'VAMPS',website:'https://vamps.wtf',launchUrl:'https://games.vamps.wtf'})});
 assert.equal(db.raw.prepare('SELECT status FROM project_edits WHERE id=?').get(pending.id).status,'rejected');await assert.rejects(api.reviewProjectEdit(db,'owner',pending.id,{action:'approve',note:'Checked',expectedRevision:pending.revision}),reject(409));
 const before=db.raw.prepare('SELECT COUNT(*) AS n FROM control_audit_events').get().n;
 await assert.rejects(api.changeControlProject(db,actor,'vamps',{action:'feature',featured:true,expectedRevision:0,expectedListingRevision:0,reason:'Choose a featured project.'}),reject(409));assert.equal(db.raw.prepare('SELECT COUNT(*) AS n FROM control_audit_events').get().n,before);
 const fresh=await api.createProjectEdit(db,ownerIdentity,input);await api.reviewProjectEdit(db,'owner',fresh.id,{action:'approve',note:'Checked official destinations.',expectedRevision:fresh.revision});
 assert.equal((await api.catalog(db)).projects.find(p=>p.id==='vamps').description,input.summary);assert.equal((await api.controlProject(db,'vamps')).revision,edited.revision);
});

test('delegated project writes fail atomically when the grant is revoked after the request authorization',async t=>{
 const db=database(t);member(db,'delegate');db.raw.prepare("INSERT INTO control_roles(user_id,role,revision,updated_at,updated_by) VALUES(?,'admin',1,?,'owner')").run('delegate',Date.now());
 const delegated={...actor,userId:'delegate',role:'admin',roleRevision:1};db.beforeBatch=()=>db.raw.exec("UPDATE control_roles SET role='member',revision=2 WHERE user_id='delegate'");
 await assert.rejects(api.changeControlProject(db,delegated,'vamps',{action:'visibility',visibility:'hidden',expectedRevision:0,expectedListingRevision:0,reason:'Remove the listed project.'}),reject(409));
 assert.equal(db.raw.prepare('SELECT COUNT(*) AS n FROM project_controls').get().n,0);assert.equal(db.raw.prepare('SELECT COUNT(*) AS n FROM control_audit_events').get().n,0);
});

test('ownership transfer requires a known active account and fresh revision, invalidates former-owner updates',async t=>{
 const db=database(t);member(db);member(db,'new-builder');owner(db);update(db);
 await assert.rejects(api.changeControlOwnership(db,actor,'vamps',api.validateControlOwnership({action:'transfer',targetUserId:'invented-account',confirmedOwnership:true,expectedRevision:1,reason:'Checked official ownership proof.'})),reject(404));
 const moved=await api.changeControlOwnership(db,actor,'vamps',api.validateControlOwnership({action:'transfer',targetUserId:'new-builder',confirmedOwnership:true,expectedRevision:1,reason:'Checked official ownership proof.'}));assert.equal(moved.owner.userId,'new-builder');assert.equal(moved.owner.revision,2);assert.equal((await api.publicProjectUpdates(db,'vamps',page)).updates.length,0);
 await assert.rejects(api.changeControlOwnership(db,actor,'vamps',api.validateControlOwnership({action:'revoke',expectedRevision:1,reason:'Trying to revoke stale ownership.'})),reject(409));
 const revoked=await api.changeControlOwnership(db,actor,'vamps',api.validateControlOwnership({action:'revoke',expectedRevision:2,reason:'Revoking confirmed ownership after review.'}));assert.equal(revoked.owner.status,'revoked');
});

test('moderated public profiles stay unavailable after edits and private revisions are never exposed to moderators',async t=>{
 const db=database(t);member(db);const user={userId:'builder',email:'builder@rmt.dev',emailVerified:true,displayName:'Builder'};
 let p=await api.saveProfile(db,user,api.validateProfileInput({expectedRevision:0,handle:'real-builder',displayName:'Real builder',bio:'Public member introduction.',visibility:'public',showManagedProjects:false,avatarAssetId:null,bannerAssetId:null,links:[]}));
 let result=await api.changeControlContent(db,actor,'builder',{kind:'profile',expectedRevision:0,expectedContentRevision:p.revision,hidden:true,reason:'Public profile requires moderation review.'});assert.equal(result.hidden,true);await assert.rejects(api.publicProfile(db,'real-builder'),reject(404));
 const profileInput={expectedRevision:p.revision,handle:p.handle,displayName:p.displayName,bio:'PRIVATE NEW BIO',visibility:'public',showManagedProjects:false,avatarAssetId:null,bannerAssetId:null,links:[]};await assert.rejects(api.saveProfile(db,user,api.validateProfileInput(profileInput)),reject(403));
 p=await api.saveProfile(db,user,api.validateProfileInput({...profileInput,visibility:'private'}));
 const list=await api.controlContent(db,{kind:'profile',visibility:'all',q:'',page:1,pageSize:20});assert.equal(list.items[0].body,'');assert.equal(list.items[0].publicUrl,null);assert.equal(JSON.stringify(list).includes('PRIVATE NEW BIO'),false);
 result=await api.changeControlContent(db,actor,'builder',{kind:'profile',expectedRevision:result.revision,expectedContentRevision:p.revision,hidden:false,reason:'Moderation restriction is now resolved.'});assert.equal(result.hidden,false);await assert.rejects(api.publicProfile(db,'real-builder'),reject(404));assert.equal((await api.ownProfile(db,'builder')).visibility,'private');
});

test('post moderation and account suspension remove public updates while retaining the project listing',async t=>{
 const db=database(t);member(db);owner(db);update(db);
 await api.changeControlContent(db,actor,'post-1',{kind:'update',expectedRevision:0,expectedContentRevision:1,hidden:true,reason:'This announcement requires a review.'});assert.equal((await api.publicProjectUpdates(db,'vamps',page)).updates.length,0);
 await api.changeControlContent(db,actor,'post-1',{kind:'update',expectedRevision:1,expectedContentRevision:1,hidden:false,reason:'The announcement review is resolved.'});assert.equal((await api.publicProjectUpdates(db,'vamps',page)).updates.length,1);
 db.raw.exec("UPDATE control_members SET status='suspended',revision=2 WHERE user_id='builder'");assert.equal((await api.publicProjectUpdates(db,'vamps',page)).updates.length,0);assert.ok((await api.catalog(db)).projects.some(p=>p.id==='vamps'));
});

test('management routes enforce verified role, exact account, same origin, and reject unknown authority fields',async t=>{
 const db=database(t);member(db,'moderator');db.raw.prepare("INSERT INTO control_roles(user_id,role,revision,updated_at,updated_by) VALUES(?,'moderator',1,?,'owner')").run('moderator',Date.now());
 assert.equal((await api.projectsGET(request('/api/control/projects',{user:null}))).status,401);
 assert.equal((await api.projectsGET(request('/api/control/projects',{user:'visitor'}))).status,403);
 assert.equal((await api.projectsGET(request('/api/control/projects',{user:'moderator'}))).status,403);
 assert.equal((await api.projectsGET(request('/api/control/projects',{account:'someone-else'}))).status,409);
 const body={action:'visibility',visibility:'hidden',expectedRevision:0,expectedListingRevision:0,reason:'Moderating this listed project.'};
 assert.equal((await api.projectPATCH(request('/api/control/projects/vamps',{method:'PATCH',body,origin:'https://wrong.rmt.dev'}),{params:Promise.resolve({id:'vamps'})})).status,403);
 assert.equal((await api.projectPATCH(request('/api/control/projects/vamps',{method:'PATCH',body:{...body,actorId:'owner'}}),{params:Promise.resolve({id:'vamps'})})).status,400);
 const response=await api.projectsGET(request('/api/control/projects'));assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.equal((await response.json()).projects.length,20);
});

test('Activity respects project hiding, post moderation, suspended accounts and first publication of admin listings',async t=>{
 const db=database(t);member(db);owner(db);update(db);const activityPage={kind:'all',limit:12,cursor:null};
 let feed=await api.publicActivity(db,activityPage);assert.ok(feed.items.some(item=>item.updateId==='post-1'));
 await api.changeControlContent(db,actor,'post-1',{kind:'update',expectedRevision:0,expectedContentRevision:1,hidden:true,reason:'The announcement requires moderation.'});
 feed=await api.publicActivity(db,activityPage);assert.equal(feed.items.some(item=>item.updateId==='post-1'),false);
 await api.changeControlContent(db,actor,'post-1',{kind:'update',expectedRevision:1,expectedContentRevision:1,hidden:false,reason:'This announcement review is resolved.'});
 db.raw.exec("UPDATE control_members SET status='suspended' WHERE user_id='builder'");assert.equal((await api.publicActivity(db,activityPage)).items.some(item=>item.updateId==='post-1'),false);
 db.raw.exec("UPDATE control_members SET status='active' WHERE user_id='builder'");await change(db,'vamps',{action:'visibility',visibility:'hidden'});assert.equal((await api.publicActivity(db,activityPage)).items.some(item=>item.project.id==='vamps'),false);
 let added=await api.createControlProject(db,actor,creation({visibility:'hidden'}));assert.equal(added.project.listedAt,undefined);assert.equal((await api.publicActivity(db,activityPage)).items.some(item=>item.project.id===added.project.id),false);
 added=await change(db,added.project.id,{action:'visibility',visibility:'public'});assert.ok(added.project.listedAt);const first=added.project.listedAt;assert.ok((await api.publicActivity(db,activityPage)).items.some(item=>item.project.id===added.project.id&&item.kind==='listing'));
 await change(db,added.project.id,{action:'visibility',visibility:'hidden'});added=await change(db,added.project.id,{action:'visibility',visibility:'public'});assert.equal(added.project.listedAt,first);
});

test('hiding a project blocks approved media including a concurrent hide during storage reads',async t=>{
 const db=database(t);member(db);owner(db);const id=crypto.randomUUID(),editId=crypto.randomUUID(),now=Date.now();
 const payload={projectId:'vamps',baseRevision:0,summary:'A verified existing project with a reviewed artwork image.',category:'Games',stage:'live',website:'https://vamps.wtf',launchUrl:'https://games.vamps.wtf',xProfile:'',links:[],logoAssetId:id,bannerAssetId:null};
 db.raw.prepare("INSERT INTO project_artwork(id,project_id,user_id,ownership_revision,kind,object_key,mime,width,height,byte_size,digest,status,created_at) VALUES(?,'vamps','builder',1,'logo','private-storage-key','image/png',128,128,3,'digest','ready',?)").run(id,now);
 db.raw.prepare("INSERT INTO project_edits(id,project_id,project_name,user_id,ownership_revision,base_revision,payload_json,status,review_note,revision,created_at,updated_at) VALUES(?,'vamps','VAMPS','builder',1,0,?,'approved','',1,?,?)").run(editId,JSON.stringify(payload),now,now);
 db.raw.prepare("INSERT INTO project_overrides(project_id,payload_json,revision,edit_id,updated_at) VALUES('vamps',?,1,?,?)").run(JSON.stringify(payload),editId,now);
 assert.equal((await api.publicArtworkRow(db,id)).id,id);
 environment.BUCKET={async get(){await change(db,'vamps',{action:'visibility',visibility:'hidden'});return{size:3,body:new Response(new Uint8Array([1,2,3])).body};}};
 const response=await api.projectImageGET(new Request('https://rmt.dev/media/project-artwork/'+id),{params:Promise.resolve({id})});assert.equal(response.status,404);await assert.rejects(api.publicArtworkRow(db,id),reject(404));
 await change(db,'vamps',{action:'visibility',visibility:'public'});assert.equal((await api.publicArtworkRow(db,id)).id,id);
});

test('profile moderation and suspension revoke public profile artwork without changing private stored assets',async t=>{
 const db=database(t);member(db);const id=crypto.randomUUID(),now=Date.now();
 db.raw.prepare("INSERT INTO profile_artwork(id,user_id,kind,object_key,mime,width,height,byte_size,digest,status,created_at) VALUES(?,'builder','avatar','private-avatar-key','image/png',128,128,3,'digest','ready',?)").run(id,now);
 const p=await api.saveProfile(db,{userId:'builder',email:'builder@rmt.dev',emailVerified:true},api.validateProfileInput({expectedRevision:0,handle:'real-builder',displayName:'Builder',bio:'',visibility:'public',showManagedProjects:false,avatarAssetId:id,bannerAssetId:null,links:[]}));
 assert.equal((await api.publicProfileArtworkRow(db,id)).id,id);
 await api.changeControlContent(db,actor,'builder',{kind:'profile',expectedRevision:0,expectedContentRevision:p.revision,hidden:true,reason:'The public profile requires moderation.'});await assert.rejects(api.publicProfileArtworkRow(db,id),reject(404));
 await api.changeControlContent(db,actor,'builder',{kind:'profile',expectedRevision:1,expectedContentRevision:p.revision,hidden:false,reason:'The profile moderation is resolved.'});assert.equal((await api.publicProfileArtworkRow(db,id)).id,id);
 db.raw.exec("UPDATE control_members SET status='suspended' WHERE user_id='builder'");await assert.rejects(api.publicProfileArtworkRow(db,id),reject(404));assert.equal(db.raw.prepare('SELECT status FROM profile_artwork WHERE id=?').get(id).status,'ready');
});


test('public applications and admin-created listings cannot duplicate each other',async t=>{
 const db=database(t);await api.createControlProject(db,actor,creation());
 const input=api.validateSubmission({name:'Independent Workshop',summary:'A useful independent browser workshop for the RMT community.',category:'Tools',stage:'building',website:'https://workshop.rmt.dev',launchUrl:'',xProfile:'',contactEmail:'',ownershipEvidence:'Official ownership evidence can be placed on the website.',companyFax:''});
 await assert.rejects(api.createSubmission(db,{userId:'applicant',email:'applicant@rmt.dev'},input),reject(409));assert.equal(db.raw.prepare('SELECT COUNT(*) AS n FROM submissions').get().n,0);
 const other={...input,name:'Another Workshop',normalizedName:'another workshop',website:'https://another.rmt.dev/',normalizedHost:'another.rmt.dev',launchUrl:'https://another.rmt.dev/'};
 await api.createSubmission(db,{userId:'applicant',email:'applicant@rmt.dev'},other);
 await assert.rejects(api.createControlProject(db,actor,creation({content:content({name:'Another Workshop',website:'https://another.rmt.dev/',launchUrl:'https://another.rmt.dev/'})})),reject(409));
});


test('ownership transfer cannot select a Firebase alias linked while the management request is in flight',async t=>{
 const db=database(t);member(db);member(db,'firebase:new-identity');owner(db);
 db.beforeBatch=()=>db.raw.prepare('INSERT INTO account_links(firebase_uid,legacy_user_id,created_at) VALUES(?,?,?)').run('new-identity','canonical-existing-member',Date.now());
 await assert.rejects(api.changeControlOwnership(db,actor,'vamps',api.validateControlOwnership({action:'transfer',expectedRevision:1,targetUserId:'firebase:new-identity',confirmedOwnership:true,reason:'Checked project ownership carefully.'})),reject(409));
 assert.equal(db.raw.prepare("SELECT user_id FROM project_owners WHERE project_id='vamps'").get().user_id,'builder');assert.equal(db.raw.prepare('SELECT COUNT(*) AS n FROM control_audit_events').get().n,0);
});
