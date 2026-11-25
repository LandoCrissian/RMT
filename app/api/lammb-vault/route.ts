import {database,runtime} from '@/lib/server/runtime';
import {cookieValue} from '@/lib/server/firebase-auth';
import {handle,json,readMutation} from '@/lib/server/http';
import {InputError} from '@/lib/submission-validation';
import {BROWSER_COOKIE,SESSION_COOKIE,COOKIE_AGE,TOKEN_RE,vaultToken,
  issueVaultChallenge,confirmVaultWallet,disconnectVault,withVaultMember} from '@/lib/server/lammb-wallet';
import {publicVault,readTreasuryConfig} from '@/lib/server/lammb-treasury';
import {royaltyLedger} from '@/lib/server/lammb-royalties';
import {miningStatus} from '@/lib/server/lammb-mining';

export const dynamic='force-dynamic';
function token(request:Request,name:string) {
  const value=cookieValue(request,name);
  return value&&TOKEN_RE.test(value)?value:null;
}
function cookie(response:Response,name:string,value:string,age:number){
  response.headers.append('Set-Cookie',name+'='+value+'; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age='+age);
}
const context=(request:Request,browser:string)=>({db:database(),origin:new URL(request.url).origin,browser});

export function GET(request:Request){
  return handle(async()=>{
    const query=new URL(request.url).searchParams,view=query.get('view');
    if(query.size===0)return json(await publicVault(database()));
    if(query.size!==1||view!=='member')throw new InputError('Invalid Vault view.');
    const browser=token(request,BROWSER_COOKIE),session=token(request,SESSION_COOKIE);
    if(!browser||!session)throw new InputError('Connect and verify your wallet to open the Vault.',401,'wallet_required');
    const ctx=context(request,browser);
    return json(await withVaultMember(ctx,session,async()=>{
      const {address}=await readTreasuryConfig(ctx.db);
      const [ledger,mining]=await Promise.all([royaltyLedger(ctx.db,address),miningStatus(runtime())]);
      return {...ledger,mining};
    }));
  });
}
export function POST(request:Request) {
  return handle(async()=>{
    const value=await readMutation(request);
    if(!value||typeof value!=='object'||Array.isArray(value))throw new InputError('Choose a wallet action.');
    const body=value as Record<string,unknown>,browser=token(request,BROWSER_COOKIE);
    if(body.action==='challenge'&&Object.keys(body).length===2){
      const key=browser??vaultToken();
      const source=request.headers.get('cf-connecting-ip')??'';
      const result=await issueVaultChallenge(context(request,key),body.address,/^[\da-f:.]{3,45}$/i.test(source)?source:'');
      const response=json(result);
      cookie(response,BROWSER_COOKIE,key,COOKIE_AGE);
      cookie(response,SESSION_COOKIE,'',0);
      return response;
    }
    if(body.action==='verify'&&Object.keys(body).length===3){
      if(!browser)throw new InputError('Use the browser that prepared the wallet message.',409);
      const {result,session}=await confirmVaultWallet(context(request,browser),body.challengeId,body.signature);
      const response=json(result);
      if(session){
        cookie(response,BROWSER_COOKIE,browser,COOKIE_AGE);
        cookie(response,SESSION_COOKIE,session,COOKIE_AGE);
      }
      return response;
    }
    if(body.action==='disconnect'&&Object.keys(body).length===1){
      if(browser)await disconnectVault(context(request,browser));
      const response=json({disconnected:true});
      cookie(response,SESSION_COOKIE,'',0);
      // Keep the random browser rate-limit key until its existing short expiry.
      return response;
    }
    throw new InputError('Invalid wallet request.');
  });
}
