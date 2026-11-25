import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {existsSync,mkdtempSync,readFileSync,readdirSync,rmSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {DatabaseSync} from 'node:sqlite';
import {build} from 'esbuild';
import {Miniflare} from 'miniflare';
import {createRecoveryKey,restoreRecovery} from '../scripts/recovery-transfer.mjs';

async function load(contents, plugins=[]) {
  const {outputFiles}=await build({stdin:{contents,resolveDir:process.cwd()},
    bundle:true,platform:'node',format:'esm',write:false,plugins});
  return import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
}

const base=await load("export * from './lib/server/recovery-capacity';export * from './lib/server/recovery-snapshot';export * from './lib/server/recovery-transfer';export * from './lib/server/recovery-archive';");
const digest=data=>createHash('sha256').update(data).digest('hex');
async function makeWorker(t) {
  const worker=new Miniflare({modules:true,script:'export default {}',d1Databases:['DB'],r2Buckets:['BUCKET']});
  t.after(()=>worker.dispose());
  return {db:await worker.getD1Database('DB'),bucket:await worker.getR2Bucket('BUCKET')};
}

test('actual 19 migrations, lossless SQLite values and matching R2 artwork survive an encrypted restore',async t=>{
  const start=performance.now();
  const {db,bucket}=await makeWorker(t);
  const dir=mkdtempSync(join(tmpdir(),'rmt-recovery-fixture-'));
  t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const migrations=readdirSync('drizzle').filter(name=>name.endsWith('.sql')).sort();
  assert.equal(migrations.length,19);
  await db.prepare('CREATE TABLE d1_migrations(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL UNIQUE)').run();
  for(const migration of migrations) {
    const statements=readFileSync(join('drizzle',migration),'utf8').split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean);
    await db.batch([...statements.map(sql=>db.prepare(sql)),db.prepare('INSERT INTO d1_migrations(name) VALUES (?)').bind(migration)]);
  }
  await db.batch([
    db.prepare("INSERT INTO account_links(legacy_user_id,firebase_uid,created_at) VALUES ('fixture-user','fixture-firebase',1)"),
    db.prepare("INSERT INTO profiles(user_id,bio,created_at,updated_at) VALUES ('fixture-user',CAST(x'4100FF' AS TEXT),1,1)"),
    db.prepare("INSERT INTO analytics_meta(id,start_ms,active_day,accepted) VALUES (1,9223372036854775807,'2026-11-25',1)"),
    db.prepare("INSERT INTO analytics_meta(id,start_ms,active_day,accepted) VALUES (2,1.2345678901234567,'2026-11-25',x'0041FF')"),
    db.prepare("UPDATE sqlite_sequence SET seq=999 WHERE name='d1_migrations'"),
    db.prepare("INSERT INTO project_owners(project_id,user_id,created_at,updated_at) VALUES ('vamps','fixture-user',1,1)"),
    db.prepare("INSERT INTO saved_projects(user_id,project_id,created_at) VALUES ('fixture-user','lammbs',1)"),
  ]);
  const artwork=Buffer.alloc(430_000,190);
  const artworkKey='fixture/path/asset';
  await bucket.put(artworkKey,artwork,{httpMetadata:{contentType:'image/png',cacheControl:'private'},customMetadata:{digest:digest(artwork)}});
  await db.prepare("INSERT INTO profile_artwork(id,user_id,kind,object_key,mime,width,height,byte_size,digest,status,created_at) VALUES ('fixture-art','fixture-user','avatar',?,'image/png',1,1,?,?,'ready',1)").bind(artworkKey,artwork.length,digest(artwork)).run();
  const snapshot=await base.captureDatabase(db);
  const keys=base.recoveryPublicKey(createRecoveryKey(join(dir,'key.pem')).publicKey);
  const captureId=randomUUID();
  const artFrame=await base.prepareArtwork(bucket,()=>true);
  const kinds=[['database',base.databaseFrames(snapshot)],['artwork',artFrame()]];
  for(const [kind,stream] of kinds){
    const encrypted=Buffer.from(await new Response(await base.encryptedRecoveryStream(await keys,captureId,kind,stream,()=>true)).arrayBuffer());
    assert.equal(encrypted.includes('fixture-user'),false);
    assert.equal(encrypted.includes(artworkKey),false);
    writeFileSync(join(dir,kind+'.rmtenc'),encrypted);
  }
  const dbPath=join(dir,'database.rmtenc');
  const artPath=join(dir,'artwork.rmtenc');
  const key=readFileSync(join(dir,'key.pem'));
  const restored=join(dir,'restored');
  const receipt=restoreRecovery(key,dbPath,artPath,restored);
  assert.equal(receipt.database.applicationTables,51);
  assert.deepEqual(receipt.database.ledgers,{d1_migrations:19});
  assert.equal(receipt.database.sequences,true);
  assert.equal(receipt.artwork.objects,1);
  assert.equal(receipt.verifiedArtworkReferences,1);
  assert.equal(receipt.commonRecoveryPointVerified,false);
  const restoredDb=new DatabaseSync(join(restored,'rmt.sqlite'));
  try{
    assert.equal(restoredDb.prepare('SELECT firebase_uid FROM account_links').get().firebase_uid,'fixture-firebase');
    assert.equal(restoredDb.prepare("SELECT user_id FROM project_owners WHERE project_id='vamps'").get().user_id,'fixture-user');
    assert.equal(restoredDb.prepare("SELECT project_id FROM saved_projects WHERE user_id='fixture-user'").get().project_id,'lammbs');
    assert.equal(restoredDb.prepare('SELECT hex(CAST(bio AS BLOB)) AS value FROM profiles').get().value,'4100FF');
    assert.equal(restoredDb.prepare('SELECT CAST(start_ms AS TEXT) AS n FROM analytics_meta WHERE id=1').get().n,'9223372036854775807');
    assert.equal(restoredDb.prepare('SELECT hex(accepted) AS value FROM analytics_meta WHERE id=2').get().value,'0041FF');
    assert.equal(restoredDb.prepare('SELECT COUNT(*) AS n FROM lammb_vault_receipts').get().n,5);
    assert.equal(restoredDb.prepare("SELECT seq FROM sqlite_sequence WHERE name='d1_migrations'").get().seq,999);
  }finally{restoredDb.close();}
  const inventory=JSON.parse(readFileSync(join(restored,'artwork','inventory.json')));
  assert.equal(inventory[0].httpMetadata.contentType,'image/png');
  assert.equal(inventory[0].customMetadata.digest,digest(artwork));
  assert.deepEqual(readFileSync(join(restored,'artwork',inventory[0].file)),artwork);
  t.diagnostic('Synthetic migration, capture and restore elapsed: '+Math.round(performance.now()-start)+' ms');

  const tampered=readFileSync(artPath);
  tampered[tampered.length-1]^=1;
  writeFileSync(join(dir,'bad'),tampered);
  assert.throws(()=>restoreRecovery(key,dbPath,join(dir,'bad'),join(dir,'tampered')));
  assert.equal(existsSync(join(dir,'tampered')),false);
  writeFileSync(join(dir,'partial'),tampered.subarray(0,-24));
  assert.throws(()=>restoreRecovery(key,dbPath,join(dir,'partial'),join(dir,'truncated')));
  assert.equal(existsSync(join(dir,'truncated')),false);
  const wrongId=await new Response(await base.encryptedRecoveryStream(await keys,randomUUID(),'artwork',artFrame(),()=>true)).arrayBuffer();
  writeFileSync(join(dir,'mixed'),Buffer.from(wrongId));
  assert.throws(()=>restoreRecovery(key,dbPath,join(dir,'mixed'),join(dir,'mixed-restore')));
  assert.equal(existsSync(join(dir,'mixed-restore')),false);
});

test('D1 stays internally consistent and fails closed after drift beyond budget or when schema is unknown',async t=>{
  const {db}=await makeWorker(t);
  await db.batch(base.recoveryTables.map(name=>db.prepare(`CREATE TABLE "${name}"(id INTEGER PRIMARY KEY,data TEXT)`)));
  await db.batch(['profiles','account_links'].map(name=>db.prepare(`INSERT INTO ${name} VALUES (1,'000')`)));
  const writer=async()=>{
    for(let i=1;i<=20;i++) await db.batch(['profiles','account_links'].map(name=>
      db.prepare(`UPDATE ${name} SET data=?`).bind(String(i).padStart(3,'0'))));
  };
  const capture=async()=>{
    for(let n=0;n<5;n++){
      const snapshot=await base.captureDatabase(db);
      assert.deepEqual(snapshot.tables.find(t=>t.name==='profiles').rows,snapshot.tables.find(t=>t.name==='account_links').rows);
    }
  };
  await Promise.all([writer(),capture()]);
  let batch=0;
  const drift={
    prepare:db.prepare.bind(db),
    async batch(statements){
      if(++batch===3) await db.prepare("UPDATE profiles SET data='a longer value'").run();
      return db.batch(statements);
    },
  };
  await assert.rejects(base.captureDatabase(drift),/changed beyond transfer capacity/);
  await db.prepare("WITH RECURSIVE n(i) AS (VALUES(2) UNION ALL SELECT i+1 FROM n WHERE i<5000) INSERT INTO profiles SELECT i,'test' FROM n").run();
  const within=await base.assessDatabaseTransfer(db);
  assert.equal(within.fits,true);
  assert.equal(within.tables.find(t=>t.name==='profiles').rows,5000);
  assert.equal((await base.captureDatabase(db)).tables.find(t=>t.name==='profiles').rows.length,5000);
  await db.prepare("WITH RECURSIVE n(i) AS (VALUES(5001) UNION ALL SELECT i+1 FROM n WHERE i<10001) INSERT INTO profiles SELECT i,'test' FROM n").run();
  assert.equal((await base.assessDatabaseTransfer(db)).countsCapped,true);
  await assert.rejects(base.captureDatabase(db),/bounded transfer capacity/);
  await db.prepare('CREATE TABLE unrelated_unexpected (id INTEGER)').run();
  await assert.rejects(base.captureDatabase(db),/Unexpected database schema/);
});

test('known Cloudflare metadata is excluded and a sizing error yields counts without an export go-ahead',async t=>{
  const {db}=await makeWorker(t);
  const catalog=new DatabaseSync(':memory:');
  t.after(()=>catalog.close());
  const appTables=base.recoveryTables.map(name=>`CREATE TABLE "${name}"(id INTEGER PRIMARY KEY,data TEXT)`);
  catalog.exec(appTables.join(';')+';CREATE TABLE "_cf_KV"(k TEXT PRIMARY KEY,v BLOB);CREATE TABLE "_cf_METADATA"(k TEXT PRIMARY KEY,v BLOB)');
  await db.batch(appTables.map(sql=>db.prepare(sql)));
  await db.prepare("INSERT INTO profiles VALUES (1,'fixture-private-row')").run();
  const catalogStatements=new WeakSet();
  const prepare=(sql)=>{
    if(!/FROM sqlite_(?:schema|master)/.test(sql)) return db.prepare(sql);
    const stmt={all:async()=>({success:true,results:catalog.prepare(sql).all()})};
    catalogStatements.add(stmt);
    return stmt;
  };
  const compatible={prepare,async batch(statements){
    // Simulate extra platform catalog entries only. The real Miniflare transaction
    // and concurrent-writer behavior are covered by the preceding tests.
    if(catalogStatements.has(statements[0])) return [await statements[0].all(),...await db.batch(statements.slice(1))];
    return db.batch(statements);
  }};
  const assessed=await base.assessDatabaseTransfer(compatible);
  assert.equal(assessed.measurement,'wire_size');
  assert.equal(assessed.fits,true);
  assert.equal(assessed.tables.length,51);
  assert.equal(assessed.tables.some(x=>x.name.toLowerCase().startsWith('_cf_')),false);
  const snapshot=await base.captureDatabase(compatible);
  assert.equal(snapshot.tables.length,51);
  assert.equal(snapshot.schema.some(x=>x.name.startsWith('_cf_')),false);

  let calls=0;
  const limited={prepare,async batch(statements){
    if(++calls===2) throw new Error('fixture-private-provider-diagnostic');
    return db.batch(statements);
  }};
  const fallback=await base.assessDatabaseTransfer(limited);
  assert.equal(fallback.measurement,'application_counts_only');
  assert.equal(fallback.sizingUnavailableAt,'wire_sizing');
  assert.equal(fallback.fits,null);
  assert.equal(fallback.wireBytes,null);
  assert.equal(fallback.tables.find(x=>x.name==='profiles').rows,1);
  assert.doesNotMatch(JSON.stringify(fallback),/fixture-private/);

  // Unexpected application data remains a hard export failure.
  catalog.exec('CREATE TABLE unknown_application_data (id INTEGER PRIMARY KEY)');
  const unknown=await base.assessDatabaseTransfer(compatible);
  assert.equal(unknown.sizingUnavailableAt,'schema_validation');
  assert.equal(unknown.fits,null);
  assert.equal(unknown.unknownApplicationTableCount,1);
  await assert.rejects(base.captureDatabase(compatible),/Unexpected database schema/);
  catalog.exec('DROP TABLE wallet_claim_evidence');
  const missing=await base.assessDatabaseTransfer(compatible);
  assert.deepEqual(missing.missingApplicationTables,['wallet_claim_evidence']);
  assert.equal(missing.expectedApplicationTableCount,51);
  assert.equal(missing.tables.length,50);
  assert.equal(missing.fits,null);
});

test('artwork paging archives all listed versions and refuses a mid-capture change',async t=>{
  const {bucket}=await makeWorker(t);
  await bucket.put('asset','first version');
  await bucket.put('other','second object');
  let lists=0;
  const paged={get:bucket.get.bind(bucket),list(opts){lists++;return bucket.list({...opts,limit:1});}};
  const prepared=await base.prepareArtwork(paged,()=>true);
  const frames=[];
  for await(const next of prepared()) frames.push(next.type);
  assert.equal(lists,4);
  assert.deepEqual(frames,[10,11,12,13,11,12,13,255]);
  const changed=await base.prepareArtwork(paged,()=>true);
  await bucket.put('asset','replacement');
  await assert.rejects(async()=>{for await(const _ of changed()) { /* discard fixture frames */ }},/changed during transfer/);
});

test('transfer route is fail-closed, mode-bound and inaccessible to non-owner or stale sessions',async t=>{
  const runtimeStub="export const config={RMT_ADMIN_USER_IDS:'firebase:owner,firebase:reviewer'}; export const runtime=()=>config;";
  const authStub=`
    export const sessionCookie='__Host-rmt-session';
    export const cookieValue=request=>request.headers.get('cookie');
    export async function verifyFirebaseToken(token){return {firebaseUid:token==='reviewer'?'reviewer':'owner',emailVerified:token!=='unverified',
      signInProvider:'google.com',authTime:Math.floor(Date.now()/1000)-(token==='stale'?301:0)};}
    export async function checkFirebaseAccount(token){if(token==='revoked')throw new Error('fixture-private-details');}
  `;
  const route=await load("export * from './app/api/control/recovery-transfer/route';export {config} from '@/lib/server/runtime';",[
    {name:'fixtures',setup(builder){
      builder.onResolve({filter:/^@\/lib\/server\/(runtime|firebase-auth)$/},args=>({path:args.path,namespace:'fixtures'}));
      builder.onLoad({filter:/.*/,namespace:'fixtures'},args=>({contents:args.path.endsWith('runtime')?runtimeStub:authStub}));
    }},
  ]);
  const origin='https://rmt.example';
  const url=origin+'/api/control/recovery-transfer';
  const req=(cookie,action='action=database',source=origin)=>new Request(url,{method:'POST',
    headers:{origin:source,'content-type':'application/x-www-form-urlencoded',...(cookie?{cookie}:{})},body:action});
  assert.equal((await route.POST(req('owner'))).status,404);
  assert.equal((await route.GET(new Request(url))).status,404);
  const now=Date.now();
  Object.assign(route.config,{RMT_TRANSFER_OWNER_UID:'owner',RMT_TRANSFER_MODE:'database',RMT_TRANSFER_PUBLIC_KEY:'fixture',
    RMT_TRANSFER_CAPTURE_ID:randomUUID(),RMT_TRANSFER_START:new Date(now-50).toISOString(),RMT_TRANSFER_UNTIL:new Date(now+900_000).toISOString()});
  assert.equal((await route.POST(req('owner'))).status,404);
  route.config.RMT_TRANSFER_UNTIL=new Date(now+60_000).toISOString();
  assert.equal((await route.POST(req('owner','action=artwork'))).status,404);
  assert.equal((await route.POST(req('owner','action=database&foo=bar'))).status,404);
  assert.equal((await route.POST(req('owner','action=database','https://other.example'))).status,403);
  assert.equal((await route.POST(req('reviewer'))).status,403);
  assert.equal((await route.POST(req('unverified'))).status,403);
  assert.equal((await route.POST(req('stale'))).status,401);
  assert.equal((await route.POST(req(null))).status,401);
  const unauthorized=await route.POST(req('revoked'));
  assert.equal(unauthorized.status,503);
  assert.doesNotMatch(await unauthorized.text(),/fixture-private-details/);
  const form=await route.GET(new Request(url,{headers:{cookie:'owner'}}));
  assert.equal(form.status,200);
  assert.match(form.headers.get('Cache-Control'),/no-store/);
  assert.match(form.headers.get('Content-Security-Policy'),/frame-ancestors 'none'/);
  assert.match(await form.text(),/Download encrypted database/);
  const {db}=await makeWorker(t);
  await db.batch(base.recoveryTables.map(name=>db.prepare(`CREATE TABLE "${name}"(id INTEGER PRIMARY KEY,data TEXT)`)));
  await db.prepare("INSERT INTO profiles VALUES (1,'fixture-private-row')").run();
  route.config.DB=db;
  route.config.RMT_TRANSFER_MODE='preflight';
  delete route.config.RMT_TRANSFER_PUBLIC_KEY;
  assert.equal((await route.POST(req('owner'))).status,404);
  const assessed=await route.POST(req('owner','action=preflight'));
  assert.equal(assessed.status,200);
  const aggregate=await assessed.text();
  assert.doesNotMatch(aggregate,/fixture-private-row/);
  assert.equal(JSON.parse(aggregate).tables.find(row=>row.name==='profiles').rows,1);
  route.config.RMT_TRANSFER_UNTIL=new Date(now-25).toISOString();
  assert.equal((await route.POST(req('owner','action=preflight'))).status,404);
});
