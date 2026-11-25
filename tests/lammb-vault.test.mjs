import assert from 'node:assert/strict';
import test from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import {readFile,readdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {secp256k1} from '@noble/curves/secp256k1';
import {keccak_256} from '@noble/hashes/sha3';
import {bytesToHex} from '@noble/hashes/utils';

const root=fileURLToPath(new URL('../',import.meta.url)),env={};
globalThis.__LAMMB_TEST_ENV__=env;
const {outputFiles}=await build({stdin:{contents:`
 export * from './app/api/lammb-vault/route';
 export {GET as ownerGet,POST as ownerPost} from './app/api/admin/lammb-vault/route';
 export * from './lib/server/lammb-signature';
 export * from './lib/server/lammb-mining';
 export * from './lib/server/lammb-royalties';
 export * from './lib/lammb-vault';
 export {maintenanceProtectedPath} from './lib/server/site-availability';
`,resolveDir:root,loader:'ts'},absWorkingDir:root,bundle:true,write:false,platform:'node',format:'esm',target:'node24',
plugins:[{name:'vault-runtime-fixture',setup(b){
 b.onResolve({filter:/^cloudflare:workers$/},()=>({path:'test-runtime',namespace:'test-runtime'}));
 b.onLoad({filter:/.*/,namespace:'test-runtime'},()=>({contents:'export const env=globalThis.__LAMMB_TEST_ENV__;'}));
}}]});
const vault=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
const files=(await readdir(new URL('../drizzle/',import.meta.url))).filter(f=>/^\d.*\.sql$/.test(f)).sort();
const schema=(await Promise.all(files.map(f=>readFile(new URL('../drizzle/'+f,import.meta.url),'utf8')))).join('\n');

function database(t){
 const raw=new DatabaseSync(':memory:');raw.exec('PRAGMA foreign_keys=ON');raw.exec(schema);t.after(()=>raw.close());
 function prepare(sql,args=[]){return {
  bind(...values){return prepare(sql,values);},
  async first(){return raw.prepare(sql).get(...args)??null;},
  async all(){return {success:true,results:raw.prepare(sql).all(...args)};},
  execute(){return {success:true,meta:{changes:Number(raw.prepare(sql).run(...args).changes)}};},
  async run(){return this.execute();}
 };}
 const db={prepare,async batch(statements){raw.exec('BEGIN');try{const values=statements.map(s=>s.execute());raw.exec('COMMIT');return values;}catch(e){raw.exec('ROLLBACK');throw e;}}};
 Object.assign(env,{DB:db,RMT_ADMIN_USER_IDS:'vault-test-owner',RMT_LAMMB_BRAIINS_ACCOUNT:undefined,RMT_LAMMB_BRAIINS_READ_TOKEN:undefined});
 return raw;
}
const hex=n=>'0x'+n.toString(16),word=n=>n.toString(16).padStart(64,'0'),aw=a=>a.slice(2).padStart(64,'0');
const target=vault.GENESIS_CONTRACT;
const hash='0x'+'10'.repeat(32),canonical='0x'+'20'.repeat(32),other='0x'+'21'.repeat(32);
const seller='0x'+'31'.repeat(20),buyer='0x'+'32'.repeat(20),receiver='0x'+'33'.repeat(20),fee='0x'+'34'.repeat(20),zero=vault.ASSETS.ETH.address;
const privateKey=new Uint8Array(32).fill(47),wrongKey=new Uint8Array(32).fill(48);
const address='0x'+bytesToHex(keccak_256(secp256k1.getPublicKey(privateKey,false).slice(1)).slice(12));
const sign=(message,key=privateKey)=>{
 const sig=secp256k1.sign(vault.personalDigest(message),key);
 return '0x'+sig.toCompactHex()+(sig.recovery+27).toString(16);
};
const nftLog=()=>({address:target,topics:[vault.TRANSFER,'0x'+aw(seller),'0x'+aw(buyer),'0x'+word(16)],data:'0x'});
function transferLog(token,from,to,amount) {
 return {address:token,topics:[vault.TRANSFER,'0x'+aw(from),'0x'+aw(to)],data:'0x'+word(amount)};
}
function makeReceipt({offer=false,wrongAmount=false,token=vault.ASSETS.WETH.address}={}){
 const nft=[word(2),aw(target),word(16),word(1)];
 const payment=(currency,to,amount)=>[word(currency===zero?0:1),aw(currency),word(0),word(amount),aw(to)];
 const receive=offer?[...nft,aw(buyer),...payment(token,fee,10),...payment(token,receiver,wrongAmount?98:100)]:
  [...payment(zero,seller,890),...payment(zero,fee,10),...payment(zero,receiver,wrongAmount?98:100)];
 const spent=offer?[word(1),aw(token),word(0),word(1000)]:nft;
 return {status:'0x1',to:vault.SEAPORT,blockNumber:hex(200),blockHash:canonical,transactionHash:hash,logs:[
  nftLog(),{address:vault.SEAPORT,topics:[vault.FULFILL,'0x'+aw(offer?buyer:seller),'0x'+aw(fee)],data:'0x'+
    [word(7),aw(offer?seller:buyer),word(128),word(288),word(1),...spent,word(3),...receive].join('')},
  ...(offer?[transferLog(token,seller,receiver,100)]:[])
 ]};
}
function fixture(t){
 let state={balance:0,stale:false,offline:false,wrongChain:false,code:'0x',erc:null,receipt:makeReceipt(),
  lastFinal:300,pool:null,poolCalls:0,redirected:false,beforeReceiver:receiver,blockHash:canonical,calls:[]};
 const now=Math.floor(Date.now()/1000);
 t.mock.method(globalThis,'fetch',async (url,init)=>{
   if(url==='https://pool.braiins.com/accounts/profile/json/btc/'){
     assert.equal(init.method,'GET');assert.equal(init.redirect,'manual');
     assert.equal(init.headers['Pool-Auth-Token'],env.RMT_LAMMB_BRAIINS_READ_TOKEN);
     state.poolCalls++;
     return state.pool?Response.json(state.pool):new Response(null,{status:401});
   }
   assert.equal(init.redirect,'manual');
   if(state.redirected)return new Response(null,{status:302,headers:{Location:'https://untrusted.example/'}});
   if(state.offline)throw Error('provider unavailable');
   const {id,method,params}=JSON.parse(init.body);
   state.calls.push({method,params});
   let result;
   switch(method){
    case 'eth_chainId':result=hex(state.wrongChain?1:4663);break;
    case 'eth_getBlockByNumber':{
     const block=params[0]==='latest'?320:params[0]==='finalized'?state.lastFinal:Number(params[0]);
     result={number:hex(block),timestamp:hex(state.stale?now-300:block===200?now-165:now),hash:block===200?state.blockHash:other};break;}
    case 'eth_getCode':result=state.code;break;
    case 'eth_getBalance':result=hex(123);break;
    case 'eth_getTransactionReceipt':result=state.receipt;break;
    case 'eth_call':{
     const {to,data}=params[0];
     if(to===target&&data.startsWith('0x70a08231')){result='0x'+word(state.balance);break;}
     if(to===target&&data.startsWith('0x2a55205a')){
      const sale=BigInt('0x'+data.slice(74));
      result='0x'+aw(params[1]===hex(199)?state.beforeReceiver:receiver)+word(sale/10n);break;
     }
     if(data.startsWith('0x1626ba7e')&&state.erc){result=state.erc(data);break;}
     if(data.startsWith('0x70a08231')){result='0x'+word(888);break;}
     assert.fail('Unexpected chain call: '+JSON.stringify(params));
    }
    default:assert.fail('Unknown method '+method);
   }
   return Response.json({jsonrpc:'2.0',id,result});
 });
 return state;
}
const origin='https://rmtlaunch.fun',uri=origin+'/api/lammb-vault';
const ownHeaders={'oai-authenticated-user-id':'vault-test-owner','oai-authenticated-user-email':'vault-test-owner@example.test',
 'x-rmt-account':'vault-test-owner'};
const jar=response=>response.headers.getSetCookie().map(s=>s.split(';')[0]).filter(s=>!s.endsWith('=')).join('; ');
const req=(body,opts={})=>new Request((opts.origin??origin)+(opts.path??'/api/lammb-vault'),{
 ...(body?{method:'POST',body:JSON.stringify(body)}:{}),
 headers:{...(body?{origin:opts.headerOrigin??opts.origin??origin,'content-type':'application/json'}:{}),
   ...(opts.cookie?{cookie:opts.cookie}:{}),...opts.headers}
});
const post=(body,opts)=>vault.POST(req(body,opts));
const read=(cookie,base=origin)=>vault.GET(new Request(base+'/api/lammb-vault?view=member',{headers:cookie?{cookie}:{}}));
async function begin(addr=address,opts){
 const response=await post({action:'challenge',address:addr},opts);
 assert.equal(response.status,200);
 return {challenge:await response.json(),cookie:jar(response),response};
}
const verify=(fixture,key=privateKey,opts={})=>post({action:'verify',challengeId:fixture.challenge.challengeId,
 signature:sign(fixture.challenge.message,key)},{cookie:fixture.cookie,...opts});

test('four is locked, five unlocks the server ledger, and a transfer relocks it without a new request to sign',async t=>{
 database(t);const rpc=fixture(t);
 assert.equal(vault.maintenanceProtectedPath('/lammb-vault','GET'),true);
 assert.equal(vault.maintenanceProtectedPath('/lammb-vault/manage','GET'),true);
 assert.equal((await read()).status,401);
 const start=await begin();
 assert.match(start.challenge.message,/rmtlaunch\.fun wants you to sign in/);
 assert.match(start.challenge.message,/URI: https:\/\/rmtlaunch\.fun\/lammb-vault/);
 assert.match(start.challenge.message,/Chain ID: 4663/);
 assert.match(start.response.headers.getSetCookie()[0],/HttpOnly; Secure; SameSite=Strict/);
 rpc.balance=4;
 const locked=await verify(start);
 assert.equal(locked.status,200);
 assert.equal(locked.headers.getSetCookie().length,0);
 assert.equal((await locked.json()).eligible,false);
 assert.equal((await read(start.cookie)).status,401);
 rpc.balance=5;
 const retry=await begin(address,{cookie:start.cookie});
 const unlocked=await verify(retry),session=jar(unlocked);
 assert.equal(unlocked.status,200);
 assert.equal((await unlocked.json()).eligible,true);
 const access=await read(session);
 assert.equal(access.headers.get('cache-control'),'no-store');
 assert.equal((await access.json()).member.receipts.length,5);
 rpc.balance=4;
 const revoked=await (await read(session)).json();
 assert.equal(revoked.eligible,false);
 assert.equal(revoked.balance,4);
 assert.equal(Object.hasOwn(revoked,'member'),false);
 assert.equal((await read(session)).status,401);
});

test('the wallet challenge is same-origin, nonce-bound, one-use and browser-bound',async t=>{
 database(t);const rpc=fixture(t);rpc.balance=7;
 const signed=await begin();
 assert.equal((await verify(signed,privateKey,{cookie:''})).status,409);
 assert.equal((await verify(signed,privateKey,{cookie:'__Host-rmt-lammb-browser='+'e'.repeat(64)})).status,409);
 assert.equal((await verify(signed,privateKey,{origin:'https://elsewhere.test'})).status,409);
 assert.equal((await verify(signed,privateKey,{headerOrigin:'https://elsewhere.test'})).status,403);
 const replies=await Promise.all([verify(signed),verify(signed)]);
 assert.deepEqual(replies.map(r=>r.status).sort(),[200,409]);
 const cookie=jar(replies.find(r=>r.status===200));
 assert.equal((await read(cookie,'https://other.rmt.test')).status,401);
 assert.equal((await read(cookie.split('; ')[1])).status,401);
 assert.equal((await post({action:'disconnect'},{cookie})).status,200);
 assert.equal((await read(cookie)).status,401);
});

test('an invalid signature, expired challenge, wrong chain and an RPC outage never grant access',async t=>{
 const db=database(t),rpc=fixture(t);rpc.balance=10;
 assert.equal((await verify(await begin(),wrongKey)).status,422);
 const one=await begin();
 db.prepare('UPDATE lammb_vault_wallets SET expires_at=0 WHERE challenge_id=?').run(one.challenge.challengeId);
 assert.equal((await verify(one)).status,409);
 rpc.wrongChain=true;
 assert.equal((await verify(await begin())).status,503);
 rpc.wrongChain=false;rpc.stale=true;
 assert.equal((await verify(await begin())).status,503);
 rpc.stale=false;
 const session=jar(await verify(await begin()));
 rpc.offline=true;
 assert.equal((await read(session)).status,503);
 rpc.offline=false;rpc.redirected=true;
 assert.equal((await read(session)).status,503);
 rpc.redirected=false;
 assert.equal((await read(session)).status,200);
 db.prepare('UPDATE lammb_vault_wallets SET expires_at=0 WHERE session_hash IS NOT NULL').run();
 assert.equal((await read(session)).status,401);
});

test('smart-wallet signatures must accept the actual digest and reject an unrelated challenge',async t=>{
 database(t);const rpc=fixture(t);rpc.balance=5;rpc.code='0x6000';
 const first=await begin();const digest=bytesToHex(vault.personalDigest(first.challenge.message));const magic='0x1626ba7e'.padEnd(66,'0');
 const verifySmart=({challenge,cookie})=>post({action:'verify',challengeId:challenge.challengeId,signature:'0xaabb'},{cookie});
 rpc.erc=data=>data.slice(10,74)===digest?magic:'0x'+'f'.repeat(64);
 assert.equal((await verifySmart(first)).status,200);
 rpc.erc=()=>magic;
 assert.equal((await verifySmart(await begin())).status,422);
});

test('public statistics never expose the receipt ledger, and only the owner stages an address',async t=>{
 const db=database(t);fixture(t);
 const overview=await (await vault.GET(new Request(uri))).json();
 assert.equal(overview.count,5);
 assert.equal(overview.tracked.WETH,'350000000000000');
 assert.equal(overview.tracked.ETH,'84520000000000');
 assert.equal(overview.royalty.receiver,receiver);
 assert.equal(overview.royalty.rateBps,1000);
 assert.equal(overview.treasury,null);
 assert.equal(JSON.stringify(overview).includes('0x59bcb422d9c54d2f'),false);
 const path='/api/admin/lammb-vault';
 assert.equal((await vault.ownerGet(req(null,{path}))).status,401);
 db.prepare("INSERT INTO control_members(user_id,created_at,updated_at) VALUES('staff',0,0)").run();
 db.prepare("INSERT INTO control_roles(user_id,role,revision,updated_at,updated_by) VALUES('staff','admin',1,0,'vault-test-owner')").run();
 assert.equal((await vault.ownerGet(req(null,{path,headers:{...ownHeaders,'oai-authenticated-user-id':'staff'}}))).status,403);
 const action={action:'treasury',address:receiver,revision:0};
 assert.equal((await vault.ownerPost(req(action,{path,headers:ownHeaders,headerOrigin:'https://elsewhere.test'}))).status,403);
 const saved=await vault.ownerPost(req(action,{path,headers:ownHeaders}));
 assert.equal(saved.status,200,JSON.stringify(await saved.clone().json()));
 assert.equal((await vault.ownerPost(req(action,{path,headers:ownHeaders}))).status,409);
 const configured=await (await vault.GET(new Request(uri))).json();
 assert.equal(configured.treasury.address,receiver);
 assert.deepEqual(configured.treasury.balances,{ETH:'123',WETH:'888',USDG:'888'});
 assert.equal(configured.count,5);
});

test('owner imports exact canonical proceeds once, excluding bundles, wrong assets and missing transfers',async t=>{
 const db=database(t);const rpc=fixture(t);
 const path='/api/admin/lammb-vault',input={action:'receipt',hash};
 const upload=()=>vault.ownerPost(req(input,{path,headers:ownHeaders}));
 rpc.receipt=makeReceipt({offer:true});rpc.receipt.logs.pop();
 assert.equal((await upload()).status,422);
 rpc.receipt=makeReceipt({wrongAmount:true});
 assert.equal((await upload()).status,422);
 rpc.receipt=makeReceipt();rpc.lastFinal=199;
 assert.equal((await upload()).status,422);
 rpc.lastFinal=300;rpc.beforeReceiver=buyer;
 assert.equal((await upload()).status,422);
 rpc.beforeReceiver=receiver;rpc.blockHash=other;
 assert.equal((await upload()).status,422);
 rpc.blockHash=canonical;rpc.receipt.logs.push(rpc.receipt.logs[1]);
 assert.equal((await upload()).status,422);
 rpc.receipt=makeReceipt({offer:true});
 const confirmed=await upload();
 assert.equal(confirmed.status,200,JSON.stringify(await confirmed.clone().json()));
 const result=await confirmed.json();
 assert.equal(result.added,true);
 assert.equal(result.receipt.amount,'100');
 assert.equal(result.receipt.asset,'WETH');
 assert.equal(result.receipt.tokenId,'16');
 assert.equal((await (await upload()).json()).added,false);
 assert.equal(db.prepare('SELECT COUNT(*) AS total FROM lammb_vault_receipts').get().total,6);
});

test('nonce production and D1 attempt ceilings hold under repeated challenge creation',async t=>{
 database(t);
 const start=await begin();
 for(let i=0;i<9;i++){
  const next=await begin(address,{cookie:start.cookie});
  assert.notEqual(next.challenge.challengeId,start.challenge.challengeId);
 }
 assert.equal((await post({action:'challenge',address},{cookie:start.cookie})).status,429);
});

test('mining telemetry uses only a dedicated pool account and remains behind the live five-NFT check',async t=>{
 database(t);const rpc=fixture(t);
 const token='fixture-read-only-secret';env.RMT_LAMMB_BRAIINS_READ_TOKEN=token;env.RMT_LAMMB_BRAIINS_ACCOUNT='lammb-fixture';
 rpc.pool={username:'lammb-fixture',token,privateWorker:'rack-02',btc:{hash_rate_unit:'Gh/s',hash_rate_60m:235000,
  hash_rate_24h:'211500.25',ok_workers:1,all_time_reward:'0.00001101',payoutAddress:'not-for-the-member-view'}};
 const pub=await (await vault.GET(new Request(uri))).json();
 assert.equal(Object.hasOwn(pub,'mining'),false);
 assert.equal((await read()).status,401);
 assert.equal(rpc.poolCalls,0);
 const beginAtFour=await begin();rpc.balance=4;
 assert.equal((await (await verify(beginAtFour)).json()).eligible,false);
 assert.equal(rpc.poolCalls,0);
 rpc.balance=5;
 const start=await begin(address,{cookie:beginAtFour.cookie}),session=jar(await verify(start));
 const member=(await (await read(session)).json()).member;
 assert.equal(rpc.poolCalls,1);
 assert.deepEqual(member.mining,{status:'reported',provider:'Braiins Pool',hashrate1hTH:235,
  hashrate24hTH:211.50025,workersOk:1,cumulativePoolRewardBTC:'0.00001101',checkedAt:member.mining.checkedAt});
 assert.ok(Number.isSafeInteger(member.mining.checkedAt));
 for(const hidden of [token,'privateWorker','lammb-fixture','not-for-the-member-view'])assert.equal(JSON.stringify(member).includes(hidden),false);
 assert.equal((await (await read(session)).json()).member.mining.status,'reported');
 assert.equal(rpc.poolCalls,1,'valid observations can be reused briefly');
 env.RMT_LAMMB_BRAIINS_READ_TOKEN='rotated-valid-read-token';
 rpc.pool={...rpc.pool,username:'other-account'};
 assert.equal((await (await read(session)).json()).member.mining.status,'unavailable');
 assert.equal(rpc.poolCalls,2);
 rpc.balance=4;
 const locked=await (await read(session)).json();
 assert.equal(Object.hasOwn(locked,'member'),false);
 assert.equal(rpc.poolCalls,2);
});
test('invalid or unavailable pool data never becomes fake hashrate or earnings',async t=>{
 database(t);const rpc=fixture(t);
 assert.deepEqual(await vault.miningStatus({}),{status:'unconfigured'});
 const valid={username:'key',btc:{hash_rate_unit:'TH/s',hash_rate_60m:0,hash_rate_24h:0,ok_workers:0,all_time_reward:'0.00000000'}};
 for(const mutate of [x=>{delete x.btc.hash_rate_60m;},x=>x.btc.hash_rate_unit='constructor',x=>x.btc.hash_rate_24h=-1,
  x=>x.btc.ok_workers=0.5,x=>x.btc.all_time_reward='not money']) {
   const copy=structuredClone(valid);mutate(copy);
   assert.deepEqual(vault.interpretBraiinsProfile(copy,'key',100),{status:'unavailable'});
 }
 const okay=vault.interpretBraiinsProfile(valid,'key',100);
 assert.equal(okay.status,'reported');assert.equal(okay.hashrate1hTH,0);
 env.RMT_LAMMB_BRAIINS_READ_TOKEN='other-fixture-read-token';
 env.RMT_LAMMB_BRAIINS_ACCOUNT='lammb-fixture';
 assert.deepEqual(await vault.miningStatus(env),{status:'unavailable'});
 assert.equal(rpc.poolCalls,1);
});
