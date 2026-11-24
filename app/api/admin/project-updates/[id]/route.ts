import {validateReviewUpdate,validateUpdateId} from '@/lib/project-updates';
import {reviewProjectUpdate,updateAccountConflict} from '@/lib/server/project-updates';
import {database,requireAdmin} from '@/lib/server/runtime';
import {handle,json,readMutation} from '@/lib/server/http';
export const dynamic='force-dynamic';
export async function POST(request:Request,context:{params:Promise<{id:string}>}){return handle(async()=>{
  const user=await requireAdmin(request),conflict=updateAccountConflict(request,user.userId);
  if(conflict)return conflict;
  const input=validateReviewUpdate(await readMutation(request)),{id}=await context.params;
  return json({update:await reviewProjectUpdate(database(),user.userId,validateUpdateId(id),input)});
});}
