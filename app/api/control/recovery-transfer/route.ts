import {hasSameOrigin} from '@/lib/server/auth';
import {checkFirebaseAccount,cookieValue,sessionCookie,verifyFirebaseToken} from '@/lib/server/firebase-auth';
import {encryptedRecoveryStream,recoveryPublicKey,type RecoveryKind} from '@/lib/server/recovery-archive';
import {assessDatabaseTransfer,captureDatabase} from '@/lib/server/recovery-snapshot';
import {databaseFrames,prepareArtwork} from '@/lib/server/recovery-transfer';
import {runtime} from '@/lib/server/runtime';
import {InputError} from '@/lib/submission-validation';

export const dynamic='force-dynamic';
type Config=ReturnType<typeof runtime>&{
  RMT_TRANSFER_OWNER_UID?:string;
  RMT_TRANSFER_START?:string;
  RMT_TRANSFER_UNTIL?:string;
  RMT_TRANSFER_CAPTURE_ID?:string;
  RMT_TRANSFER_MODE?:string;
  RMT_TRANSFER_PUBLIC_KEY?:string;
};
type TransferMode=RecoveryKind|'preflight';
const headers={'Cache-Control':'private, no-store, max-age=0','CDN-Cache-Control':'no-store',
  'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'DENY','Cross-Origin-Resource-Policy':'same-origin','X-Robots-Tag':'noindex'};
const captureIdPattern=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const closed=()=>new Response('Recovery transfer is unavailable.',{status:404,headers});
const rejected=(status:number)=>new Response(status===401?'Fresh owner sign-in required.':'Recovery transfer could not be completed.',{status,headers});
export const HEAD=()=>new Response(null,{status:404,headers});
export const OPTIONS=closed;
export const PUT=closed;
export const PATCH=closed;
export const DELETE=closed;

function activeConfig(config:Config) {
  const start=Date.parse(config.RMT_TRANSFER_START??'');
  const end=Date.parse(config.RMT_TRANSFER_UNTIL??'');
  const owner=config.RMT_TRANSFER_OWNER_UID;
  const mode=config.RMT_TRANSFER_MODE;
  const key=config.RMT_TRANSFER_PUBLIC_KEY;
  const id=config.RMT_TRANSFER_CAPTURE_ID;
  const open=()=>Number.isFinite(start)&&Number.isFinite(end)&&start<=Date.now()&&Date.now()<end&&end-start<=600_000;
  if(!owner || !(config.RMT_ADMIN_USER_IDS??'').split(',').map(value=>value.trim()).includes('firebase:'+owner) ||
     (mode!=='artwork'&&mode!=='database'&&mode!=='preflight') || !open()) return null;
  if(mode==='preflight') return {owner,mode,open} as const;
  if(!id || !captureIdPattern.test(id) || !key) return null;
  return {owner,mode,key,id,open} as const;
}
async function checkOwner(request:Request,owner:string,mode:TransferMode) {
  const token=cookieValue(request,sessionCookie);
  if(!token || token.length>8192) throw new InputError('Sign in again.',401);
  const identity=await verifyFirebaseToken(token);
  if(identity.firebaseUid!==owner || !identity.emailVerified || !['password','google.com'].includes(identity.signInProvider)) {
    throw new InputError('Owner required.',403);
  }
  // Metadata-only preflight cannot download database rows or artwork. Keep the
  // stricter five-minute reauthentication requirement on both extract modes.
  const maxAuthAgeMs=mode==='preflight'?30*60_000:5*60_000;
  const validUntil=identity.authTime*1000+maxAuthAgeMs;
  if(!Number.isFinite(validUntil) || Date.now()>=validUntil) throw new InputError('Sign in again.',401);
  await checkFirebaseAccount(token,identity.firebaseUid,identity.authTime);
  return ()=>Date.now()<validUntil;
}
async function requestedMode(request:Request,mode:TransferMode) {
  if(!/^application\/x-www-form-urlencoded(?:\s*;|$)/i.test(request.headers.get('content-type')??'') || !request.body) return false;
  const reader=request.body.getReader();
  const limit=32;
  const bytes=new Uint8Array(limit);
  let length=0;
  try {
    for(;;) {
      const {done,value}=await reader.read();
      if(done) break;
      if(length+value.length>limit) {await reader.cancel();return false;}
      bytes.set(value,length);length+=value.length;
    }
  } finally {reader.releaseLock();}
  return new TextDecoder().decode(bytes.subarray(0,length))===('action='+mode);
}

export async function GET(request:Request) {
  try {
    const config=activeConfig(runtime());
    if(!config) return closed();
    const fresh=await checkOwner(request,config.owner,config.mode);
    if(!config.open() || !fresh()) return closed();
    const detail=config.mode==='preflight'?'Run an aggregate count and size check. No records are returned.':'Download an encrypted '+config.mode+' archive. Keep the private key off this site.';
    const label=config.mode==='preflight'?'Check transfer capacity':'Download encrypted '+config.mode;
    return new Response('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>RMT recovery transfer</title><h1>RMT recovery transfer</h1><p>'+detail+'</p><form method="post" action="/api/control/recovery-transfer"><button type="submit" name="action" value="'+config.mode+'">'+label+'</button></form></html>',{headers:{...headers,
      'Content-Type':'text/html; charset=utf-8','Referrer-Policy':'same-origin','Content-Security-Policy':"default-src 'none'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"}});
  } catch(error) { return rejected(error instanceof InputError?error.status:503); }
}

export async function POST(request:Request) {
  try {
    const env=runtime();
    const config=activeConfig(env);
    if(!config) return closed();
    if(!hasSameOrigin(request)) return rejected(403);
    if(!await requestedMode(request,config.mode)) return closed();
    const fresh=await checkOwner(request,config.owner,config.mode);
    const active=()=>config.open()&&fresh()&&!request.signal.aborted;
    if(!active()) return closed();
    if(config.mode==='preflight'){
      if(!env.DB) return rejected(503);
      const result=await assessDatabaseTransfer(env.DB);
      return active()?Response.json(result,{headers}):closed();
    }
    const key=await recoveryPublicKey(config.key);
    if(!active()) return closed();
    const frames=config.mode==='database'
      ? (env.DB ? databaseFrames(await captureDatabase(env.DB)) : null)
      : (env.BUCKET ? (await prepareArtwork(env.BUCKET,active))() : null);
    if(!active()) return closed();
    if(!frames) return rejected(503);
    return new Response(await encryptedRecoveryStream(key,config.id,config.mode,frames,active),{headers:{...headers,
      'Content-Type':'application/octet-stream','Content-Disposition':'attachment; filename="rmt-'+config.mode+'.rmtenc"'}});
  } catch(error) {
    // Suppress provider diagnostics, headers, storage identifiers and record data.
    return rejected(error instanceof InputError?error.status:503);
  }
}
