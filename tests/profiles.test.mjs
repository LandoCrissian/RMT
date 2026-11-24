import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFile,readdir,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import sharp from 'sharp';

const root=fileURLToPath(new URL('../',import.meta.url));
const environment={};globalThis.__RMT_PROFILES_TEST_ENV__=environment;
// The existing real-token verifier has its own suite. This fixture isolates the
// existing runtime account-link resolution from an actual external Google login.
const bundle=await build({stdin:{contents:`
 export * from './lib/profiles'; export * from './lib/server/profiles'; export * from './lib/server/profile-artwork';
 export {InputError,validateSubmission,validateDecision} from './lib/submission-validation';
 export {createSubmission,reviewSubmission} from './lib/server/repository';
 export {GET as selfGET,PATCH as selfPATCH} from './app/api/profile/route';
 export {GET as profileGET} from './app/api/profiles/[handle]/route';
 export {GET as artworkGET,POST as artworkPOST} from './app/api/profile-artwork/route';
 export {GET as imageGET,HEAD as imageHEAD} from './app/api/profile-artwork/[id]/route';
 export {GET as publicImageGET,HEAD as publicImageHEAD} from './app/media/profile-artwork/[id]/route';
 export {GET as buildersGET} from './app/api/projects/[projectId]/builders/route';
`,resolveDir:root,loader:'ts'},absWorkingDir:root,bundle:true,write:false,platform:'node',format:'esm',target:'node24',plugins:[{name:'profiles-test-runtime',setup(build){
 build.onResolve({filter:/^cloudflare:workers$/},()=>({path:'test-runtime',namespace:'test-runtime'}));
 build.onLoad({filter:/.*/,namespace:'test-runtime'},()=>({contents:'export const env=globalThis.__RMT_PROFILES_TEST_ENV__;'}));
 build.onResolve({filter:/^\.\/firebase-auth$/},()=>({path:'verified-auth-fixture',namespace:'verified-auth-fixture'}));
 build.onLoad({filter:/.*/,namespace:'verified-auth-fixture'},()=>({contents:`export const sessionCookie='fixture-session'; export function cookieValue(request,name){return request.headers.get('cookie')?.split(';').map(s=>s.trim()).find(s=>s.startsWith(name+'='))?.slice(name.length+1)??null;} export async function verifyFirebaseToken(token){if(token!=='verified-fixture'||!globalThis.__RMT_PROFILES_TEST_AUTH__)throw new Error('Invalid test credential');return globalThis.__RMT_PROFILES_TEST_AUTH__;} export async function checkFirebaseAccount(){}` }));
}}]});
const api=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const migrations=(await readdir(new URL('../drizzle/',import.meta.url))).filter(f=>/^\d.*\.sql$/.test(f)).sort();
const schema=(await Promise.all(migrations.map(f=>readFile(new URL(`../drizzle/${f}`,import.meta.url),'utf8')))).join('\n');
const avatar=await sharp({create:{width:128,height:128,channels:4,background:'#baff44'}}).png().toBuffer();
const banner=await sharp({create:{width:1200,height:630,channels:3,background:'#20262a'}}).png().toBuffer();
const owner={userId:'legacy-builder',email:'PRIVATE-provider@rmt.dev',displayName:'PRIVATE provider name',emailVerified:true};
const reject=status=>e=>e instanceof api.InputError&&e.status===status;
function database(t,filename=':memory:',initialize=true){
 const raw=new DatabaseSync(filename);raw.exec('PRAGMA foreign_keys=ON;');if(initialize)raw.exec(schema);
 let chain=Promise.resolve(),closed=false;const db={raw,beforeBatch:null,beforeAll:null,beforeFirst:null,close(){if(!closed){raw.close();closed=true;}}};
 function hook(name,sql){const h=db[name];if(h&&h.match.test(sql)){db[name]=null;h.run();}}
 function prepare(sql,values=[]){return{bind(...v){return prepare(sql,v);},async first(){hook('beforeFirst',sql);return raw.prepare(sql).get(...values)??null;},async all(){hook('beforeAll',sql);return{success:true,results:raw.prepare(sql).all(...values),meta:{changes:0}};},async run(){const r=raw.prepare(sql).run(...values);return{success:true,results:[],meta:{changes:Number(r.changes)}};}};}
 db.prepare=prepare;db.batch=statements=>{const result=chain.then(async()=>{if(db.beforeBatch){const f=db.beforeBatch;db.beforeBatch=null;f();}raw.exec('BEGIN');try{const out=[];for(const statement of statements)out.push(await statement.run());raw.exec('COMMIT');return out;}catch(e){raw.exec('ROLLBACK');throw e;}});chain=result.catch(()=>{});return result;};
 t.after(()=>db.close());for(const key of Object.keys(environment))delete environment[key];Object.assign(environment,{DB:db,RMT_ADMIN_USER_IDS:'reviewer'});globalThis.__RMT_PROFILES_TEST_AUTH__=null;return db;
}
function bucket(){const objects=new Map();return{objects,async put(key,bytes){objects.set(key,Uint8Array.from(bytes));},async delete(key){objects.delete(key);},async get(key){const bytes=objects.get(key);return bytes?{size:bytes.length,body:new Response(bytes).body}:null;}};}
function fields(changes={}){return{expectedRevision:0,handle:'test-builder',displayName:'Test Builder',bio:'Building useful experiences for our community.',visibility:'private',showManagedProjects:false,avatarAssetId:null,bannerAssetId:null,links:[],...changes};}
async function save(db,changes={},user=owner){return api.saveProfile(db,user,api.validateProfileInput(fields(changes)));}
function payload(profile,changes={}){const {handle,displayName,bio,visibility,showManagedProjects,avatarAssetId,bannerAssetId,links}=profile;return{expectedRevision:profile.revision,handle,displayName,bio,visibility,showManagedProjects,avatarAssetId,bannerAssetId,links,...changes};}
async function update(db,profile,changes={},user=owner){return api.saveProfile(db,user,api.validateProfileInput(payload(profile,changes)));}
function seedOwner(db,projectId='vamps',userId=owner.userId){db.raw.prepare("INSERT INTO project_owners(project_id,user_id,status,revision,created_at,updated_at) VALUES(?,?,'active',1,?,?)").run(projectId,userId,Date.now(),Date.now());}
async function community(db){const s=await api.createSubmission(db,owner,api.validateSubmission({name:'Fixture Studio',summary:'A useful independent browser experience with a public project home.',category:'Tools',stage:'building',website:'https://fixture.rmt.dev',launchUrl:'',xProfile:'',contactEmail:'',ownershipEvidence:'I can put the verification code on the official website.',companyFax:''}));await api.reviewSubmission(db,'reviewer',s.id,api.validateDecision({action:'approve',expectedRevision:s.revision,note:'Checked ownership and public project links.',confirmedOwnership:true,checkedLinks:true}));return{id:s.id,projectId:`community-${s.id}`};}
function request(path,{method='GET',user=owner.userId,account=user,body,origin='https://rmt.dev',headers:extra={}}={}){const headers={...extra};if(user){headers['oai-authenticated-user-id']=user;headers['oai-authenticated-user-email']='PRIVATE-route-email@rmt.dev';}if(account)headers['x-rmt-account']=account;if(method!=='GET'&&method!=='HEAD'){headers['content-type']??='application/json';if(origin)headers.origin=origin;}return new Request('https://rmt.dev'+path,{method,headers,...(body===undefined?{}:{body:body instanceof Uint8Array?body:JSON.stringify(body)})});}
const imageContext=id=>({params:Promise.resolve({id})});

test('profiles begin absent and private saves never import or expose provider identity',async t=>{
 const db=database(t);assert.equal(await api.ownProfile(db,owner.userId),null);assert.equal(db.raw.prepare('SELECT COUNT(*) AS n FROM profiles').get().n,0);
 const empty=await save(db,{handle:'',displayName:'',bio:''});assert.equal(empty.visibility,'private');assert.equal(empty.displayName,'');assert.equal(empty.handle,'');assert.equal(empty.showManagedProjects,false);assert.equal(empty.avatar,null);assert.equal(empty.revision,1);assert.equal(empty.handleLocked,false);
 assert.equal(JSON.stringify(empty).includes('PRIVATE'),false);assert.equal('userId'in empty,false);assert.equal('email'in empty,false);assert.equal('provider'in empty,false);assert.equal('isAdmin'in empty,false);
 await assert.rejects(api.publicProfile(db,'test-builder'),reject(404));
});

test('profile validation rejects authority and library fields, reserved handles and unsafe or expanded links',()=>{
 for(const field of ['userId','email','provider','isAdmin','isBuilder','firstPublishedAt','handleLocked','revision','savedProjects','showLibrary','managedProjects'])assert.throws(()=>api.validateProfileInput({...fields(),[field]:true}),reject(400),field);
 for(const handle of ['admin','RMT','rmt-support','support_team','root','ab','-builder','builder_','a'.repeat(25),'name space','name/name','аdmin'])assert.throws(()=>api.validateProfileInput(fields({handle})),reject(400),handle);
 assert.equal(api.validateProfileInput(fields({handle:' LANDON_208 '})).handle,'landon_208');
 assert.throws(()=>api.validateProfileInput(fields({visibility:'public',handle:''})),reject(400));assert.throws(()=>api.validateProfileInput(fields({visibility:'public',displayName:' '})),reject(400));
 for(const url of ['javascript:alert(1)','http://rmt.dev','https://127.1/','https://user:pass@rmt.dev/','https://rmt.dev/'+ '你'.repeat(1000)])assert.throws(()=>api.validateProfileInput(fields({links:[{label:'Website',url}]})),reject(400),url);
 assert.throws(()=>api.validateProfileInput(fields({links:Array(5).fill({label:'Site',url:'https://rmt.dev'})})),reject(400));
 assert.throws(()=>api.validateProfileInput(fields({bio:'x'.repeat(281)})),reject(400));assert.throws(()=>api.validateProfileInput(fields({avatarAssetId:'not-an-asset'})),reject(400));
});

test('private handle changes are allowed but first public publication locks and reserves the handle forever',async t=>{
 const db=database(t);let row=await save(db);row=await update(db,row,{handle:'new-builder'});assert.equal(row.handleLocked,false);
 row=await update(db,row,{visibility:'public'});const first=row.firstPublishedAt;assert.equal(row.handleLocked,true);assert.ok(first>0);
 row=await update(db,row,{visibility:'private'});assert.equal(row.firstPublishedAt,first);await assert.rejects(update(db,row,{handle:'another-builder'}),e=>reject(409)(e)&&e.code==='handle_locked');
 await assert.rejects(save(db,{handle:'new-builder'},{...owner,userId:'different-user'}),e=>reject(409)(e)&&e.code==='handle_taken');
 assert.equal((await save(db,{handle:'test-builder'},{...owner,userId:'different-user'})).handle,'test-builder');
 await assert.rejects(api.publicProfile(db,'new-builder'),reject(404));
 row=await update(db,row,{visibility:'public'});assert.equal(row.firstPublishedAt,first);assert.equal((await api.publicProfile(db,'NEW-BUILDER')).handle,'new-builder');
});

test('handle races and stale profile writes have one winner with no orphan audit events',async t=>{
 const db=database(t);const races=await Promise.allSettled([save(db),save(db,{handle:'TEST-BUILDER'},{...owner,userId:'other-user'})]);assert.equal(races.filter(r=>r.status==='fulfilled').length,1);assert.equal(races.find(r=>r.status==='rejected').reason.code,'handle_taken');assert.equal(db.raw.prepare('SELECT COUNT(*) AS n FROM profile_events').get().n,1);
 const row=await api.ownProfile(db,owner.userId);const writes=await Promise.allSettled([update(db,row,{bio:'First revision wins.'}),update(db,row,{bio:'Second revision wins.'})]);assert.equal(writes.filter(r=>r.status==='fulfilled').length,1);assert.equal(writes.find(r=>r.status==='rejected').reason.code,'revision_conflict');
 assert.equal(db.raw.prepare('SELECT COUNT(*) AS n FROM profile_events').get().n,2);assert.equal((await api.ownProfile(db,owner.userId)).revision,2);
});

test('public profile is an explicit projection and saved libraries remain private',async t=>{
 const db=database(t);seedOwner(db);db.raw.prepare('INSERT INTO saved_projects(user_id,project_id,created_at) VALUES(?,?,?)').run(owner.userId,'vamps',Date.now());
 let row=await save(db,{visibility:'public',links:[{label:'My website',url:'https://rmt.dev/me'}]});const publicRow=await api.publicProfile(db,row.handle);
 assert.deepEqual(Object.keys(publicRow).sort(),['handle','displayName','bio','links','avatar','banner','managedProjects','isBuilder'].sort());assert.equal(publicRow.isBuilder,false);assert.deepEqual(publicRow.managedProjects,[]);assert.equal(JSON.stringify(publicRow).includes('PRIVATE'),false);
 row=await update(db,row,{showManagedProjects:true});const withProjects=await api.publicProfile(db,row.handle);assert.equal(withProjects.isBuilder,true);assert.equal(withProjects.managedProjects[0].id,'vamps');assert.equal('savedProjects'in withProjects,false);
 row=await update(db,row,{showManagedProjects:false});assert.deepEqual((await api.publicProfile(db,row.handle)).managedProjects,[]);assert.equal((await api.publicProfile(db,row.handle)).isBuilder,false);
});

test('builder relationships require current public ownership and explicit profile opt-in',async t=>{
 const db=database(t);seedOwner(db);let row=await save(db,{visibility:'public'});assert.deepEqual(await api.publicBuildersForProject(db,'vamps'),{builders:[]});
 row=await update(db,row,{showManagedProjects:true});const result=await api.publicBuildersForProject(db,'vamps');assert.deepEqual(Object.keys(result.builders[0]).sort(),['handle','displayName','avatar','href'].sort());assert.equal(result.builders[0].href,'/u/test-builder');
 db.raw.exec("UPDATE project_owners SET status='revoked',revision=2 WHERE project_id='vamps'");assert.deepEqual(await api.publicBuildersForProject(db,'vamps'),{builders:[]});assert.equal((await api.publicProfile(db,row.handle)).isBuilder,false);
 db.raw.exec("UPDATE project_owners SET status='active',user_id='another-owner',revision=3 WHERE project_id='vamps'");assert.equal((await api.publicProfile(db,row.handle)).isBuilder,false);
});

test('project suspension and owner revocation during dependent reads cannot leak builder relationships',async t=>{
 const db=database(t),project=await community(db);const row=await save(db,{visibility:'public',showManagedProjects:true});assert.equal((await api.publicProfile(db,row.handle)).isBuilder,true);
 db.beforeAll={match:/SELECT o\.project_id FROM project_owners o/,run:()=>db.raw.prepare("UPDATE submissions SET status='suspended' WHERE id=?").run(project.id)};const hidden=await api.publicProfile(db,row.handle);assert.equal(hidden.isBuilder,false);assert.deepEqual(hidden.managedProjects,[]);
 db.raw.prepare("UPDATE submissions SET status='approved' WHERE id=?").run(project.id);db.beforeAll={match:/SELECT p\.\* FROM profiles p JOIN project_owners/,run:()=>db.raw.prepare("UPDATE submissions SET status='suspended' WHERE id=?").run(project.id)};assert.deepEqual(await api.publicBuildersForProject(db,project.projectId),{builders:[]});
 db.raw.prepare("UPDATE submissions SET status='approved' WHERE id=?").run(project.id);db.beforeFirst={match:/SELECT p\.user_id FROM profiles p JOIN project_owners/,run:()=>db.raw.prepare("UPDATE submissions SET status='suspended' WHERE id=?").run(project.id)};assert.deepEqual(await api.publicBuildersForProject(db,project.projectId),{builders:[]});
 db.raw.prepare("UPDATE submissions SET status='approved' WHERE id=?").run(project.id);db.beforeAll={match:/SELECT o\.project_id FROM project_owners o/,run:()=>db.raw.prepare("UPDATE project_owners SET status='revoked' WHERE project_id=?").run(project.projectId)};assert.equal((await api.publicProfile(db,row.handle)).isBuilder,false);
 db.raw.prepare("UPDATE project_owners SET status='active' WHERE project_id=?").run(project.projectId);db.beforeAll={match:/SELECT p\.user_id,o\.project_id FROM profiles p/,run:()=>db.raw.prepare("UPDATE project_owners SET status='revoked' WHERE project_id=?").run(project.projectId)};assert.equal((await api.publicProfile(db,row.handle)).isBuilder,false);
});

test('a profile made private during its dependent reads does not return stale public details',async t=>{
 const db=database(t);const row=await save(db,{visibility:'public'});db.beforeAll={match:/SELECT p\.user_id,o\.project_id FROM profiles p/,run:()=>db.raw.prepare("UPDATE profiles SET visibility='private',revision=revision+1 WHERE user_id=?").run(owner.userId)};
 await assert.rejects(api.publicProfile(db,row.handle),reject(404));
});

test('profile edit quota is atomic but can never prevent hiding a public profile',async t=>{
 const db=database(t);let row=await save(db,{visibility:'public'});for(let n=1;n<api.PROFILE_EDIT_LIMIT;n++)row=await update(db,row,{bio:`Useful project notes ${n}.`});
 const count=db.raw.prepare('SELECT COUNT(*) AS n FROM profile_events').get().n;await assert.rejects(update(db,row,{bio:'One edit beyond the daily limit.'}),reject(429));assert.equal(db.raw.prepare('SELECT COUNT(*) AS n FROM profile_events').get().n,count);
 row=await update(db,row,{visibility:'private'});assert.equal(row.visibility,'private');await assert.rejects(api.publicProfile(db,row.handle),reject(404));await assert.rejects(update(db,row,{visibility:'public'}),reject(429));
});

test('profile text and permanent handle survive reopening the database',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'rmt-profiles-'));t.after(()=>rm(dir,{recursive:true,force:true}));const path=join(dir,'data.sqlite');let db=database(t,path);const row=await save(db,{visibility:'public'});db.close();db=database(t,path,false);const loaded=await api.ownProfile(db,owner.userId);assert.equal(loaded.handle,row.handle);assert.equal(loaded.handleLocked,true);assert.equal((await api.publicProfile(db,row.handle)).displayName,row.displayName);
});

test('profile artwork is fully validated PNG and requires the verified account',async t=>{
 const db=database(t),store=bucket();await assert.rejects(api.uploadProfileArtwork(db,store,{...owner,emailVerified:false},'avatar',avatar,'image/png'),reject(403));
 for(const [bytes,mime]of[[avatar,'image/svg+xml'],[await sharp(avatar).jpeg().toBuffer(),'image/jpeg'],[await sharp(avatar).webp().toBuffer(),'image/webp']])await assert.rejects(api.uploadProfileArtwork(db,store,owner,'avatar',bytes,mime),reject(415));
 await assert.rejects(api.uploadProfileArtwork(db,store,owner,'avatar',new Uint8Array([1,2,3]),'image/png'),reject(400));assert.equal(store.objects.size,0);
 const uploaded=await api.uploadProfileArtwork(db,store,owner,'avatar',avatar,'image/png');assert.equal(uploaded.width,128);assert.equal(uploaded.kind,'avatar');assert.equal(uploaded.url,uploaded.previewUrl);assert.equal('userId'in uploaded,false);assert.equal('objectKey'in uploaded,false);
});

test('uploaded media stays private until selected on a public profile and disappears when replaced, removed, or hidden',async t=>{
 const db=database(t),store=bucket();const one=await api.uploadProfileArtwork(db,store,owner,'avatar',avatar,'image/png');const two=await api.uploadProfileArtwork(db,store,owner,'avatar',avatar,'image/png');
 await assert.rejects(api.publicProfileArtworkRow(db,one.id),reject(404));await assert.rejects(api.privateProfileArtworkRow(db,'other-user',one.id),reject(404));assert.equal((await api.privateProfileArtworkRow(db,owner.userId,one.id)).id,one.id);
 let row=await save(db,{avatarAssetId:one.id});await assert.rejects(api.publicProfileArtworkRow(db,one.id),reject(404));row=await update(db,row,{visibility:'public'});assert.equal((await api.publicProfileArtworkRow(db,one.id)).id,one.id);
 const response=await api.profileArtworkResponse(store,await api.publicProfileArtworkRow(db,one.id));assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(response.headers.get('content-type'),'image/png');assert.equal(response.headers.get('x-content-type-options'),'nosniff');
 const served=Buffer.from(await response.arrayBuffer());assert.deepEqual(await sharp(served).raw().toBuffer(),await sharp(avatar).raw().toBuffer());assert.equal(served.includes(Buffer.from('pHYs')),false,'normalization removes ancillary PNG metadata without changing the pixels');
 row=await update(db,row,{avatarAssetId:two.id});await assert.rejects(api.publicProfileArtworkRow(db,one.id),reject(404));assert.equal((await api.publicProfileArtworkRow(db,two.id)).id,two.id);
 row=await update(db,row,{avatarAssetId:null});await assert.rejects(api.publicProfileArtworkRow(db,two.id),reject(404));row=await update(db,row,{avatarAssetId:one.id});row=await update(db,row,{visibility:'private'});await assert.rejects(api.publicProfileArtworkRow(db,one.id),reject(404));assert.equal((await api.privateProfileArtworkRow(db,owner.userId,one.id)).id,one.id);
});

test('foreign-user or wrong-kind artwork cannot be attached, including when it changes during a save',async t=>{
 const db=database(t),store=bucket();const foreign=await api.uploadProfileArtwork(db,store,{...owner,userId:'other-user'},'avatar',avatar,'image/png');await assert.rejects(save(db,{avatarAssetId:foreign.id}),reject(404));
 const own=await api.uploadProfileArtwork(db,store,owner,'banner',banner,'image/png');await assert.rejects(save(db,{avatarAssetId:own.id}),reject(404));
 const valid=await api.uploadProfileArtwork(db,store,owner,'avatar',avatar,'image/png');db.beforeBatch=()=>db.raw.prepare("UPDATE profile_artwork SET status='failed' WHERE id=?").run(valid.id);await assert.rejects(save(db,{avatarAssetId:valid.id}),reject(409));assert.equal(db.raw.prepare('SELECT COUNT(*) AS n FROM profiles').get().n,0);assert.equal(db.raw.prepare('SELECT COUNT(*) AS n FROM profile_events').get().n,0);
});

test('failed image storage cannot produce a ready asset or a usable public URL',async t=>{
 const db=database(t),store=bucket();store.put=async()=>{throw new Error('Storage unavailable');};await assert.rejects(api.uploadProfileArtwork(db,store,owner,'avatar',avatar,'image/png'),/Storage unavailable/);const row=db.raw.prepare('SELECT * FROM profile_artwork').get();assert.equal(row.status,'failed');assert.equal((await api.ownProfileArtwork(db,owner.userId)).length,0);assert.equal(store.objects.size,0);await assert.rejects(api.publicProfileArtworkRow(db,row.id),reject(404));
});

test('simultaneous image uploads cannot exceed the account daily quota',async t=>{
 const db=database(t),store=bucket();const results=await Promise.allSettled(Array.from({length:api.PROFILE_UPLOAD_LIMIT+1},()=>api.uploadProfileArtwork(db,store,owner,'avatar',avatar,'image/png')));assert.equal(results.filter(r=>r.status==='fulfilled').length,api.PROFILE_UPLOAD_LIMIT);assert.equal(results.find(r=>r.status==='rejected').reason.status,429);assert.equal(store.objects.size,api.PROFILE_UPLOAD_LIMIT);
});

test('profile APIs enforce account consistency and origin without affecting anonymous public browsing',async t=>{
 const db=database(t);assert.equal((await api.selfGET(request('/api/profile',{user:null}))).status,401);for(const account of [null,'stale-user']){assert.equal((await api.selfGET(request('/api/profile',{account}))).status,409);assert.equal((await api.selfPATCH(request('/api/profile',{method:'PATCH',account,body:fields()}))).status,409);}
 assert.equal((await api.selfPATCH(request('/api/profile',{method:'PATCH',origin:'https://evil.dev',body:fields()}))).status,403);
 const saved=await api.selfPATCH(request('/api/profile',{method:'PATCH',body:fields({visibility:'public'})}));assert.equal(saved.status,200);assert.equal(saved.headers.get('cache-control'),'no-store');const row=(await saved.json()).profile;
 const pub=await api.profileGET(request('/api/profiles/test-builder',{user:null}),{params:Promise.resolve({handle:'test-builder'})});assert.equal(pub.status,200);assert.equal(pub.headers.get('cache-control'),'no-store');assert.equal('userId'in(await pub.json()).profile,false);
 const conflict=await api.selfPATCH(request('/api/profile',{method:'PATCH',body:fields()}));assert.equal(conflict.status,409);assert.equal((await conflict.json()).code,'revision_conflict');
 const stolen=await api.selfPATCH(request('/api/profile',{method:'PATCH',user:'other-user',body:fields()}));assert.equal(stolen.status,409);assert.equal((await stolen.json()).code,'handle_taken');
 assert.equal((await api.selfGET(request('/api/profile?userId=someone'))).status,400);assert.equal((await api.profileGET(request('/api/profiles/test-builder?private=true',{user:null}),{params:Promise.resolve({handle:row.handle})})).status,400);
});

test('private images use exact verified ownership and cannot be accessed by an administrator or another cookie account',async t=>{
 const db=database(t),store=bucket();environment.BUCKET=store;const image=await api.uploadProfileArtwork(db,store,owner,'avatar',avatar,'image/png');
 for(const user of [null,'other-user','reviewer'])assert.equal((await api.imageGET(request('/api/profile-artwork/'+image.id,{user,account:null}),imageContext(image.id))).status,user?404:401);
 const preview=await api.imageGET(request('/api/profile-artwork/'+image.id,{account:null}),imageContext(image.id));assert.equal(preview.status,200);assert.equal(preview.headers.get('cache-control'),'no-store');const head=await api.imageHEAD(request('/api/profile-artwork/'+image.id,{method:'HEAD',account:null}),imageContext(image.id));assert.equal((await head.arrayBuffer()).byteLength,0);
 assert.equal((await api.publicImageGET(request('/media/profile-artwork/'+image.id,{user:null}),imageContext(image.id))).status,404);
 await save(db,{visibility:'public',avatarAssetId:image.id});const publicHead=await api.publicImageHEAD(request('/media/profile-artwork/'+image.id,{method:'HEAD',user:null}),imageContext(image.id));assert.equal(publicHead.status,200);assert.equal((await publicHead.arrayBuffer()).byteLength,0);
});

test('public image requests recheck visibility after storage returns so a simultaneous hide serves no image',async t=>{
 const db=database(t),store=bucket();environment.BUCKET=store;const image=await api.uploadProfileArtwork(db,store,owner,'avatar',avatar,'image/png');await save(db,{visibility:'public',avatarAssetId:image.id});
 const get=store.get;store.get=async key=>{const object=await get(key);db.raw.prepare("UPDATE profiles SET visibility='private',revision=revision+1 WHERE user_id=?").run(owner.userId);return object;};
 const response=await api.publicImageGET(request('/media/profile-artwork/'+image.id,{user:null}),imageContext(image.id));assert.equal(response.status,404);assert.match(response.headers.get('content-type'),/^application\/json(?:;|$)/);assert.equal(response.headers.get('cache-control'),'no-store');
});

test('profile upload API rejects cross-origin, wrong-account and unnormalized media before storing it',async t=>{
 const db=database(t),store=bucket();environment.BUCKET=store;
 const imageRequest=options=>request('/api/profile-artwork?kind=avatar',{method:'POST',headers:{'content-type':'image/png'},body:avatar,...options});
 assert.equal((await api.artworkPOST(imageRequest({account:'stale-user'}))).status,409);assert.equal((await api.artworkPOST(imageRequest({origin:'https://evil.dev'}))).status,403);
 assert.equal((await api.artworkPOST(imageRequest({headers:{'content-type':'image/jpeg'}}))).status,415);assert.equal(store.objects.size,0);
 const uploaded=await api.artworkPOST(imageRequest({}));assert.equal(uploaded.status,201);assert.equal((await api.artworkGET(request('/api/profile-artwork',{account:'stale-user'}))).status,409);
 assert.equal((await(await api.artworkGET(request('/api/profile-artwork'))).json()).artwork.length,1);assert.equal((await(await api.artworkGET(request('/api/profile-artwork',{user:'other-user'}))).json()).artwork.length,0);
});

test('linked Firebase sessions read and edit the existing canonical profile instead of creating a second identity',async t=>{
 const db=database(t);const row=await save(db);db.raw.prepare('INSERT INTO account_links(firebase_uid,legacy_user_id,created_at) VALUES(?,?,?)').run('fixture-firebase-uid',owner.userId,Date.now());
 globalThis.__RMT_PROFILES_TEST_AUTH__={userId:'firebase:fixture:fixture-firebase-uid',firebaseUid:'fixture-firebase-uid',authTime:1,email:'PRIVATE-firebase@rmt.dev',displayName:'PRIVATE Firebase display',emailVerified:true};
 const headers={cookie:'fixture-session=verified-fixture'};const self=await api.selfGET(request('/api/profile',{user:null,account:owner.userId,headers}));assert.equal(self.status,200);assert.equal((await self.json()).profile.handle,row.handle);
 const saved=await api.selfPATCH(request('/api/profile',{method:'PATCH',user:null,account:owner.userId,headers,body:payload(row,{bio:'Saved through the canonical linked account.'})}));assert.equal(saved.status,200);assert.equal(db.raw.prepare('SELECT COUNT(*) AS n FROM profiles').get().n,1);assert.equal(db.raw.prepare('SELECT user_id FROM profiles').get().user_id,owner.userId);
 assert.equal((await api.selfGET(request('/api/profile',{user:null,account:'firebase:fixture:fixture-firebase-uid',headers}))).status,409);
});

test('profile database failures surface errors instead of publishing false profiles or empty success',async t=>{
 database(t);environment.DB={prepare(){throw new Error('Database unavailable');}};assert.equal((await api.selfGET(request('/api/profile'))).status,503);
 const result=await api.profileGET(request('/api/profiles/test-builder',{user:null}),{params:Promise.resolve({handle:'test-builder'})});assert.equal(result.status,503);assert.equal('profile'in await result.json(),false);
});
