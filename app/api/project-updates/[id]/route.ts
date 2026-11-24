import {validateChangeUpdate, validateUpdateId} from '@/lib/project-updates';
import {changeProjectUpdate, updateAccountConflict} from '@/lib/server/project-updates';
import {database, requireIdentity, runtime} from '@/lib/server/runtime';
import {dispatchNotifications} from '@/lib/server/notifications';
import {handle, json, readMutation} from '@/lib/server/http';
export const dynamic='force-dynamic';
export async function PATCH(request:Request,context:{params:Promise<{id:string}>}){return handle(async()=>{
  const user=await requireIdentity(request),conflict=updateAccountConflict(request,user.userId);
  if(conflict)return conflict;
  const input=validateChangeUpdate(await readMutation(request)),{id}=await context.params,db=database();
  const update=await changeProjectUpdate(db,user,validateUpdateId(id),input);
  if(input.action==='submit')await dispatchNotifications(db,runtime());
  return json({update});
});}
