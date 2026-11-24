import { validateClaimDraft } from '@/lib/submission-validation';
import { createClaim,ownClaims } from '@/lib/server/claims';
import { database,requireIdentity } from '@/lib/server/runtime';
import { handle,json,readMutation } from '@/lib/server/http';
export const dynamic='force-dynamic';
export async function GET(request:Request){return handle(async()=>{const user=requireIdentity(request);return json({claims:await ownClaims(database(),user.userId)});});}
export async function POST(request:Request){return handle(async()=>{
  const user=requireIdentity(request),input=validateClaimDraft(await readMutation(request));
  return json({claim:await createClaim(database(),user,input)},201);
});}
