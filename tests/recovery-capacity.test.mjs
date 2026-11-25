import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {Miniflare} from 'miniflare';

async function load(contents, plugins=[]) {
  const {outputFiles}=await build({stdin:{contents,resolveDir:process.cwd()},
    bundle:true,platform:'node',format:'esm',write:false,plugins});
  return import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
}

test('D1 capacity emits exact counts and metadata, with no individual data', async t=>{
  const {recoveryCapacity,recoveryTables}=await load("export * from './lib/server/recovery-capacity'");
  const worker=new Miniflare({modules:true,script:'export default {}',d1Databases:['DB']});
  t.after(()=>worker.dispose());
  const db=await worker.getD1Database('DB');
  await db.batch(recoveryTables.map(name=>db.prepare(`CREATE TABLE "${name}"(id INTEGER PRIMARY KEY AUTOINCREMENT, data TEXT)`)));
  await db.batch([
    db.prepare("INSERT INTO profiles(data) VALUES ('fixture-private-payload')"),
    db.prepare("CREATE TABLE d1_migrations(id INTEGER PRIMARY KEY)"),
    db.prepare("WITH RECURSIVE n(i) AS (VALUES(1) UNION ALL SELECT i+1 FROM n WHERE i<2001) INSERT INTO analytics_events(data) SELECT 'fixture' FROM n"),
  ]);
  const result=await recoveryCapacity(db);
  assert.equal(result.applicationTableCount,47);
  assert.equal(result.totalRows,2002);
  assert.deepEqual(result.largest,{table:'analytics_events',rowCount:2001});
  assert.deepEqual(result.exceedingRowLimit,[result.largest]);
  assert.equal(result.expectedTableInventoryMatches,true);
  assert.equal(result.sequencesPresent,true);
  assert.deepEqual(result.migrationLedgerTables,['d1_migrations']);
  assert.equal(result.serializedSizeStatus,'unverified');
  assert.doesNotMatch(JSON.stringify(result),/fixture-private-payload/);
});

test('capacity requires a bounded server window, same origin and the fresh designated Firebase UID',async()=>{
  const runtimeStub=`
    export const fixture={RMT_ADMIN_USER_IDS:'firebase:owner,firebase:admin'};
    export const runtime=()=>fixture;
    export function database(){ return fixture.db; }
  `;
  const authStub=`
    export const sessionCookie='__Host-rmt-session';
    export function cookieValue(request){return request.headers.get('cookie');}
    export async function verifyFirebaseToken(token){
      return {firebaseUid:['admin','builder','member','project-owner'].includes(token)?token:'owner',
        emailVerified:token!=='unverified', signInProvider:token==='custom'?'custom':'password',
        authTime:Math.floor(Date.now()/1000)-(token==='stale'?301:0)};
    }
    export async function checkFirebaseAccount(token){
      if(token==='lookup-error') throw new Error('fixture-private-token');
    }
  `;
  const route=await load("export * from './app/api/control/recovery/route';export {fixture} from '@/lib/server/runtime';",[
    {name:'fixtures',setup(builder){
      builder.onResolve({filter:/^@\/lib\/server\/(runtime|firebase-auth)$/},args=>({path:args.path,namespace:'fixtures'}));
      builder.onLoad({filter:/.*/,namespace:'fixtures'},args=>({contents:args.path.endsWith('runtime')?runtimeStub:authStub}));
    }},
  ]);
  let storageCalls=0;
  route.fixture.db={
    prepare(sql){return sql;},
    async batch(sql){
      storageCalls++;
      assert.ok(sql.every(statement=>statement.startsWith('SELECT')));
      return [{results:[],meta:{}},...sql.slice(1).map(()=>({results:[{total:0}]}))];
    },
  };
  const origin='https://rmt.example';
  async function call(cookie,action='capacity',source=origin){
    const result=await route.POST(new Request(origin+'/api/control/recovery',{
      method:'POST',headers:{origin:source,'content-type':'application/json',...(cookie?{cookie}:{})},
      body:JSON.stringify(typeof action==='object'?action:{action}),
    }));
    assert.match(result.headers.get('Cache-Control'),/no-store/);
    assert.equal(result.headers.get('CDN-Cache-Control'),'no-store');
    return result;
  }
  assert.equal((await call('owner',{action:'capacity',RMT_RECOVERY_UNTIL:'now'})).status,404);
  route.fixture.RMT_RECOVERY_OWNER_UID='owner';
  const now=Date.now();
  function window(start,end){
    route.fixture.RMT_RECOVERY_START=new Date(now+start).toISOString();
    route.fixture.RMT_RECOVERY_UNTIL=new Date(now+end).toISOString();
  }
  window(-20,600001);
  assert.equal((await call('owner')).status,404);
  window(10_000,20_000);
  assert.equal((await call('owner')).status,404);
  window(-20_000,-10_000);
  assert.equal((await call('owner')).status,404);
  window(-5000,60_000);
  assert.equal((await call()).status,401);
  assert.equal((await call('owner','capacity','https://example.com')).status,403);
  for(const identity of ['admin','builder','member','project-owner','unverified','custom']){
    assert.equal((await call(identity)).status,403);
  }
  assert.equal((await call('stale')).status,401);
  const failure=await call('lookup-error');
  assert.equal(failure.status,503);
  assert.doesNotMatch(await failure.text(),/fixture-private-token/);
  for(const action of ['database','list','object','export',{action:'capacity',sql:'SELECT *'}]){
    assert.equal((await call('owner',action)).status,404);
  }
  assert.equal(storageCalls,0);
  assert.equal((await call('owner')).status,200);
  assert.equal(storageCalls,1);
  window(-20_000,-10_000);
  assert.equal((await call('owner')).status,404);
  assert.equal(storageCalls,1);
});
