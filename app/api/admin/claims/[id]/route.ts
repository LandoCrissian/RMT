import {controlDatabase} from '@/lib/server/control-database';
import {reviewAccountScope} from '@/lib/server/review-scope';
import { validateClaimDecision } from '@/lib/submission-validation';
import { claimCheckHistory,reviewClaim } from '@/lib/server/claims';
import { database,requireAdmin } from '@/lib/server/runtime';
import { handle,json,readMutation } from '@/lib/server/http';
export const dynamic='force-dynamic';
export async function POST(request:Request,context:{params:Promise<{id:string}>}){return handle(async()=>{
  const user=await requireAdmin(request),input=validateClaimDecision(await readMutation(request)),{id}=await context.params;
  reviewAccountScope(request,user.userId);
  return json({claim:await reviewClaim(controlDatabase(database(),user),user.userId,id,input,user.role)});
});}

export async function GET(request:Request,context:{params:Promise<{id:string}>}){return handle(async()=>{
  const reviewer=await requireAdmin(request);
  reviewAccountScope(request,reviewer.userId);
  const {id}=await context.params;
  return json(await claimCheckHistory(database(),id,new URL(request.url).searchParams.get('before')));
});}
