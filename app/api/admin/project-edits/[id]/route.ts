import {controlDatabase} from '@/lib/server/control-database';
import {reviewAccountScope} from '@/lib/server/review-scope';
import { validateEditDecision } from '@/lib/submission-validation';
import { reviewProjectEdit } from '@/lib/server/project-edits';
import { database,requireAdmin } from '@/lib/server/runtime';
import { handle,json,readMutation } from '@/lib/server/http';
export const dynamic='force-dynamic';
export async function POST(request:Request,context:{params:Promise<{id:string}>}){return handle(async()=>{
  const user=await requireAdmin(request),input=validateEditDecision(await readMutation(request)),{id}=await context.params;
  reviewAccountScope(request,user.userId);
  return json({edit:await reviewProjectEdit(controlDatabase(database(),user),user.userId,id,input)});
});}
