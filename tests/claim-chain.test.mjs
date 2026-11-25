import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {secp256k1} from '@noble/curves/secp256k1';
import {keccak_256} from '@noble/hashes/sha3';
import {utf8ToBytes,concatBytes,bytesToHex} from '@noble/hashes/utils';

const projectId='bored-traders',contract='0x0c036d11be6b5839cfe2bfe5c4c6e3854193d959';
const code='0x00',codeHash='0x'+bytesToHex(keccak_256(Uint8Array.of(0)));
const bundle=await build({entryPoints:['lib/server/claim-chain.ts'],absWorkingDir:fileURLToPath(new URL('..',import.meta.url)),bundle:true,
  write:false,platform:'node',format:'esm',plugins:[{name:'isolated-collection',setup(b){
    b.onResolve({filter:/^\.\.\/claim-contracts$/},()=>({path:'collection',namespace:'fixture'}));
    b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:`export const claimContract=id=>id==='bored-traders'?${JSON.stringify({address:contract,chainId:4663,model:'owner()',codeHash})}:null;`}));
  }}]});
const {verifyClaimAuthority}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].contents).toString('base64'));
// Ephemeral identities only. No live wallet, signature collection or transaction.
const secret=secp256k1.utils.randomSecretKey();
const address='0x'+bytesToHex(keccak_256(secp256k1.getPublicKey(secret,false).slice(1)).slice(-20));
const message='RMT project evidence for this isolated test.';
const hash=keccak_256(concatBytes(utf8ToBytes('\x19Ethereum Signed Message:\n'+utf8ToBytes(message).length),utf8ToBytes(message)));
const sig=secp256k1.sign(hash,secret);
const signature='0x'+sig.toCompactHex()+(sig.recovery+27).toString(16);
const proof={projectId,contract,address,message,signature};
function provider(t,options={}){
 const timestamp=Math.floor(Date.now()/1000);
 const calls=new Map(),current={owner:address,signerCode:'0x',...options};
 t.mock.method(globalThis,'fetch',async(url,init)=>{
   const {method,params,id}=JSON.parse(init.body);
   const history=calls.get(url)??[];calls.set(url,history);history.push(method);
   assert.ok(id<=12);assert.equal(init.method,'POST');let result;
   if(current.offline)return new Response(null,{status:429});
   if(method==='eth_chainId')result=current.chainId??'0x1237';
   else if(method==='eth_getBlockByNumber'){
     const latest=params[0]==='latest';
     const hash=(current.reorg&&id>8)||current.disagree&&url.includes('pinax')?'a':'b';
     result={number:latest?'0x100':params[0],hash:'0x'+hash.repeat(64),timestamp:'0x'+(timestamp-(current.stale?900:0)).toString(16)};
   }else if(method==='eth_getCode')result=params[0]===contract?(current.contractCode??code):current.signerCode;
   else if(method==='eth_call'&&params[0].data==='0x8da5cb5b')result='0x'+'0'.repeat(24)+(params[1]==='latest'&&current.tipOwner?current.tipOwner:current.owner).slice(2);
   else if(method==='eth_call'&&params[0].data.startsWith('0x1626ba7e')){
     const correct=params[0].data.slice(10,74)===bytesToHex(hash);
     result=((correct&&!current.bad1271)||current.permissive?'0x1626ba7e':'0xffffffff').padEnd(66,'0');
   }else throw Error('Unexpected RPC method '+method);
   return Response.json({jsonrpc:'2.0',id,result});
 });
 return {current,calls};
}
test('signed EOA proof binds to current authority and matching chain evidence from both providers',async t=>{
 const {calls}=provider(t);const evidence=await verifyClaimAuthority(proof);
 assert.equal(evidence.authority,address);assert.equal(evidence.signatureType,'eoa');assert.equal(evidence.blockNumber,236);
 assert.equal(evidence.chainId,4663);assert.equal(calls.size,2);
});
test('contract mismatch and unknown projects do not use RPC',async t=>{
 const {calls}=provider(t);
 for(const changed of [{contract:address},{projectId:'moneymomos'},{projectId:'untrusted'}])await assert.rejects(verifyClaimAuthority({...proof,...changed}),e=>e.status===422);
 assert.equal(calls.size,0);
});
test('wrong message, authority transfer, changed runtime and conflicting providers fail closed',async t=>{
 const {current}=provider(t);
 await assert.rejects(verifyClaimAuthority({...proof,message:message+'!'}),e=>e.status===422);
 current.tipOwner=contract;await assert.rejects(verifyClaimAuthority(proof),e=>e.status===422);delete current.tipOwner;
 current.contractCode='0x363d3d';await assert.rejects(verifyClaimAuthority(proof),e=>e.status===422);delete current.contractCode;
 for(const issue of ['stale','disagree','reorg','offline']){
  current[issue]=true;await assert.rejects(verifyClaimAuthority(proof),e=>e.status===503);delete current[issue];
 }
 current.chainId='0xb626';await assert.rejects(verifyClaimAuthority(proof),e=>e.status===503);
});
test('ERC1271 proof requires digest-specific acceptance and is checked again upon approval',async t=>{
 const {current,calls}=provider(t,{signerCode:'0x6001'});const evidence=await verifyClaimAuthority(proof);
 assert.equal(evidence.signatureType,'erc1271');assert.deepEqual([...calls.values()].map(h=>h.length),[12,12]);
 current.bad1271=true;await assert.rejects(verifyClaimAuthority(proof),e=>e.status===422);
 current.permissive=true;await assert.rejects(verifyClaimAuthority(proof),e=>e.status===422);
});
