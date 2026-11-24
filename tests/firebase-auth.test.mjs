import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFile, readdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {generateKeyPair, SignJWT, exportJWK} from 'jose';
const root = fileURLToPath(new URL('../', import.meta.url));
const environment = {};
globalThis.__RMT_AUTH_TEST_ENV__ = environment;
const compiled = await build({stdin:{contents:`export * from './lib/server/firebase-auth'; export * from './lib/server/runtime'; export {POST as link} from './app/api/auth/link/route'; export {POST as login, DELETE as logout} from './app/api/auth/session/route';`, resolveDir:root, loader:'ts'},absWorkingDir:root,bundle:true,write:false,platform:'node',format:'esm',target:'node24',plugins:[{name:'environment',setup(build){build.onResolve({filter:/^cloudflare:workers$/},()=>({path:'env',namespace:'env'}));build.onLoad({filter:/.*/,namespace:'env'},()=>({contents:'export const env = globalThis.__RMT_AUTH_TEST_ENV__;'}));}}]});
const api = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);
const {privateKey, publicKey} = await generateKeyPair('RS256');
const jwk = {...await exportJWK(publicKey), kid:'test-key', alg:'RS256', use:'sig'};
const originalFetch = globalThis.fetch;
let disabled = false;
globalThis.fetch = async (url) => {
 if (String(url).includes('www.googleapis.com/service_accounts/')) return Response.json({keys:[jwk]},{headers:{'cache-control':'public,max-age=3600'}});
 if (String(url).includes('identitytoolkit.googleapis.com')) return Response.json({users:[{localId:'new-owner',disabled,validSince:'0'}]});
 throw new Error('Unexpected network request');
};
test.after(()=>{globalThis.fetch=originalFetch;});
async function token(extra={}, key=privateKey) {
 return new SignJWT({email:'owner@example.com',email_verified:true,auth_time:Math.floor(Date.now()/1000),...extra}).setProtectedHeader({alg:'RS256',kid:'test-key'}).setSubject('new-owner').setIssuer(extra.iss ?? 'https://securetoken.google.com/rmt-launch-auth-20261124').setAudience(extra.aud ?? 'rmt-launch-auth-20261124').setIssuedAt().setExpirationTime('1h').sign(key);
}
function request(path, body, {legacy, cookie, origin='https://rmt.example',method='POST'}={}) {
 const headers={'content-type':'application/json',origin};
 if(legacy) Object.assign(headers,{'oai-authenticated-user-id':legacy,'oai-authenticated-user-email':'old@example.com'});
 if(cookie) headers.cookie=api.sessionCookie+'='+cookie;
 return new Request('https://rmt.example'+path,{method,headers,...(method==='GET'?{}:{body:JSON.stringify(body)})});
}
// Keep a small D1-compatible adapter around actual SQLite for all migration/link checks.
const sqlite=new DatabaseSync(':memory:');
for(const file of (await readdir(new URL('../drizzle/',import.meta.url))).filter(x=>/^\d.*\.sql$/.test(x)).sort()) sqlite.exec(await readFile(new URL('../drizzle/'+file,import.meta.url),'utf8'));
let beforeLinkInsert=null;
function prepare(sql,params=[]){return {bind(...values){return prepare(sql,values);},async first(){return sqlite.prepare(sql).get(...params)??null;},async all(){return {results:sqlite.prepare(sql).all(...params)};},async run(){if(sql.startsWith('INSERT INTO account_links')&&beforeLinkInsert){const hook=beforeLinkInsert;beforeLinkInsert=null;hook();}return sqlite.prepare(sql).run(...params);}};}
Object.assign(environment,{DB:{prepare},RMT_ADMIN_USER_IDS:'old-owner'});
test.after(()=>sqlite.close());
test('Firebase verifier rejects forged, expired, wrong-project and unverified privilege claims',async()=>{
 assert.equal((await api.verifyFirebaseToken(await token())).firebaseUid,'new-owner');
 await assert.rejects(api.verifyFirebaseToken(await token({aud:'wrong-project'})));
 await assert.rejects(api.verifyFirebaseToken(await token({iss:'https://evil.example'})));
 const forged=await generateKeyPair('RS256');
 await assert.rejects(api.verifyFirebaseToken(await token({},forged.privateKey)));
 const expired=await new SignJWT({email:'x@example.com',auth_time:1}).setProtectedHeader({alg:'RS256',kid:'test-key'}).setSubject('x').setIssuer('https://securetoken.google.com/rmt-launch-auth-20261124').setAudience('rmt-launch-auth-20261124').setIssuedAt(1).setExpirationTime(2).sign(privateKey);
 await assert.rejects(api.verifyFirebaseToken(expired));
 const unverified=await token({email_verified:false,admin:true});
 await assert.rejects(api.requireIdentity(request('/',null,{cookie:unverified,method:'GET'})),e=>e.status===403);
 await assert.rejects(api.requireAdmin(request('/',null,{cookie:unverified,method:'GET'})),e=>e.status===403);
});
test('session creation requires same-origin proof and uses a secure HttpOnly expiring cookie',async()=>{
 const idToken=await token();
 assert.equal((await api.login(request('/api/auth/session',{idToken},{origin:'https://evil.example'}))).status,403);
 assert.equal((await api.login(request('/api/auth/session',{idToken:'forged'}))).status,401);
 const response=await api.login(request('/api/auth/session',{idToken}));
 assert.equal(response.status,200);
 assert.match(response.headers.get('set-cookie'),/__Host-rmt-session=.*HttpOnly; SameSite=Lax; Max-Age=/);
 disabled=true;
 assert.equal((await api.login(request('/api/auth/session',{idToken}))).status,401);
 disabled=false;
 assert.match((await api.logout(request('/api/auth/session',{}, {method:'DELETE'}))).headers.get('set-cookie'),/Max-Age=0/);
});
test('linking cannot orphan a Firebase profile, artwork, update draft, or directly assigned project ownership',async()=>{
 const idToken=await token(),userId='firebase:new-owner';
 const fixtures={
  project_owners:{project_id:'vamps',user_id:userId,status:'active',revision:1,created_at:1,updated_at:1},
  profiles:{user_id:userId,created_at:1,updated_at:1},
  profile_artwork:{id:'profile-link-fixture',user_id:userId,kind:'avatar',object_key:'private-profile-object',mime:'image/png',width:128,height:128,byte_size:123,digest:'fixture',status:'ready',created_at:1},
  project_artwork:{id:'project-link-fixture',project_id:'vamps',user_id:userId,ownership_revision:1,kind:'logo',object_key:'private-project-object',mime:'image/png',width:128,height:128,byte_size:123,digest:'fixture',status:'ready',created_at:1},
  project_updates:{id:'update-link-fixture',project_id:'vamps',project_name:'VAMPS',user_id:userId,ownership_revision:1,kind:'progress',title:'Private saved draft',body:'Unpublished project work must remain in this account.',created_at:1,updated_at:1},
 };
 for(const [table,values] of Object.entries(fixtures)){
  const columns=Object.keys(values);
  sqlite.prepare(`INSERT INTO ${table}(${columns.join(',')}) VALUES(${columns.map(()=>'?').join(',')})`).run(...Object.values(values));
  const before=sqlite.prepare(`SELECT * FROM ${table} WHERE user_id=?`).all(userId);
  const response=await api.link(request('/api/auth/link',{idToken},{legacy:'old-owner'}));
  assert.equal(response.status,409,table);
  assert.match((await response.json()).error,/already has saved activity/);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM account_links').get().n,0);
  assert.deepEqual(sqlite.prepare(`SELECT * FROM ${table} WHERE user_id=?`).all(userId),before);
  assert.equal((await api.requireIdentity(request('/',null,{cookie:idToken,method:'GET'}))).userId,userId);
  sqlite.prepare(`DELETE FROM ${table} WHERE user_id=?`).run(userId);
 }
});
test('linking cannot bypass suspension, delegated-role grants, or activity created during the request',async()=>{
 const idToken=await token(),userId='firebase:new-owner';
 sqlite.prepare("UPDATE control_members SET status='suspended' WHERE user_id=?").run(userId);
 assert.equal((await api.link(request('/api/auth/link',{idToken},{legacy:'old-owner'}))).status,403);
 sqlite.prepare("UPDATE control_members SET status='active' WHERE user_id=?").run(userId);
 sqlite.prepare('INSERT INTO control_roles VALUES(?,?,?,?,?)').run(userId,'admin',1,1,'old-owner');
 assert.equal((await api.link(request('/api/auth/link',{idToken},{legacy:'old-owner'}))).status,409);
 sqlite.prepare('DELETE FROM control_roles WHERE user_id=?').run(userId);
 beforeLinkInsert=()=>sqlite.prepare("UPDATE control_members SET status='suspended' WHERE user_id=?").run(userId);
 assert.equal((await api.link(request('/api/auth/link',{idToken},{legacy:'old-owner'}))).status,409);
 assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM account_links').get().n,0);
 sqlite.prepare("UPDATE control_members SET status='active' WHERE user_id=?").run(userId);
 beforeLinkInsert=()=>sqlite.prepare("INSERT INTO project_owners(project_id,user_id,status,revision,created_at,updated_at) VALUES('vamps',?,'active',1,1,1)").run(userId);
 assert.equal((await api.link(request('/api/auth/link',{idToken},{legacy:'old-owner'}))).status,409);
 assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM account_links').get().n,0);
 assert.equal(sqlite.prepare('SELECT user_id FROM project_owners WHERE project_id=?').get('vamps').user_id,userId);
 sqlite.prepare('DELETE FROM project_owners WHERE user_id=?').run(userId);
});
test('linking requires both identities, fresh verified sign-in and preserves library and exact reviewer access',async()=>{
 const idToken=await token();
 assert.equal((await api.link(request('/api/auth/link',{idToken}))).status,401);
 assert.equal((await api.link(request('/api/auth/link',{idToken:await token({email_verified:false})},{legacy:'old-owner'}))).status,403);
 assert.equal((await api.link(request('/api/auth/link',{idToken:await token({auth_time:1})},{legacy:'old-owner'}))).status,403);
 assert.equal(await api.isAdmin(request('/',null,{cookie:idToken,method:'GET'})),false);
 sqlite.prepare('INSERT INTO saved_projects VALUES (?,?,?)').run('old-owner','vamps',1);
 assert.equal((await api.link(request('/api/auth/link',{idToken},{legacy:'old-owner'}))).status,200);
 const user=await api.requireAdmin(request('/',null,{cookie:idToken,method:'GET'}));
 assert.equal(user.userId,'old-owner');
 assert.equal(sqlite.prepare('SELECT project_id FROM saved_projects WHERE user_id=?').get(user.userId).project_id,'vamps');
 assert.equal((await api.link(request('/api/auth/link',{idToken},{legacy:'different-owner'}))).status,409);
 assert.equal((await api.requireAdmin(request('/',null,{legacy:'old-owner',method:'GET'}))).userId,'old-owner');
});
