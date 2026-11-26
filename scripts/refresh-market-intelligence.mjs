const endpoint='https://rmtlaunch.fun/api/automation/market-intelligence';
const identityUrl=new URL(process.env.ACTIONS_ID_TOKEN_REQUEST_URL);
identityUrl.searchParams.set('audience',endpoint);
const identity=await fetch(identityUrl,{headers:{authorization:'Bearer '+process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN},redirect:'error',signal:AbortSignal.timeout(10000)});
if(!identity.ok)throw Error('Cannot obtain workflow identity (HTTP '+identity.status+').');
const token=(await identity.json()).value;
const shadow=process.argv.includes('--chain-shadow');
async function request(chain,operation){
  const response=await fetch(endpoint,{method:'POST',redirect:'error',headers:{authorization:'Bearer '+token,
    ...(operation?{'x-rmt-market-operation':operation}:chain?{'x-rmt-market-operation':'chain-shadow'}:{})},signal:AbortSignal.timeout(operation==='nft-discovery-shadow'?105_000:operation?45_000:chain?85_000:180_000)});
  if(!response.ok)throw Error('Market collector failed (HTTP '+response.status+').');
  return response.json();
}
if(process.argv.includes('--nft-discovery-shadow')){
  const result=await request(false,'nft-discovery-shadow');
  console.log('NFT discovery',JSON.stringify(result));
  if(result.status==='disabled')process.exit(0);
  if(!['observed','recent','concurrent'].includes(result.status)||Object.values(result.lanes??{}).some(lane=>lane.status==='unavailable')){
    throw Error('NFT discovery coverage could not be verified.');
  }
  process.exit(0);
}
const chainJob=shadow?null:request(true).then(r=>{
  console.log('Chain shadow',JSON.stringify({status:r.status,provider:r.provider,from:r.from,through:r.through,finalized:r.finalized,lagBlocks:r.lagBlocks,advanced:r.advanced,indexed:r.indexed,cached:r.cached}));
}).catch(()=>console.log('Chain shadow unavailable; OpenSea result checked separately.'));
let result;
try{result=await request(shadow);}finally{await chainJob;}
if(shadow){
  console.log(JSON.stringify({status:result.status,provider:result.provider,from:result.from,through:result.through,finalized:result.finalized,lagBlocks:result.lagBlocks,advanced:result.advanced,indexed:result.indexed,cached:result.cached}));
  if(!['observed','recent'].includes(result.status))throw Error('Chain shadow indexing unavailable.');
  process.exit(0);
}
try{
  // Do not compete with OpenSea sales for burst capacity or retry a rate-limited API.
  if(!result.failures?.['http-429']&&!result.failures?.['rate-limit-hold']){
    const floors=await request(false,'directory-floors');
    console.log('Directory floors',JSON.stringify({status:floors.status,covered:floors.covered,tracked:floors.tracked,eligible:floors.eligible,failures:floors.failures}));
  }
}catch{console.log('Directory floor prices temporarily unavailable.');}
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
