import {validateUpdateProjectId, validateUpdatesPage} from '@/lib/project-updates';
import {publicProjectUpdates} from '@/lib/server/project-updates';
import {database} from '@/lib/server/runtime';
import {handle, json} from '@/lib/server/http';
export const dynamic='force-dynamic';
export async function GET(request:Request,context:{params:Promise<{projectId:string}>}){return handle(async()=>{
  const {projectId}=await context.params;
  return json(await publicProjectUpdates(database(),validateUpdateProjectId(projectId),validateUpdatesPage(new URL(request.url),'public')));
});}
