import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFile,readdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import sharp from 'sharp';
const root=fileURLToPath(new URL('../',import.meta.url)),environment={};globalThis.__CONTROL_ARTWORK_ENV__=environment;
const bundled=await build({stdin:{contents:`
 export * from './lib/server/control-artwork'; export * from './lib/server/control-projects';
 export * from './lib/server/repository'; export * from './lib/server/project-edits'; export * from './lib/server/project-artwork';
 export * from './lib/project-sharing'; export {publicActivityPage} from './lib/client/activity';
 export {publicProfileResponse} from './lib/client/profiles';
 export {InputError,validateProjectEdit} from './lib/submission-validation';
 export {GET as listGET,POST as uploadPOST} from './app/api/control/artwork/route';
 export {GET as privateGET} from './app/api/control/artwork/[id]/route';
 export {GET as publicGET} from './app/media/control-project-artwork/[id]/route';
`,resolveDir:root,loader:'ts'},absWorkingDir:root,bundle:true,write:false,format:'esm',platform:'node',target:'node24',plugins:[{name:'runtime',setup(b){b.onResolve({filter:/^cloudflare:workers$/},()=>({path:'env',namespace:'test'}));b.onLoad({filter:/.*/,namespace:'test'},()=>({contents:'export const env=globalThis.__CONTROL_ARTWORK_ENV__;'}));}}]});
const api=await import('data:text/javascript;base64,'+Buffer.from(bundled.outputFiles[0].text).toString('base64'));
const migrations=(await readdir(new URL('../drizzle/',import.meta.url))).filter(v=>/^\d.*\.sql$/.test(v)).sort(),schema=(await Promise.all(migrations.map(v=>readFile(new URL('../drizzle/'+v,import.meta.url),'utf8')))).join('\n');
const logoBytes=await sharp({create:{width:128,height:128,channels:4,background:'#c6ff42'}}).png().toBuffer(),bannerBytes=await sharp({create:{width:1200,height:630,channels:3,background:'#23282e'}}).png().toBuffer();
const actor={userId:'owner',email:'owner@rmt.dev',emailVerified:true,displayName:'Owner',role:'owner',roleRevision:0,capabilities:['projects','content']};
const reject=status=>error=>error instanceof api.InputError&&error.status===status;
function database(t){const raw=new DatabaseSync(':memory:');raw.exec('PRAGMA foreign_keys=ON;');raw.exec(schema);t.after(()=>raw.close());let chain=Promise.resolve();const db={raw,beforeBatch:null};function prepare(sql,values=[]){return{bind(...v){return prepare(sql,v);},async first(){return raw.prepare(sql).get(...values)??null;},async all(){return{results:raw.prepare(sql).all(...values),success:true,meta:{changes:0}};},async run(){return{results:[],success:true,meta:{changes:Number(raw.prepare(sql).run(...values).changes)}};}};}db.prepare=prepare;db.batch=statements=>{const result=chain.then(async()=>{if(db.beforeBatch){const h=db.beforeBatch;db.beforeBatch=null;h();}raw.exec('BEGIN');try{const out=[];for(const s of statements)out.push(await s.run());raw.exec('COMMIT');return out;}catch(e){raw.exec('ROLLBACK');throw e;}});chain=result.catch(()=>{});return result;};for(const key of Object.keys(environment))delete environment[key];Object.assign(environment,{DB:db,RMT_ADMIN_USER_IDS:'owner'});return db;}
function bucket(){const objects=new Map();return{objects,async put(key,bytes){objects.set(key,Uint8Array.from(bytes));},async delete(key){objects.delete(key);},async get(key){const data=objects.get(key);return data?{size:data.length,body:new Response(data).body}:null;}};}
function member(db,id='delegate'){db.raw.prepare("INSERT INTO control_members(user_id,created_at,updated_at) VALUES(?,?,?)").run(id,Date.now(),Date.now());}
function delegated(db){member(db);db.raw.prepare("INSERT INTO control_roles(user_id,role,revision,updated_at,updated_by) VALUES('delegate','admin',1,?,'owner')").run(Date.now());return{...actor,userId:'delegate',role:'admin',roleRevision:1};}
async function upload(db,store,kind='banner',projectId='vamps',user=actor){return api.uploadControlArtwork(db,store,user,projectId,kind,kind==='banner'?bannerBytes:logoBytes,'image/png');}
async function change(db,id,fields,user=actor){const item=await api.controlProject(db,id);return api.changeControlProject(db,user,id,api.validateChangeControlProject({expectedRevision:item.revision,expectedListingRevision:item.listingRevision,reason:'Reviewed the current project artwork.',...fields},id));}
function request(path,{method='GET',user='owner',account=user,origin='https://rmt.dev',body,mime='image/png'}={}){const headers={};if(user){headers['oai-authenticated-user-id']=user;headers['oai-authenticated-user-email']=user+'@rmt.dev';}if(account)headers['x-rmt-account']=account;if(method!=='GET'){headers['content-type']=mime;headers.origin=origin;}return new Request('https://rmt.dev'+path,{method,headers,...(body===undefined?{}:{body})});}
function builder(db){member(db,'builder');db.raw.prepare("INSERT INTO project_owners(project_id,user_id,status,revision,created_at,updated_at) VALUES('vamps','builder','active',1,?,?)").run(Date.now(),Date.now());return{userId:'builder',email:'builder@rmt.dev',displayName:'Builder',emailVerified:true};}
function edit(baseRevision=0,extra={}){return api.validateProjectEdit({projectId:'vamps',baseRevision,summary:'The builder has updated this project with new tools and community details.',category:'Games',stage:'live',website:'https://vamps.wtf',launchUrl:'https://games.vamps.wtf',xProfile:'',links:[],...extra});}
async function approve(db,change){return api.reviewProjectEdit(db,'owner',change.id,{action:'approve',expectedRevision:change.revision,note:'Checked project details and artwork.'});}

test('presentation changes publish only selected project assets and leave ownership and spotlight intact', async t => {
 const db=database(t), store=bucket(), id='moneymomos';
 const before=await api.findPublicProject(db,id), destination=before.links[0].url;
 const asset=await upload(db,store,'banner',id), hero='/media/control-project-artwork/'+asset.id;
 const other=await upload(db,store,'banner','vamps');
 const save=presentation=>change(db,id,{action:'presentation',presentation});
 await assert.rejects(save({hero:'/media/control-project-artwork/'+other.id}),reject(404));
 await assert.rejects(save({hero:'https://example.org/unreviewed.png'}),reject(400));
 await assert.rejects(save({labels:{'https://example.org':'Unlisted destination'}}),reject(400));
 const settings={shortDescription:'Reviewed showcase text.',hero,labels:{[destination]:'Reviewed label'},supporting:{[destination]:hero},accent:'#ad7760',cardStyle:'portrait',cardMode:'project'};
 const saved=await save(settings);
 assert.deepEqual(saved.project.presentation,settings);
 assert.deepEqual(await api.findPublicProject(db,id),{...before,presentation:settings});
 assert.equal((await api.publicControlArtworkRow(db,asset.id)).project_id,id);
 await assert.rejects(change(db,id,{action:'presentation',presentation:{},expectedRevision:saved.revision-1}),reject(409));
 await change(db,id,{action:'visibility',visibility:'hidden'});
 await assert.rejects(api.publicControlArtworkRow(db,asset.id),reject(404));
 await change(db,id,{action:'visibility',visibility:'public'});
 await save({});
 assert.deepEqual(await api.findPublicProject(db,id),before);
 await assert.rejects(api.publicControlArtworkRow(db,asset.id),reject(404));
 assert.equal(db.raw.prepare("SELECT count(*) AS n FROM control_audit_events WHERE action='project.presentation'").get().n,2);
});

test('administrator uploads stay private until explicitly selected, retain uploader attribution, and publish exact share artwork',async t=>{
 const db=database(t),store=bucket(),asset=await upload(db,store);
 const row=await api.privateControlArtworkRow(db,actor,asset.id);assert.equal(row.uploader_id,'owner');assert.equal(db.raw.prepare('SELECT COUNT(*) AS n FROM project_owners').get().n,0);
 assert.equal(asset.previewUrl,'/api/control/artwork/'+asset.id);assert.equal(JSON.stringify(asset).includes('object_key'),false);assert.equal(JSON.stringify(asset).includes('uploader_id'),false);
 await assert.rejects(api.publicControlArtworkRow(db,asset.id),reject(404));assert.equal((await api.findPublicProject(db,'vamps')).artwork,undefined);
 const saved=await change(db,'vamps',{action:'artwork',logoAssetId:null,bannerAssetId:asset.id});assert.equal(saved.artworkOverride,true);assert.equal(saved.bannerAssetId,asset.id);
 const project=await api.findPublicProject(db,'vamps');assert.equal(project.cover,'/media/control-project-artwork/'+asset.id);assert.equal(api.shareCardPlan(project).art,project.cover);assert.match(api.projectMetadata(project).openGraph.images[0].url,/\/media\/share-card\/vamps\?v=4-/);
 environment.BUCKET=store;const response=await api.publicGET(new Request('https://rmt.dev'+project.cover),{params:Promise.resolve({id:asset.id})});assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(response.headers.get('content-type'),'image/png');assert.deepEqual(Buffer.from(await response.arrayBuffer()),Buffer.from(store.objects.get(row.object_key)));
 assert.equal(db.raw.prepare("SELECT COUNT(*) AS n FROM control_audit_events WHERE action='project.artwork_upload'").get().n,1);assert.equal(db.raw.prepare("SELECT COUNT(*) AS n FROM control_audit_events WHERE action='project.artwork'").get().n,1);
});

test('administrator media routes reject guests, moderators, account mismatches and cross-origin uploads',async t=>{
 const db=database(t);environment.BUCKET=bucket();member(db,'moderator');db.raw.prepare("INSERT INTO control_roles(user_id,role,revision,updated_at,updated_by) VALUES('moderator','moderator',1,?,'owner')").run(Date.now());
 for(const [user,account,status]of[[null,null,401],['visitor','visitor',403],['moderator','moderator',403],['owner','wrong',409]])assert.equal((await api.listGET(request('/api/control/artwork?projectId=vamps',{user,account}))).status,status);
 assert.equal((await api.uploadPOST(request('/api/control/artwork?projectId=vamps&kind=logo',{method:'POST',origin:'https://wrong.dev',body:logoBytes}))).status,403);
 assert.equal((await api.uploadPOST(request('/api/control/artwork?projectId=vamps&kind=logo',{method:'POST',mime:'image/svg+xml',body:logoBytes}))).status,415);
 assert.equal((await api.uploadPOST(request('/api/control/artwork?projectId=vamps&kind=logo&kind=banner',{method:'POST',body:logoBytes}))).status,400);
 const response=await api.uploadPOST(request('/api/control/artwork?projectId=vamps&kind=logo',{method:'POST',body:logoBytes}));assert.equal(response.status,201);const {artwork}=await response.json();
 assert.equal((await api.privateGET(request(artwork.previewUrl,{account:'wrong'}),{params:Promise.resolve({id:artwork.id})})).status,409);
 assert.equal((await api.privateGET(request(artwork.previewUrl),{params:Promise.resolve({id:artwork.id})})).status,200);
});

test('admin selection rejects cross-project, wrong-slot, unready assets and stale publication revisions',async t=>{
 const db=database(t),store=bucket(),logo=await upload(db,store,'logo'),banner=await upload(db,store),otherId=(await api.catalog(db)).projects.find(p=>p.id!=='vamps').id,other=await upload(db,store,'logo',otherId);
 for(const fields of[{logoAssetId:other.id,bannerAssetId:banner.id},{logoAssetId:banner.id,bannerAssetId:null},{logoAssetId:logo.id,bannerAssetId:logo.id}])await assert.rejects(change(db,'vamps',{action:'artwork',...fields}),reject(404));
 db.beforeBatch=()=>db.raw.prepare("UPDATE control_project_artwork SET status='failed' WHERE id=?").run(banner.id);
 await assert.rejects(change(db,'vamps',{action:'artwork',logoAssetId:logo.id,bannerAssetId:banner.id}),reject(409));assert.equal(db.raw.prepare("SELECT COUNT(*) AS n FROM control_audit_events WHERE action='project.artwork'").get().n,0);
 await change(db,'vamps',{action:'artwork',logoAssetId:logo.id,bannerAssetId:null});
 await assert.rejects(api.changeControlProject(db,actor,'vamps',{action:'reset_artwork',expectedRevision:0,expectedListingRevision:0,reason:'Reset stale selected artwork.'}),reject(409));
 assert.equal((await api.findPublicProject(db,'vamps')).artwork.logo.id,logo.id);
});

test('builder edits preserve admin selection, older forms normalize its exact image, reset restores reviewed builder artwork',async t=>{
 const db=database(t),store=bucket(),user=builder(db),builderAsset=await api.uploadProjectArtwork(db,store,user,'vamps','banner',bannerBytes,'image/png');
 await approve(db,await api.createProjectEdit(db,user,edit(0,{bannerAssetId:builderAsset.id})));
 const adminAsset=await upload(db,store),privateAdmin=await upload(db,store);await change(db,'vamps',{action:'artwork',logoAssetId:null,bannerAssetId:adminAsset.id});
 await assert.rejects(api.publicArtworkRow(db,builderAsset.id),reject(404));const owned=(await api.ownedProjects(db,'builder')).projects[0];assert.equal(owned.artworkOverride,true);assert.equal(owned.bannerAssetId,builderAsset.id);
 await assert.rejects(api.createProjectEdit(db,user,edit(1,{bannerAssetId:privateAdmin.id})),reject(404));
 const legacyEdit=await api.createProjectEdit(db,user,edit(1,{bannerAssetId:adminAsset.id}));assert.equal(legacyEdit.bannerAssetId,builderAsset.id);await approve(db,legacyEdit);
 assert.equal((await api.findPublicProject(db,'vamps')).artwork.banner.id,adminAsset.id);
 await change(db,'vamps',{action:'reset_artwork'});assert.equal((await api.findPublicProject(db,'vamps')).artwork.banner.id,builderAsset.id);await assert.rejects(api.publicControlArtworkRow(db,adminAsset.id),reject(404));assert.equal((await api.publicArtworkRow(db,builderAsset.id)).id,builderAsset.id);
});

test('hidden projects can stage private admin artwork and hidden or replaced images cannot be served publicly',async t=>{
 const db=database(t),store=bucket();await change(db,'vamps',{action:'visibility',visibility:'hidden'});const first=await upload(db,store),second=await upload(db,store);
 await change(db,'vamps',{action:'artwork',logoAssetId:null,bannerAssetId:first.id});await assert.rejects(api.publicControlArtworkRow(db,first.id),reject(404));assert.equal((await api.controlArtworkList(db,actor,'vamps')).length,2);
 await change(db,'vamps',{action:'visibility',visibility:'public'});assert.equal((await api.publicControlArtworkRow(db,first.id)).id,first.id);
 await change(db,'vamps',{action:'artwork',logoAssetId:null,bannerAssetId:second.id});await assert.rejects(api.publicControlArtworkRow(db,first.id),reject(404));
 const get=store.get;store.get=async key=>{const result=await get(key);await change(db,'vamps',{action:'visibility',visibility:'hidden'});return result;};environment.BUCKET=store;
 assert.equal((await api.publicGET(new Request('https://rmt.dev/media/control-project-artwork/'+second.id),{params:Promise.resolve({id:second.id})})).status,404);
});

test('revoked delegated access during storage leaves no ready image or successful upload audit and removes object',async t=>{
 const db=database(t),store=bucket(),delegate=delegated(db),put=store.put;store.put=async(...args)=>{await put(...args);db.raw.exec("UPDATE control_roles SET role='member',revision=2 WHERE user_id='delegate'");};
 await assert.rejects(upload(db,store,'logo','vamps',delegate),reject(409));assert.equal(store.objects.size,0);assert.equal(db.raw.prepare('SELECT status FROM control_project_artwork').get().status,'failed');assert.equal(db.raw.prepare("SELECT COUNT(*) AS n FROM control_audit_events WHERE action='project.artwork_upload'").get().n,0);
});

test('private preview and selection recheck delegated role during the read or mutation',async t=>{
 const db=database(t),store=bucket(),delegate=delegated(db),asset=await upload(db,store);
 db.beforeBatch=()=>db.raw.exec("UPDATE control_roles SET role='member',revision=2 WHERE user_id='delegate'");await assert.rejects(change(db,'vamps',{action:'artwork',logoAssetId:null,bannerAssetId:asset.id},delegate),reject(409));
 db.raw.exec("UPDATE control_roles SET role='admin',revision=3 WHERE user_id='delegate'");const get=store.get;store.get=async key=>{const result=await get(key);db.raw.exec("UPDATE control_roles SET role='member',revision=4 WHERE user_id='delegate'");return result;};environment.BUCKET=store;
 assert.equal((await api.privateGET(request('/api/control/artwork/'+asset.id,{user:'delegate'}),{params:Promise.resolve({id:asset.id})})).status,404);
 assert.equal(db.raw.prepare("SELECT COUNT(*) AS n FROM control_audit_events WHERE action='project.artwork'").get().n,0);
});

test('concurrent admin uploads enforce a bounded 32-image daily reservation without impersonating project owners',async t=>{
 const db=database(t),store=bucket();for(let i=0;i<31;i++)db.raw.prepare("INSERT INTO control_project_artwork(id,project_id,uploader_id,object_key,kind,mime,width,height,byte_size,digest,status,created_at) VALUES(?,'vamps','owner',?,'logo','image/png',128,128,1,'digest','failed',?)").run('existing-'+i,'old-key-'+i,Date.now());
 const results=await Promise.allSettled([upload(db,store,'logo'),upload(db,store,'logo'),upload(db,store,'logo')]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);for(const result of results.filter(r=>r.status==='rejected'))assert.equal(result.reason.status,429);
 assert.equal(store.objects.size,1);assert.equal(db.raw.prepare('SELECT COUNT(*) AS n FROM project_artwork').get().n,0);
});

test('bounded private artwork lists retain selected older logo and banner before recent staged images',async t=>{
 const db=database(t),store=bucket(),logo=await upload(db,store,'logo'),banner=await upload(db,store);
 await change(db,'vamps',{action:'artwork',logoAssetId:logo.id,bannerAssetId:banner.id});
 const insert=db.raw.prepare("INSERT INTO control_project_artwork(id,project_id,uploader_id,object_key,kind,mime,width,height,byte_size,digest,status,created_at) VALUES(?,?,'owner',?,'logo','image/png',128,128,1,'digest','ready',?)");
 for(let i=0;i<65;i++){const id=crypto.randomUUID();insert.run(id,'vamps','recent-'+id,Date.now()+1000+i);}
 const otherId=(await api.catalog(db)).projects.find(project=>project.id!=='vamps').id,otherAssetId=crypto.randomUUID();insert.run(otherAssetId,otherId,'other-project-image',Date.now()+9999);
 const rows=await api.controlArtworkList(db,actor,'vamps');assert.equal(rows.length,60);assert.deepEqual(new Set(rows.slice(0,2).map(row=>row.id)),new Set([logo.id,banner.id]));assert.equal(rows.some(row=>row.id===otherAssetId),false);
 assert.equal((await api.controlProject(db,'vamps')).bannerAssetId,banner.id);
});

test('public activity, profile and share parsers accept only exact public admin image paths',async t=>{
 const db=database(t),store=bucket(),asset=await upload(db,store);await change(db,'vamps',{action:'artwork',logoAssetId:null,bannerAssetId:asset.id});const project=await api.findPublicProject(db,'vamps');
 const page={items:[{id:'listing-vamps',kind:'listing',publishedAt:Date.now(),title:project.name,body:'',linkLabel:'',linkUrl:'',updateId:null,project}],nextCursor:null,hasMore:false};assert.equal(api.publicActivityPage(page).items[0].project.artwork.banner.id,asset.id);
 const profile={profile:{handle:'test-builder',displayName:'Test builder',bio:'',links:[],avatar:null,banner:null,managedProjects:[project],isBuilder:true}};assert.equal(api.publicProfileResponse(profile).managedProjects[0].cover,project.cover);
 const bad={...project,cover:'/api/control/artwork/'+asset.id};assert.throws(()=>api.publicActivityPage({...page,items:[{...page.items[0],project:bad}]}));assert.throws(()=>api.publicProfileResponse({profile:{...profile.profile,managedProjects:[bad]}}));
 const misleading={...project,artwork:{banner:{...project.artwork.banner,url:'/media/control-project-artwork/another-id'}}};assert.equal(api.projectSocialImagePath(misleading),'/social/rmt-'+api.SOCIAL_IMAGE_VERSION+'.jpg');assert.throws(()=>api.publicActivityPage({...page,items:[{...page.items[0],project:misleading}]}));
});
test('a spotlight banner belongs to its project and is public only while selected on a visible spotlight', async t=>{
  const db=database(t), store=bucket();
  const banner=await upload(db,store);
  const original=(await api.findPublicProject(db,'vamps'));
  const spotlight={position:1,headline:'After hours',description:'Explore the project.',cta:'Explore VAMPS',accent:'#C23C55',artwork:banner.id};
  await assert.rejects(change(db,'lammbs',{action:'spotlight',featured:true,spotlight}),reject(404));
  await assert.rejects(api.publicControlArtworkRow(db,banner.id),reject(404));
  await change(db,'vamps',{action:'spotlight',featured:true,spotlight});
  assert.equal((await api.publicControlArtworkRow(db,banner.id)).id,banner.id);
  const current=await api.findPublicProject(db,'vamps');
  assert.equal(api.projectSocialImagePath(current),api.projectSocialImagePath(original));
  assert.equal(current.cover,original.cover);
  await change(db,'vamps',{action:'visibility',visibility:'hidden'});
  await assert.rejects(api.publicControlArtworkRow(db,banner.id),reject(404));
  await change(db,'vamps',{action:'visibility',visibility:'public'});
  await change(db,'vamps',{action:'spotlight',featured:false,spotlight});
  await assert.rejects(api.publicControlArtworkRow(db,banner.id),reject(404));
});
