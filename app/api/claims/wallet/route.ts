import {database,requireIdentity} from '@/lib/server/runtime';
import {requireCommunityIntake} from '@/lib/server/control-settings';
import {libraryAccountConflict} from '@/lib/server/library';
import {handle,json,readMutation} from '@/lib/server/http';
import {cookieValue} from '@/lib/server/firebase-auth';
import {browserCookie,issueWalletClaim,newBrowserKey,verifyWalletClaim} from '@/lib/server/wallet-claim';
import {InputError} from '@/lib/submission-validation';
export const dynamic='force-dynamic';
export function POST(request:Request){return handle(async()=>{
  const user=await requireIdentity(request),conflict=libraryAccountConflict(request,user.userId);
  if(conflict)return conflict;
  const value=await readMutation(request);
  if(!value||typeof value!=='object'||Array.isArray(value))throw new InputError('Choose a claim action.');
  const body=value as Record<string,unknown>,origin=new URL(request.url).origin;
  const db=database();await requireCommunityIntake(db,'claims');
  const cookie=cookieValue(request,browserCookie);
  const bound=cookie&&/^[0-9a-f]{64}$/.test(cookie)?cookie:null;
  if(body.action==='challenge'&&typeof body.projectId==='string'&&body.projectId.length<=120&&typeof body.address==='string'
    &&Object.keys(body).length===3){
    const key=bound??newBrowserKey();
    const response=json(await issueWalletClaim(db,user,origin,key,body.projectId,body.address));
    response.headers.append('Set-Cookie',browserCookie+'='+key+'; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=900');
    return response;
  }
  if(body.action==='verify'&&typeof body.challengeId==='string'&&typeof body.signature==='string'&&Object.keys(body).length===3){
    if(!bound)throw new InputError('Use the same browser that requested this message.',409);
    return json(await verifyWalletClaim(db,user,origin,bound,body.challengeId,body.signature));
  }
  throw new InputError('Invalid claim request.');
});}
