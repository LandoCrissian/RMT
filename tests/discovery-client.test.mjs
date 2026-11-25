import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';

const root=fileURLToPath(new URL('../',import.meta.url));
const bundle=await build({entryPoints:['lib/client/discovery.ts'],absWorkingDir:root,bundle:true,write:false,platform:'node',format:'esm'});
const {readDiscovery,saveDiscovery}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const page={member:false,items:[],nextCursor:null,hasMore:false,lessons:[],categories:['Games'],categoryLabels:{Games:'Games'},interests:[],readIds:[],unreadCount:0,recommendedProjects:[],notificationsEnabled:true};
const read=account=>readDiscovery(new URLSearchParams({view:'all'}),account,new AbortController().signal);
test('anonymous discovery omits credentials and rejects accidental private state',async t=>{
  let body=page;
  t.mock.method(globalThis,'fetch',async (_,init)=>{
    assert.equal(init.credentials,'omit');assert.equal(init.cache,'no-store');assert.deepEqual(init.headers,{});
    return Response.json(body);
  });
  assert.deepEqual(await read(null),page);
  for(const change of [{member:true},{interests:['Games']},{unreadCount:1},{readIds:['private-id']}]) {
    body={...page,...change};await assert.rejects(read(null),/verified/);
  }
});
test('member discovery and preference requests bind to the selected account',async t=>{
  t.mock.method(globalThis,'fetch',async (_,init)=>{
    assert.equal(init.credentials,'same-origin');assert.equal(init.headers['X-RMT-Account'],'test-account');
    if(init.method==='POST'){
      assert.deepEqual(JSON.parse(init.body),{action:'interests',interests:[]});return Response.json({error:'Account changed.'},{status:409});
    }
    return Response.json({...page,member:true,interests:['Games']});
  });
  assert.deepEqual((await read('test-account')).interests,['Games']);
  await assert.rejects(saveDiscovery('test-account',{action:'interests',interests:[]}),/Account changed/);
});
