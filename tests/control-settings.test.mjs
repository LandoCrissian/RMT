import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFile,readdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';

const root=fileURLToPath(new URL('../',import.meta.url));
const environment={};globalThis.__RMT_SETTINGS_ENV__=environment;
const bundle=await build({stdin:{contents:`
 export {GET as follows} from './app/api/following/route';
 export {GET as count,PUT as follow,DELETE as unfollow} from './app/api/following/[projectId]/route';
 export * from './lib/homepage-art'; export {POST as artPOST} from './app/api/control/homepage-art/route';
 export {GET as artGET,HEAD as artHEAD} from './app/media/homepage-art/[file]/route';
 export * from './lib/control-settings'; export * from './lib/server/control-settings';
 export * from './lib/server/control-analytics'; export * from './lib/server/site-availability';
 export {GET as settingsGET,PATCH as settingsPATCH} from './app/api/control/settings/route';
 export {GET as publicSettingsGET} from './app/api/site-settings/route';
 export {GET as analyticsGET} from './app/api/control/analytics/route';
 export {POST as metricPOST} from './app/api/metrics/route';
 export {reviewAccountScope} from './lib/server/review-scope';
`,resolveDir:root,loader:'ts'},absWorkingDir:root,bundle:true,write:false,platform:'node',format:'esm',target:'node24',plugins:[{name:'settings-runtime',setup(builder){
 builder.onResolve({filter:/^cloudflare:workers$/},()=>({path:'fixture-runtime',namespace:'fixture-runtime'}));
 builder.onLoad({filter:/.*/,namespace:'fixture-runtime'},()=>({contents:'export const env=globalThis.__RMT_SETTINGS_ENV__;'}));
}}]});
const api=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const files=(await readdir(new URL('../drizzle/',import.meta.url))).filter(file=>/^\d.*\.sql$/.test(file)).sort();
const schema=(await Promise.all(files.map(file=>readFile(new URL('../drizzle/'+file,import.meta.url),'utf8')))).join('\n');
const actor={userId:'owner',email:'private@rmt.dev',displayName:'Owner',emailVerified:true,role:'owner',roleRevision:0,capabilities:['settings','health']};
function database(t){
 const raw=new DatabaseSync(':memory:');raw.exec('PRAGMA foreign_keys=ON;');raw.exec(schema);t.after(()=>raw.close());let chain=Promise.resolve();const db={raw,beforeBatch:null};
 function prepare(sql,values=[]){return {bind(...args){return prepare(sql,args);},async first(){return raw.prepare(sql).get(...values)??null;},async all(){return {success:true,results:raw.prepare(sql).all(...values),meta:{changes:0}};},async run(){return {success:true,results:[],meta:{changes:Number(raw.prepare(sql).run(...values).changes)}};}};}
 db.prepare=prepare;db.batch=statements=>{const result=chain.then(async()=>{if(db.beforeBatch){const fn=db.beforeBatch;db.beforeBatch=null;fn();}raw.exec('BEGIN');try{const results=[];for(const statement of statements)results.push(await statement.run());raw.exec('COMMIT');return results;}catch(error){raw.exec('ROLLBACK');throw error;}});chain=result.catch(()=>{});return result;};
 Object.assign(environment,{DB:db,RMT_ADMIN_USER_IDS:'owner'});return db;
}
const input=(changes={})=>({expectedRevision:0,reason:'Owner is updating site operations.',...structuredClone(api.DEFAULT_SITE_SETTINGS),...changes});
function request(path,{method='GET',user='owner',account=user,body,headers={}}={}){
 const h={...headers};if(user){h['oai-authenticated-user-id']=user;h['oai-authenticated-user-email']='private@rmt.dev';}if(account)h['x-rmt-account']=account;
 if(body!==undefined){h.origin='https://rmt.dev';h['content-type']='application/json';}
 return new Request('https://rmt.dev'+path,{method,headers:h,...(body!==undefined?{body:JSON.stringify(body)}:{})});
}
function seedMember(db,id,role='member'){
 db.raw.prepare("INSERT INTO control_members(user_id,email,display_name,status,revision,created_at,updated_at) VALUES(?,'','','active',1,1,1)").run(id);
 if(role!=='member')db.raw.prepare('INSERT INTO control_roles(user_id,role,revision,updated_at,updated_by) VALUES(?,?,1,1,?)').run(id,role,'owner');
}

test('site settings start open with no public owner metadata; validation rejects unsafe links and authority fields',async t=>{
 const db=database(t),settings=await api.siteSettings(db);assert.equal(settings.revision,0);assert.equal(settings.submissionsOpen,true);assert.equal(settings.maintenance.enabled,false);
 assert.deepEqual(Object.keys(api.publicSiteSettings(settings)).sort(),['notice','maintenance','submissionsOpen','claimsOpen','updatesOpen'].sort());
 for(const changes of [{adminId:'attacker'},{notice:{enabled:true,text:'Valid message',linkLabel:'Click',linkUrl:'javascript:alert(1)'}},{claimsOpen:'true'},{notice:{enabled:true,text:'',linkLabel:'',linkUrl:''}}])assert.throws(()=>api.validateSiteSettings({...structuredClone(api.DEFAULT_SITE_SETTINGS),...changes}));
});
test('concurrent settings changes have one winner and exactly one audit record',async t=>{
 const db=database(t);const result=await Promise.allSettled([api.changeSiteSettings(db,actor,input({claimsOpen:false})),api.changeSiteSettings(db,actor,input({submissionsOpen:false}))]);
 assert.equal(result.filter(item=>item.status==='fulfilled').length,1);assert.equal(result.find(item=>item.status==='rejected').reason.status,409);
 assert.equal(db.raw.prepare('SELECT COUNT(*) n FROM control_audit_events').get().n,1);assert.equal((await api.siteSettings(db)).revision,1);
});
test('revoked delegated permission cannot change settings or leave an audit event',async t=>{
 const db=database(t);seedMember(db,'admin','admin');const admin={...actor,userId:'admin',role:'admin',roleRevision:1};
 db.beforeBatch=()=>db.raw.exec("UPDATE control_roles SET role='member',revision=2 WHERE user_id='admin'");
 await assert.rejects(api.changeSiteSettings(db,admin,input()),error=>error.status===409);assert.equal((await api.siteSettings(db)).revision,0);assert.equal(db.raw.prepare('SELECT COUNT(*) n FROM control_audit_events').get().n,0);
});
test('private settings require current administrator identity and same-origin writes; public settings stay minimal',async t=>{
 database(t);
 assert.equal((await api.settingsGET(request('/api/control/settings',{user:null}))).status,401);
 assert.equal((await api.settingsGET(request('/api/control/settings',{user:'member'}))).status,403);
 assert.equal((await api.settingsGET(request('/api/control/settings',{account:'other'}))).status,409);
 const noOrigin=new Request('https://rmt.dev/api/control/settings',{method:'PATCH',headers:{'oai-authenticated-user-id':'owner','oai-authenticated-user-email':'private@rmt.dev','x-rmt-account':'owner','content-type':'application/json'},body:JSON.stringify(input())});
 assert.equal((await api.settingsPATCH(noOrigin)).status,403);
 assert.equal((await api.settingsPATCH(request('/api/control/settings',{method:'PATCH',body:input()}))).status,200);
 const response=await api.publicSettingsGET();assert.equal(response.headers.get('cache-control'),'no-store');const body=await response.json();assert.equal('updatedBy'in body.settings,false);assert.equal('revision'in body.settings,false);assert.equal(JSON.stringify(body).includes('private@'),false);
});
test('intake switches pause submissions independently and retain saved work',async t=>{
 const db=database(t);await api.changeSiteSettings(db,actor,input({submissionsOpen:false}));
 await assert.rejects(api.requireCommunityIntake(db,'submissions'),error=>error.status===503);
 await api.requireCommunityIntake(db,'claims');await api.requireCommunityIntake(db,'updates');
 await api.changeSiteSettings(db,actor,input({expectedRevision:1,maintenance:{enabled:true,message:'We are making improvements. Please return soon.'}}));
 for(const kind of ['submissions','claims','updates'])await assert.rejects(api.requireCommunityIntake(db,kind),error=>error.status===503);
});
test('maintenance keeps recovery, account and control routes reachable and serves honest non-cached downtime',async t=>{
 const db=database(t);await api.changeSiteSettings(db,actor,input({maintenance:{enabled:true,message:'<script>private markup must stay plain</script>'}}));
 for(const path of ['/','/api/session','/api/site-settings','/api/auth/session','/api/control/settings','/api/admin/submissions','/mcp','/projects/vamps.png','/projects/%76amps.png','/assets/bundle.js'])assert.equal(api.maintenanceProtectedPath(path,'GET'),false,path);
 const hidden=await api.maintenanceResponse(request('/projects/vamps',{user:null}),db);assert.equal(hidden.status,503);assert.equal(hidden.headers.get('cache-control'),'no-store');const text=await hidden.text();assert.equal(text.includes('<script>'),false);assert.ok(text.includes('href="/#account"'));
 assert.equal((await api.maintenanceResponse(request('/api/catalog',{user:null}),db)).status,503);
 for(const path of ['/projects/%76amps','/u/%72mt']){assert.equal(api.maintenanceProtectedPath(path,'GET'),true,path);const response=await api.maintenanceResponse(request(path,{user:null}),db);assert.equal(response.status,503,path);assert.equal(response.headers.get('cache-control'),'no-store');}
 assert.equal(api.normalizedRoutePath('/projects/%zz'),'/projects/%zz');assert.equal(await api.maintenanceResponse(request('/projects/%zz',{user:null}),db),null,'Malformed slug is left for the router to reject');
 assert.equal(await api.maintenanceResponse(request('/api/catalog'),db),null,'Owner can inspect the site during maintenance');
});
test('aggregate analytics deduplicate daily sessions without storing account, raw session ID or visited URLs',async t=>{
 const db=database(t),now=Date.parse('2026-11-24T20:00:00Z'),sessionId=crypto.randomUUID();
 await api.recordMetric(db,api.validateMetric({kind:'visit',sessionId}),now);await api.recordMetric(db,{kind:'visit',sessionId,projectId:''},now);
 await api.recordMetric(db,{kind:'project_view',sessionId,projectId:'vamps'},now);await api.recordMetric(db,{kind:'outbound',sessionId,projectId:'vamps'},now);
 const metrics=await api.controlAnalytics(db,7,now);assert.equal(metrics.visits,1);assert.equal(metrics.projectViews,1);assert.equal(metrics.outboundClicks,1);assert.equal(metrics.daily.length,7);assert.equal(metrics.projects[0].name,'VAMPS');
 const serialized=JSON.stringify(db.raw.prepare('SELECT * FROM control_metric_events').all());for(const value of [sessionId,'private@','https://'])assert.equal(serialized.includes(value),false);
 assert.match(metrics.note,/not individual people/);
});
test('measurement retention is limited and unavailable projects cannot accumulate new counts',async t=>{
 const db=database(t),now=Date.parse('2026-11-24T20:00:00Z'),sessionId=crypto.randomUUID();
 await api.recordMetric(db,{kind:'visit',sessionId,projectId:''},now-31*86400000);await api.recordMetric(db,{kind:'visit',sessionId,projectId:''},now);
 assert.equal(db.raw.prepare('SELECT COUNT(*) n FROM control_metric_events').get().n,1);
 await assert.rejects(api.recordMetric(db,{kind:'project_view',sessionId,projectId:'missing-project'},now),error=>error.status===404);
 for(const item of [{kind:'visit',sessionId,email:'private@rmt.dev'},{kind:'visit',sessionId:'not-a-session'},{kind:'outbound',sessionId,projectId:''}])assert.throws(()=>api.validateMetric(item));
});
test('browser privacy preferences suppress measurements and analytics remains admin-only',async t=>{
 const db=database(t);const body={kind:'visit',sessionId:crypto.randomUUID()};
 for(const headers of [{dnt:'1'},{'sec-gpc':'1'}])assert.equal((await api.metricPOST(request('/api/metrics',{method:'POST',user:null,body,headers}))).status,200);
 assert.equal(db.raw.prepare('SELECT COUNT(*) n FROM control_metric_events').get().n,0);
 assert.equal((await api.analyticsGET(request('/api/control/analytics?days=7',{user:null}))).status,401);
 assert.equal((await api.analyticsGET(request('/api/control/analytics?days=90'))).status,400);
 assert.equal((await api.analyticsGET(request('/api/control/analytics?days=7'))).status,200);
});
test('review scope catches account switching while retaining compatibility with already-open review tabs',()=>{
 api.reviewAccountScope(new Request('https://rmt.dev'),'owner');
 assert.throws(()=>api.reviewAccountScope(new Request('https://rmt.dev',{headers:{'x-rmt-account':'other'}}),'owner'),error=>error.status===409);
});

test('homepage artwork uses validated content-addressed uploads, authenticated selection and immutable public bytes',async t=>{
 const db=database(t),objects=new Map();
 environment.BUCKET={
   async put(k,b){objects.set(k,b);},
   async head(k){return objects.has(k)?{size:objects.get(k).byteLength,httpEtag:'"test"'}:null;},
   async get(k){const meta=await this.head(k);return meta?{...meta,body:objects.get(k)}:null;},
 };
 const sharp=(await import('sharp')).default;
 const pixels=await sharp({create:{width:1200,height:630,channels:3,background:'#080808'}}).png().toBuffer();
 const upload=(body,owner)=>api.artPOST(new Request('https://rmt.dev/api/control/homepage-art',{method:'POST',headers:{
  origin:'https://rmt.dev','content-type':'image/png',...(owner?{'oai-authenticated-user-id':'owner','oai-authenticated-user-email':'private@rmt.dev','x-rmt-account':'owner'}:{})
 },body}));
 assert.equal((await upload(pixels,false)).status,401);
 assert.equal((await upload(await sharp(pixels).resize(1000,500).png().toBuffer(),true)).status,400);
 const uploaded=await upload(pixels,true);assert.equal(uploaded.status,201);
 const {path}=await uploaded.json(),file=path.split('/').pop();assert.match(file,/^[a-f0-9]{64}\.png$/);
 const ctx={params:Promise.resolve({file})};
 const response=await api.artGET(new Request('https://rmt.dev'+path),ctx);
 const bytes=Buffer.from(await response.arrayBuffer());
 assert.equal(file,(await import('node:crypto')).createHash('sha256').update(bytes).digest('hex')+'.png');
 assert.equal(response.headers.get('content-type'),'image/png');assert.match(response.headers.get('cache-control'),/immutable/);
 assert.equal((await api.artHEAD(new Request('https://rmt.dev'+path),ctx)).body,null);
 assert.equal((await api.siteSettings(db)).homepageArtwork,api.flagship);
 assert.throws(()=>api.homepageArtwork('https://outside.example/card.png'));
 await assert.rejects(api.changeSiteSettings(db,actor,input({homepageArtwork:api.artworkPrefix+'f'.repeat(64)+'.png'})));
 await api.changeSiteSettings(db,actor,input({homepageArtwork:path}));
 const saved=await api.changeSiteSettings(db,actor,input({expectedRevision:1}));
 assert.equal(saved.homepageArtwork,path,'legacy settings clients preserve the selected image');
 const meta=api.homepageMetadata(saved.homepageArtwork);
 assert.equal(meta.openGraph.images[0].url,'https://rmtlaunch.fun'+path);
 assert.deepEqual(meta.twitter.images,meta.openGraph.images);assert.equal(meta.twitter.card,'summary_large_image');
});

test('project follows are private, idempotent, account-bound and separate from saved projects',async t=>{
 const db=database(t),ctx={params:Promise.resolve({projectId:'vamps'})},path='/api/following/vamps';
 const change=(fn,user,extra={})=>fn(request(path,{method:fn===api.follow?'PUT':'DELETE',user,body:{},...extra}),ctx);
 const count=async()=> (await api.count(request(path,{user:null}),ctx)).json();
 assert.deepEqual(await count(),{count:0});
 assert.equal((await change(api.follow,null)).status,401);
 assert.equal((await change(api.follow,'member',{account:'other'})).status,409);
 assert.equal((await change(api.follow,'member',{body:{userId:'other'}})).status,400);
 const foreign=request(path,{method:'PUT',user:'member',body:{}});foreign.headers.set('origin','https://elsewhere.example');
 assert.equal((await api.follow(foreign,ctx)).status,403);
 const both=await Promise.all([change(api.follow,'member'),change(api.follow,'member')]);
 assert.deepEqual(both.map(r=>r.status),[200,200]);assert.deepEqual(await count(),{count:1});
 assert.deepEqual(await (await api.follows(request('/api/following',{user:'other'}))).json(),{projectIds:[]});
 assert.deepEqual(await (await api.follows(request('/api/following',{user:'member'}))).json(),{projectIds:['vamps']});
 assert.equal(db.raw.prepare('SELECT count(*) n FROM saved_projects').get().n,0);
 const admin=await api.controlAnalytics(db,7);assert.equal(admin.currentFollows,1);assert.equal(admin.followingMembers,1);
 assert.equal((await api.analyticsGET(request('/api/control/analytics',{user:'member'}))).status,403);
 db.raw.prepare("UPDATE control_members SET status='suspended' WHERE user_id='member'").run();
 assert.deepEqual(await count(),{count:0});assert.equal((await change(api.follow,'member')).status,403);
 db.raw.prepare("UPDATE control_members SET status='active' WHERE user_id='member'").run();
 assert.equal((await change(api.unfollow,'other')).status,200);assert.deepEqual(await count(),{count:1});
 assert.equal((await change(api.unfollow,'member')).status,200);assert.equal((await change(api.unfollow,'member')).status,200);
 assert.deepEqual(await count(),{count:0});
 assert.equal((await api.count(request(path,{user:null}),{params:Promise.resolve({projectId:'missing-project'})})).status,404);
});
