import {validateUpdateProjectId} from '@/lib/project-updates';
import {publicBuildersForProject} from '@/lib/server/profiles';
import {database} from '@/lib/server/runtime';
import {handle,json} from '@/lib/server/http';
export const dynamic='force-dynamic';
export async function GET(request:Request,context:{params:Promise<{projectId:string}>}){return handle(async()=>{
  if(new URL(request.url).search)return json({error:'This builder list takes no query parameters.'},400);
  const {projectId}=await context.params;
  return json(await publicBuildersForProject(database(),validateUpdateProjectId(projectId)));
});}
