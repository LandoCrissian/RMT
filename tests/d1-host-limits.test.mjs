import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {readFile,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';

// Python 3.11+ exposes sqlite3_limit; Node's SQLite adapter does not. The CI
// Ubuntu runner includes Python. Exercise actual SQL with D1's tighter limits,
// not a text-based approximation of how many SELECT tokens a query contains.
const runner=String.raw`
import json,sqlite3,sys
request=json.load(sys.stdin)
db=sqlite3.connect(request['path'])
db.row_factory=sqlite3.Row
db.setlimit(sqlite3.SQLITE_LIMIT_COMPOUND_SELECT,5)
db.setlimit(sqlite3.SQLITE_LIMIT_LIKE_PATTERN_LENGTH,50)
db.execute('PRAGMA foreign_keys=ON')
def statement(item):
    cursor=db.execute(item['sql'],item.get('args',[]))
    rows=[dict(row) for row in cursor.fetchall()] if cursor.description else []
    return {'success':True,'results':rows,'meta':{'changes':max(0,cursor.rowcount)}}
try:
    if request['op']=='script':
        db.executescript(request['sql'])
        result=None
    elif request['op']=='batch':
        db.execute('BEGIN')
        result=[statement(item) for item in request['statements']]
    else:
        result=statement(request)
    db.commit()
    print(json.dumps(result))
finally:
    db.close()
`;
const root=fileURLToPath(new URL('../',import.meta.url));
const files=(await readdir(new URL('../drizzle/',import.meta.url))).filter(file=>/^\d.*\.sql$/.test(file)).sort();
const migrations=await Promise.all(files.map(file=>readFile(new URL('../drizzle/'+file,import.meta.url),'utf8')));
const environment={};globalThis.__RMT_D1_LIMIT_ENV__=environment;
const compiled=await build({stdin:{contents:`export * from './lib/server/control-members';export * from './lib/server/control-audit';export {POST as link} from './app/api/auth/link/route';`,resolveDir:root,loader:'ts'},absWorkingDir:root,bundle:true,write:false,platform:'node',format:'esm',target:'node24',plugins:[{name:'d1-limits-fixtures',setup(builder){
 builder.onResolve({filter:/^cloudflare:workers$/},()=>({path:'env',namespace:'d1-env'}));
 builder.onLoad({filter:/.*/,namespace:'d1-env'},()=>({contents:'export const env=globalThis.__RMT_D1_LIMIT_ENV__;'}));
 builder.onResolve({filter:/(?:^|\/)firebase-auth$/},()=>({path:'auth',namespace:'d1-auth'}));
 builder.onLoad({filter:/.*/,namespace:'d1-auth'},()=>({contents:`export const sessionCookie='fixture';export function cookieValue(){return null;}export async function checkFirebaseAccount(){}export async function verifyFirebaseToken(){return {userId:'firebase:fixture-new',firebaseUid:'fixture-new',email:'fixture@example.test',displayName:'Fixture',emailVerified:true,authTime:Date.now()/1000,signInProvider:'google.com'};}`}));
}}]});
const api=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));
function database(t,legacyOnly=false){
 const directory=mkdtempSync(join(tmpdir(),'rmt-d1-limits-')),path=join(directory,'test.sqlite');t.after(()=>rmSync(directory,{recursive:true,force:true}));
 const call=input=>JSON.parse(execFileSync('python3',['-c',runner],{input:JSON.stringify({path,...input}),encoding:'utf8',stdio:['pipe','pipe','pipe'],maxBuffer:4*1024*1024}));
 function prepare(sql,args=[]){return{sql,args,bind(...values){return prepare(sql,values);},async first(){return call({op:'statement',sql,args}).results[0]??null;},async all(){return call({op:'statement',sql,args});},async run(){return call({op:'statement',sql,args});}};}
 const db={prepare,batch:async statements=>call({op:'batch',statements:statements.map(({sql,args})=>({sql,args}))}),script:sql=>call({op:'script',sql}),rows:(sql,args=[])=>call({op:'statement',sql,args}).results};
 db.script(migrations.filter((_,index)=>!legacyOnly||Number(files[index].slice(0,4))<8).join('\n'));
 Object.assign(environment,{DB:db,RMT_ADMIN_USER_IDS:'fixture-owner'});return db;
}
function linkRequest(){return new Request('https://rmt.test/api/auth/link',{method:'POST',headers:{origin:'https://rmt.test','content-type':'application/json','oai-authenticated-user-id':'fixture-owner','oai-authenticated-user-email':'owner@example.test'},body:JSON.stringify({idToken:'local-test-token'})});}

test('D1 compatibility gate enforces the production compound SELECT and LIKE limits',t=>{
 const db=database(t);
 assert.throws(()=>db.rows('SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6'),/too many terms in compound SELECT/);
 assert.throws(()=>db.rows('SELECT ? LIKE ? AS matched',['sample','x'.repeat(51)]),/LIKE or GLOB pattern too complex/);
 assert.equal(db.rows("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")[0].n,39);
 assert.equal(db.rows('SELECT COUNT(*) AS n FROM project_follows')[0].n,0);
});
test('sequential D1 backfill preserves old records and canonical earliest history without inventing sign-ins',t=>{
 const db=database(t,true);
 db.script(`INSERT INTO profiles(user_id,handle,display_name,created_at,updated_at) VALUES('legacy-builder','canonical-builder','Canonical builder',75,75);
 INSERT INTO saved_projects VALUES('firebase:linked','vamps',50);
 INSERT INTO account_links VALUES('linked','legacy-builder',150);
 INSERT INTO submissions(id,user_id,account_email,name,normalized_name,summary,category,website,normalized_host,launch_url,x_profile,ownership_evidence,verification_code,created_at,updated_at)
 VALUES('sub','firebase:linked','z@example.test','Fixture','fixture','A fixture for historical migration.','Tools','https://fixture.test','fixture.test','https://fixture.test','','Fixture proof','fixture',200,200);
 INSERT INTO project_claims(id,project_id,project_name,user_id,account_email,method,official_channel_url,verification_code,expires_at,created_at,updated_at)
 VALUES('claim','vamps','VAMPS','legacy-builder','a@example.test','website','https://fixture.test','fixture',1000,100,100);`);
 const tables=db.rows("SELECT name,sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"),before=new Map(tables.map(table=>[table.name,db.rows('SELECT * FROM '+table.name)]));
 db.script(migrations[files.findIndex(file=>Number(file.slice(0,4))===8)]);
 for(const table of tables){assert.equal(db.rows('SELECT sql FROM sqlite_master WHERE name=?',[table.name])[0].sql,table.sql);assert.deepEqual(db.rows('SELECT * FROM '+table.name),before.get(table.name));}
 const members=db.rows('SELECT * FROM control_members');assert.equal(members.length,1);assert.equal(members[0].user_id,'legacy-builder');assert.equal(members[0].email,'z@example.test');assert.equal(members[0].display_name,'Canonical builder');assert.equal(members[0].historical_since_at,50);
 for(const field of ['first_seen_at','last_seen_at','email_verified'])assert.equal(members[0][field],null);
 assert.equal(members[0].providers_json,'[]');
});
test('real account-link preflight and atomic insert run within D1 limits and retain source activity',async t=>{
 const db=database(t);
 db.script("INSERT INTO profiles(user_id,created_at,updated_at) VALUES('firebase:fixture-new',1,1)");
 const blocked=await api.link(linkRequest());assert.equal(blocked.status,409);assert.equal(db.rows('SELECT * FROM account_links').length,0);
 db.script("DELETE FROM profiles WHERE user_id='firebase:fixture-new'");
 const linked=await api.link(linkRequest());assert.equal(linked.status,200,await linked.text());
 assert.equal(db.rows('SELECT legacy_user_id FROM account_links')[0].legacy_user_id,'fixture-owner');
});
test('member and history searches accept long Unicode and literal wildcard characters under D1 limits',async t=>{
 const db=database(t),query='é•·'.repeat(20)+'%_needle';assert.ok(Buffer.byteLength(query)>50);
 await api.observeMember(db,{userId:'search-member',email:'member@example.test',displayName:query,emailVerified:true,provider:'legacy'});
 assert.equal((await api.controlMembers(db,new URLSearchParams({q:query}),'fixture-owner')).items.length,1);
 assert.equal((await api.controlMembers(db,new URLSearchParams({q:'%_missing'}),'fixture-owner')).items.length,0);
 db.rows('INSERT INTO control_audit_events(id,actor_id,action,entity_type,entity_id,reason,created_at) VALUES(?,?,?,?,?,?,?)',['audit','fixture-owner','member.restore','member','search-member',query,1]);
 assert.equal((await api.controlAudit(db,new URLSearchParams({q:query}))).items.length,1);
 assert.equal((await api.controlAudit(db,new URLSearchParams({q:'%_missing'}))).items.length,0);
});
