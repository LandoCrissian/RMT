import {validateUpdatesPage} from '@/lib/project-updates';
import {projectUpdatesQueue, updateAccountConflict} from '@/lib/server/project-updates';
import {database, requireAdmin} from '@/lib/server/runtime';
import {handle, json} from '@/lib/server/http';
export const dynamic='force-dynamic';
export async function GET(request:Request){return handle(async()=>{
  const user=await requireAdmin(request),conflict=updateAccountConflict(request,user.userId);
  if(conflict)return conflict;
  return json(await projectUpdatesQueue(database(),validateUpdatesPage(new URL(request.url),'review')));
});}
