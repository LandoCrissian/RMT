import {secp256k1} from '@noble/curves/secp256k1';
import {keccak_256} from '@noble/hashes/sha3';
import {bytesToHex,hexToBytes,concatBytes,utf8ToBytes} from '@noble/hashes/utils';
import {claimContract} from '../claim-contracts';
import {InputError} from '../submission-validation';

const endpoints=['https://rpc.mainnet.chain.robinhood.com','https://robinhood.rpc.pinax.network'];
const ownerSelector='0x8da5cb5b',magic='1626ba7e';
const magicReturn='0x'+magic.padEnd(64,'0');
const unavailable=()=>new InputError('Chain evidence is unavailable. Retry later or submit manual evidence.',503);
const unsupported=()=>new InputError('The contract authority could not be verified. Use manual review.',422);
const invalid=()=>new InputError('This signature or wallet does not prove the collection authority.',422);
const addressPattern=/^0x[0-9a-fA-F]{40}$/;
const codePattern=/^0x(?:[a-fA-F0-9]{2})*$/;
const hashPattern=/^0x[a-fA-F0-9]{64}$/;

function digest(message:string) {
  const bytes=utf8ToBytes(message);
  return keccak_256(concatBytes(utf8ToBytes('\x19Ethereum Signed Message:\n'+bytes.length),bytes));
}
function eoaMatches(address:string,hash:Uint8Array,signature:string) {
  if(signature.length!==132)return false;
  try{
    const bytes=hexToBytes(signature.slice(2));
    const recovery=bytes[64]>=27?bytes[64]-27:bytes[64];
    if(recovery!==0&&recovery!==1)return false;
    const sig=secp256k1.Signature.fromCompact(bytes.subarray(0,64));
    if(sig.hasHighS())return false;
    const publicKey=sig.addRecoveryBit(recovery).recoverPublicKey(hash).toBytes(false);
    return bytesToHex(keccak_256(publicKey.subarray(1)).subarray(12))===address.slice(2);
  }catch{return false;}
}
function walletCall(hash:Uint8Array,sig:string) {
  const bytes=sig.slice(2),size=bytes.length/2;
  return '0x'+magic+bytesToHex(hash)+(64).toString(16).padStart(64,'0')+
    size.toString(16).padStart(64,'0')+bytes.padEnd(Math.ceil(size/32)*64,'0');
}

async function boundedJson(response:Response) {
  if(!response.ok||!response.body)throw unavailable();
  const reader=response.body.getReader(),chunks:Uint8Array[]=[];let size=0;
  try{
    while(true){
      const {value,done}=await reader.read();
      if(done)break;
      size+=value.byteLength;
      if(size>512*1024){await reader.cancel();throw unavailable();}
      chunks.push(value);
    }
    return JSON.parse(new TextDecoder().decode(concatBytes(...chunks)));
  }finally{reader.releaseLock();}
}

function provider(url:string,signal:AbortSignal) {
  let count=0;
  return async(method:string,params:unknown[],allowInvalidRevert=false)=>{
    const id=++count;if(id>12)throw unavailable();
    try{
      const response=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},redirect:'error',
        signal,body:JSON.stringify({id,jsonrpc:'2.0',method,params})});
      const data=await boundedJson(response);
      if(data?.id!==id||data.jsonrpc!=='2.0')throw unavailable();
      if(data.error){
        if(allowInvalidRevert&&/execution reverted/i.test(String(data.error.message)))return null;
        throw unavailable();
      }
      if(data.result==null)throw unavailable();
      return data.result;
    }catch{throw unavailable();}
  };
}
type Rpc=ReturnType<typeof provider>;
function quantity(value:unknown) {
  if(typeof value!=='string'||!/^0x(?:0|[1-9a-f][0-9a-f]{0,12})$/i.test(value))throw unavailable();
  const n=Number(BigInt(value));if(!Number.isSafeInteger(n))throw unavailable();return n;
}
function checkedBlock(block:{number:string;hash:string;timestamp:string}|null){
  if(!block||!hashPattern.test(block.hash))throw unavailable();
  const number=quantity(block.number),timestamp=quantity(block.timestamp),age=Date.now()/1000-timestamp;
  if(age>180||age< -30)throw unavailable();
  return {number,hash:block.hash.toLowerCase(),timestamp};
}
async function agrees<T>(requests:Rpc[],verify:(rpc:Rpc)=>Promise<T>):Promise<T> {
  const [first,second]=await Promise.all(requests.map(verify));
  if(JSON.stringify(first)!==JSON.stringify(second))throw unavailable();
  return first;
}

export type ClaimProof={projectId:string;contract:string;address:string;message:string;signature:string};
export async function verifyClaimAuthority(proof:ClaimProof) {
  const target=claimContract(proof.projectId);
  if(!target||typeof proof.contract!=='string'||target.address!==proof.contract.toLowerCase())throw unsupported();
  if(!addressPattern.test(proof.address)||/^0x0{40}$/i.test(proof.address)||typeof proof.message!=='string'||
      !proof.message||proof.message.length>4096||typeof proof.signature!=='string'||!/^0x(?:[a-f0-9]{2}){1,4096}$/i.test(proof.signature))throw invalid();
  const address=proof.address.toLowerCase(),hash=digest(proof.message);
  const signal=AbortSignal.timeout(12_000),providers=endpoints.map(url=>provider(url,signal));
  const tips=await Promise.all(providers.map(async rpc=>{
    if(quantity(await rpc('eth_chainId',[]))!==4663)throw unavailable();
    return checkedBlock(await rpc('eth_getBlockByNumber',['latest',false])).number;
  }));
  if(Math.abs(tips[0]-tips[1])>120||Math.min(...tips)<=20)throw unavailable();
  const height=Math.min(...tips)-20,tag='0x'+height.toString(16);
  const block=await agrees(providers,async rpc=>checkedBlock(await rpc('eth_getBlockByNumber',[tag,false])));
  if(block.number!==height)throw unavailable();
  const ownerData='0x'+'0'.repeat(24)+address.slice(2);
  const signatureType=await agrees(providers,async rpc=>{
    const code=await rpc('eth_getCode',[target.address,tag]);
    if(typeof code!=='string'||!codePattern.test(code)||'0x'+bytesToHex(keccak_256(hexToBytes(code.slice(2))))!==target.codeHash)throw unsupported();
    for(const at of [tag,'latest']){
      const response=await rpc('eth_call',[{to:target.address,data:ownerSelector},at]);
      if(typeof response!=='string'||response.toLowerCase()!==ownerData)throw invalid();
    }
    const walletCode=await rpc('eth_getCode',[address,tag]);
    if(typeof walletCode!=='string'||!codePattern.test(walletCode))throw unsupported();
    if(walletCode==='0x'){
      if(await rpc('eth_getCode',[address,'latest'])!=='0x')throw unsupported();
      if(!eoaMatches(address,hash,proof.signature))throw invalid();
      return 'eoa' as const;
    }
    for(const at of [tag,'latest']){
      const call=(h:Uint8Array,negative:boolean)=>rpc('eth_call',[{to:address,data:walletCall(h,proof.signature),gas:'0x7a120'},at],negative);
      const accepted=await call(hash,false);
      if(typeof accepted!=='string'||accepted.toLowerCase()!==magicReturn)throw invalid();
      // A contract that accepts the same signature for a distinct digest cannot prove this challenge.
      const wrong=await call(digest('Invalid RMT claim proof\n'+proof.message),true);
      if(wrong!==null&&(typeof wrong!=='string'||!/^0x[0-9a-f]{64}$/i.test(wrong)||wrong.toLowerCase()===magicReturn))throw unsupported();
    }
    return 'erc1271' as const;
  });
  const final=await agrees(providers,async rpc=>checkedBlock(await rpc('eth_getBlockByNumber',[tag,false])));
  if(final.hash!==block.hash||final.number!==height||final.timestamp!==block.timestamp)throw unavailable();
  return {chainId:target.chainId,contract:target.address,address,authority:address,blockNumber:height,blockHash:block.hash,
    blockTimestamp:block.timestamp,checkedAt:Date.now(),model:target.model,signatureType};
}
