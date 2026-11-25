import type {MiningStatus} from '../lammb-vault';

const endpoint='https://pool.braiins.com/accounts/profile/json/btc/';
const interval=90_000;
const conversions:Record<string,number>={'h/s':1e-12,'kh/s':1e-9,'mh/s':1e-6,'gh/s':1e-3,'th/s':1,'ph/s':1e3,'eh/s':1e6};
type Config={RMT_LAMMB_BRAIINS_READ_TOKEN?:string;RMT_LAMMB_BRAIINS_ACCOUNT?:string};
type NoData=Extract<MiningStatus,{status:'unconfigured'|'unavailable'}>;
const unconfigured:NoData={status:'unconfigured'};
const unavailable:NoData={status:'unavailable'};
let cached:{configIdentity:string;until:number;result:MiningStatus}|undefined;

async function readLimited(response:Response):Promise<unknown> {
  if(!response.ok||!response.body)return null;
  const reader=response.body.getReader(),bytes=new Uint8Array(24_576);let n=0;
  try{
    for(;;){
      const {done,value}=await reader.read();
      if(done)break;
      if(n+value.length>bytes.length){await reader.cancel();return null;}
      bytes.set(value,n);n+=value.length;
    }
    return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes.subarray(0,n)));
  }finally{reader.releaseLock();}
}
const object=(x:unknown):x is Record<string,unknown>=>Boolean(x&&typeof x==='object'&&!Array.isArray(x));
function nonnegative(value:unknown,max:number){
  const n=typeof value==='number'?value:typeof value==='string'&&/^\d{1,22}(?:\.\d{1,12})?$/.test(value)?Number(value):NaN;
  return Number.isFinite(n)&&n>=0&&n<=max?n:null;
}
function btcAmount(value:unknown){
  // Keep pool-reported decimal BTC exact and distinguish it from an on-chain payment.
  return typeof value==='string'&&/^(?:0|[1-9]\d{0,7})(?:\.\d{1,8})?$/.test(value)?value:null;
}
export function interpretBraiinsProfile(body:unknown,account:string,checkedAt:number):MiningStatus{
  if(!object(body)||body.username!==account||!object(body.btc))return unavailable;
  const data=body.btc,unit=typeof data.hash_rate_unit==='string'?data.hash_rate_unit.toLowerCase():'';
  const multiplier=Object.hasOwn(conversions,unit)?conversions[unit]:undefined;
  const hour=nonnegative(data.hash_rate_60m,1e23),day=nonnegative(data.hash_rate_24h,1e23),
    workers=nonnegative(data.ok_workers,100_000_000),reward=btcAmount(data.all_time_reward);
  if(!multiplier||hour===null||day===null||workers===null||!Number.isInteger(workers)||reward===null)return unavailable;
  if(hour*multiplier>1e11||day*multiplier>1e11)return unavailable;
  return {status:'reported',provider:'Braiins Pool',hashrate1hTH:hour*multiplier,hashrate24hTH:day*multiplier,workersOk:workers,
    cumulativePoolRewardBTC:reward,checkedAt};
}
async function fingerprint(account:string,token:string){
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(account+'\n'+token));
  return Array.from(new Uint8Array(bytes),byte=>byte.toString(16).padStart(2,'0')).join('');
}
export async function miningStatus(config:Config):Promise<MiningStatus>{
  const token=config.RMT_LAMMB_BRAIINS_READ_TOKEN?.trim(),account=config.RMT_LAMMB_BRAIINS_ACCOUNT?.trim();
  if(!token&&!account)return unconfigured;
  if(!token||!account||!/^[A-Za-z0-9_@.-]{1,64}$/.test(account)||!/^[\x21-\x7e]{10,512}$/.test(token))return unavailable;
  try{
    const configIdentity=await fingerprint(account,token);
    if(cached?.configIdentity===configIdentity&&cached.until>Date.now())return cached.result;
    // Manual means a redirect cannot forward the credential to an unexpected host.
    const response=await fetch(endpoint,{method:'GET',redirect:'manual',signal:AbortSignal.timeout(3500),
      headers:{'Accept':'application/json','Pool-Auth-Token':token}});
    const result=interpretBraiinsProfile(await readLimited(response),account,Date.now());
    cached={configIdentity,result,until:Date.now()+(result.status==='reported'?interval:12_000)};
    return result;
  }catch{return unavailable;}
}
