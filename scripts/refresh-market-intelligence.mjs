const endpoint='https://rmtlaunch.fun/api/automation/market-intelligence';
const identityUrl=new URL(process.env.ACTIONS_ID_TOKEN_REQUEST_URL);
identityUrl.searchParams.set('audience',endpoint);
const identity=await fetch(identityUrl,{headers:{authorization:'Bearer '+process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN},redirect:'error',signal:AbortSignal.timeout(10000)});
if(!identity.ok)throw Error('Cannot obtain workflow identity (HTTP '+identity.status+').');
const token=(await identity.json()).value;
const response=await fetch(endpoint,{method:'POST',redirect:'error',headers:{authorization:'Bearer '+token},signal:AbortSignal.timeout(180000)});
if(!response.ok)throw Error('Market collector failed (HTTP '+response.status+').');
const result=await response.json();
// Report only aggregate status; never log identity tokens or provider responses.
console.log(JSON.stringify({status:result.status,covered:result.covered,tracked:result.tracked,eligible:result.eligible}));
if(!['observed','recent'].includes(result.status))throw Error('Live market coverage is not verified.');
