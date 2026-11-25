import {createRemoteJWKSet,jwtVerify,type JWTVerifyGetKey} from 'jose';
import {InputError} from '@/lib/submission-validation';

const issuer='https://token.actions.githubusercontent.com';
const keys=createRemoteJWKSet(new URL(issuer+'/.well-known/jwks'),{timeoutDuration:4500});
const repository='LandoCrissian/RMT';
export const collectorAudience='https://rmtlaunch.fun/api/automation/source-review';
export async function requireCollector(request:Request,verifyKey:JWTVerifyGetKey=keys){
  const bearer=request.headers.get('authorization')?.match(/^Bearer ([-\w.]{1,16000})$/);
  if(!bearer)throw new InputError('Collector authentication required.',401);
  try{
    const {payload}=await jwtVerify(bearer[1],verifyKey,{algorithms:['RS256'],issuer,audience:collectorAudience,
      requiredClaims:['exp','iat','sub'],maxTokenAge:'10m',clockTolerance:5});
    if(payload.repository_id!=='1469622214'||payload.repository_owner_id!=='196005653'||payload.repository!==repository||
       payload.ref!=='refs/heads/main'||payload.workflow_ref!==repository+'/.github/workflows/source-review.yml@refs/heads/main'||
       !['schedule','workflow_dispatch'].includes(String(payload.event_name))||
       !(payload.sub==='repo:'+repository+':ref:refs/heads/main'||payload.sub==='repo:LandoCrissian@196005653/RMT@1469622214:ref:refs/heads/main')||
       !/^[0-9]+$/.test(String(payload.run_id)))throw Error();
    return String(payload.run_id);
  }catch{throw new InputError('Collector identity could not be verified.',401);}
}
