import { validateClaimProof } from '@/lib/submission-validation';
import { submitClaim } from '@/lib/server/claims';
import { database,requireIdentity,runtime } from '@/lib/server/runtime';
import { dispatchNotifications } from '@/lib/server/notifications';
import { handle,json,readMutation } from '@/lib/server/http';
export const dynamic='force-dynamic';
export async function PATCH(request:Request,context:{params:Promise<{id:string}>}){return handle(async()=>{
  const user=requireIdentity(request),input=validateClaimProof(await readMutation(request)),{id}=await context.params,db=database();
  const claim=await submitClaim(db,user,id,input);
  await dispatchNotifications(db,runtime());
  return json({claim});
});}
