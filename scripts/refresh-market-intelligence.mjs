const endpoint='https://rmtlaunch.fun/api/automation/market-intelligence';
const identityUrl=new URL(process.env.ACTIONS_ID_TOKEN_REQUEST_URL);
identityUrl.searchParams.set('audience',endpoint);
const identity=await fetch(identityUrl,{headers:{authorization:'Bearer '+process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN},redirect:'error',signal:AbortSignal.timeout(10000)});
if(!identity.ok)throw Error('Cannot obtain workflow identity (HTTP '+identity.status+').');
const token=(await identity.json()).value;
const response=await fetch(endpoint,{method:'POST',redirect:'error',headers:{authorization:'Bearer '+token},signal:AbortSignal.timeout(180000)});
if(!response.ok)throw Error('Market collector failed (HTTP '+response.status+').');
const result=await response.json();
// Report only allowlisted rotation metadata, never credentials or raw provider responses.
const r=result.rotation;
const rotation=['current','rotated','deferred','failed'].includes(r?.status)?{status:r.status,
  expiresAt:Number.isSafeInteger(r.expiresAt)?new Date(r.expiresAt).toISOString():undefined,
  nextAttemptAt:Number.isSafeInteger(r.nextAttemptAt)?new Date(r.nextAttemptAt).toISOString():undefined}:undefined;
console.log(JSON.stringify({status:result.status,covered:result.covered,tracked:result.tracked,eligible:result.eligible,failures:result.failures,rotation}));
if(rotation&&['failed','deferred'].includes(rotation.status)&&(!r.expiresAt||r.expiresAt-Date.now()<24*3_600_000)){
  throw Error('OpenSea credential renewal needs attention. Existing credentials were not overwritten.');
}
if(!['observed','recent'].includes(result.status)||!result.tracked||result.covered!==result.tracked)throw Error('Live market coverage is not verified.');
