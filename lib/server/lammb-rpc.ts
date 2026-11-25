import {GENESIS_CONTRACT, ROBINHOOD_CHAIN_ID, ROBINHOOD_RPC, ROYALTY_SAMPLE_IDS, ASSETS,
  type RoyaltySnapshot,type TreasurySnapshot,type Asset} from '../lammb-vault';
import {InputError} from '../submission-validation';

export const addressPattern=/^0x[\da-f]{40}$/i;
export const txPattern=/^0x[\da-f]{64}$/i;
export const hexWord=(n:bigint|number)=>n.toString(16).padStart(64,'0');
export const addressWord=(address:string)=>address.slice(2).toLowerCase().padStart(64,'0');
export const tag=(n:number)=>'0x'+n.toString(16);
export const chainUnavailable=()=>new InputError('Robinhood Chain could not be verified. Try again in a moment.',503);
export const isAddress=(v:unknown):v is string=>typeof v==='string'&&addressPattern.test(v)&&!/^0x0{40}$/i.test(v);
export function quantity(v:unknown):bigint {
  if(typeof v!=='string'||!/^0x(?:0|[1-9a-f][\da-f]{0,63})$/i.test(v))throw chainUnavailable();
  return BigInt(v);
}
export function wordValue(v:unknown):bigint{
  if(typeof v!=='string'||!txPattern.test(v))throw chainUnavailable();
  return BigInt(v);
}
export function safeNumber(v:bigint) {
  if(v<BigInt(0)||v>BigInt(Number.MAX_SAFE_INTEGER))throw chainUnavailable();
  return Number(v);
}

class ProviderError extends Error {}

async function boundedJson(response:Response) {
  if(!response.ok||!response.body)throw new ProviderError('http-'+response.status);
  const reader=response.body.getReader(),chunks:Uint8Array[]=[];let total=0;
  try{
    while(true){
      const {value,done}=await reader.read();
      if(done)break;
      total+=value.byteLength;
      if(total>262_144||chunks.length>1024){await reader.cancel();throw chainUnavailable();}
      chunks.push(value);
    }
    const bytes=new Uint8Array(total);let offset=0;
    for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
    return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
  }finally{reader.releaseLock();}
}
export function rpcFor(url:string,signal:AbortSignal) {
  let id=0;
  return async(method:string,params:unknown[],allowRevert=false):Promise<unknown>=>{
    const requestId=++id;
    if(requestId>24)throw chainUnavailable();
    try{
      const response=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},redirect:'manual',signal,
        body:JSON.stringify({jsonrpc:'2.0',id:requestId,method,params})});
      // Sites supports manual redirects. Reject every redirect through the HTTP status check.
      const data=await boundedJson(response);
      if(data?.id!==requestId||data.jsonrpc!=='2.0')throw new ProviderError(method+'-response');
      if(data.error){
        if(allowRevert&&/execution reverted/i.test(String(data.error.message)))return null;
        throw new ProviderError(method+'-rpc-'+(Number.isInteger(data.error.code)?data.error.code:'error'));
      }
      if(!Object.hasOwn(data,'result'))throw new ProviderError(method+'-result');
      return data.result;
    }catch(error){
      if(error instanceof ProviderError)throw error;
      throw new ProviderError(method+': '+(error instanceof Error?error.message.slice(0,110):'fetch-failure'));
    }
  };
}
export type VaultRpc=ReturnType<typeof rpcFor>;
export function parseBlock(value:unknown) {
  const v=value as {number?:unknown;timestamp?:unknown;hash?:unknown}|null;
  if(!v||typeof v.hash!=='string'||!txPattern.test(v.hash))throw chainUnavailable();
  return {number:safeNumber(quantity(v.number)),timestamp:safeNumber(quantity(v.timestamp)),hash:v.hash.toLowerCase()};
}
let lastReported=0;
export async function vaultChain<T>(run:(rpc:VaultRpc,head:ReturnType<typeof parseBlock>)=>Promise<T>,history=false):Promise<T> {
  // Each provider must establish chain identity and a fresh head before any evidence is accepted.
  const archive='https://robinhood.rpc.pinax.network', publicNode='https://robinhood-rpc.publicnode.com';
  const providers=history?[archive,publicNode,ROBINHOOD_RPC]:[ROBINHOOD_RPC,publicNode,archive];
  const diagnostics:string[]=[];
  for(const url of providers){
    const rpc=rpcFor(url,AbortSignal.timeout(history?10_000:6_000));
    try{
      const [id,latest]=await Promise.all([rpc('eth_chainId',[]),rpc('eth_getBlockByNumber',['latest',false])]);
      const head=parseBlock(latest),age=Date.now()/1000-head.timestamp;
      if(quantity(id)!==BigInt(ROBINHOOD_CHAIN_ID))throw new ProviderError('wrong-chain');
      if(age>90||age< -25||head.number<1)throw new ProviderError('head-age-'+Math.round(age));
      return await run(rpc,head);
    }catch(e){
      if(e instanceof InputError&&e.status!==503)throw e;
      diagnostics.push(new URL(url).hostname+': '+(e instanceof ProviderError?e.message:e instanceof InputError?'invalid-chain-data':e instanceof Error?e.name+': '+e.message.slice(0,110):'failure'));
    }
  }
  if(Date.now()-lastReported>30_000){lastReported=Date.now();console.warn('LAMMB chain checks unavailable',diagnostics.join(' | '));}
  throw chainUnavailable();
}
export async function genesisBalance(rpc:VaultRpc,address:string,blockTag:string){
  const balance=wordValue(await rpc('eth_call',[{to:GENESIS_CONTRACT,data:'0x70a08231'+addressWord(address)},blockTag]));
  return safeNumber(balance);
}
export async function royaltyAt(rpc:VaultRpc,id:bigint,sale:bigint,blockTag:string){
  const result=await rpc('eth_call',[{to:GENESIS_CONTRACT,data:'0x2a55205a'+hexWord(id)+hexWord(sale)},blockTag]);
  if(typeof result!=='string'||!/^0x0{24}[\da-f]{104}$/i.test(result))throw chainUnavailable();
  return {receiver:('0x'+result.slice(26,66)).toLowerCase(),amount:BigInt('0x'+result.slice(66))};
}
export async function currentTreasury(address:string|null) {
  return vaultChain(async(rpc,head)=>{
    const at=tag(head.number);
    const basis=BigInt(10_000);
    const [samples,balances]=await Promise.all([
      Promise.all(ROYALTY_SAMPLE_IDS.map(id=>royaltyAt(rpc,BigInt(id),basis,at))),
      address?Promise.all((Object.keys(ASSETS) as Asset[]).map(async asset=>{
        const result=asset==='ETH'?quantity(await rpc('eth_getBalance',[address,at])):
          wordValue(await rpc('eth_call',[{to:ASSETS[asset].address,data:'0x70a08231'+addressWord(address)},at]));
        return [asset,result.toString()] as const;
      })):Promise.resolve(null)
    ]);
    const first=samples[0];
    const royalty:RoyaltySnapshot|null=isAddress(first.receiver)&&first.amount<=basis&&
      samples.every(s=>s.receiver===first.receiver&&s.amount===first.amount)
      ?{block:head.number,receiver:first.receiver,rateBps:Number(first.amount),sampleIds:ROYALTY_SAMPLE_IDS}:null;
    const treasury:TreasurySnapshot|null=address&&balances?{address,block:head.number,balances:Object.fromEntries(balances)}:null;
    return {royalty,treasury};
  });
}
