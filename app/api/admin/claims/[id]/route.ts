import {controlDatabase} from '@/lib/server/control-database';
import {reviewAccountScope} from '@/lib/server/review-scope';
import { validateClaimDecision } from '@/lib/submission-validation';
import { reviewClaim } from '@/lib/server/claims';
import { database,requireAdmin } from '@/lib/server/runtime';
import { handle,json,readMutation } from '@/lib/server/http';
export const dynamic='force-dynamic';
export async function POST(request:Request,context:{params:Promise<{id:string}>}){return handle(async()=>{
  const user=await requireAdmin(request),input=validateClaimDecision(await readMutation(request)),{id}=await context.params;
  reviewAccountScope(request,user.userId);
  return json({claim:await reviewClaim(controlDatabase(database(),user),user.userId,id,input)});
});}
