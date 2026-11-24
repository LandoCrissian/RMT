import {validateCreateUpdate, validateUpdateProjectId, validateUpdatesPage} from '@/lib/project-updates';
import {createProjectUpdate, ownProjectUpdates, updateAccountConflict} from '@/lib/server/project-updates';
import {database, requireIdentity} from '@/lib/server/runtime';
import {handle, json, readMutation} from '@/lib/server/http';
export const dynamic='force-dynamic';
export async function GET(request:Request){return handle(async()=>{
  const user=await requireIdentity(request),conflict=updateAccountConflict(request,user.userId);
  if(conflict)return conflict;
  const url=new URL(request.url),page=validateUpdatesPage(url,'owner');
  const projectId=url.searchParams.has('projectId')?validateUpdateProjectId(url.searchParams.get('projectId')):undefined;
  return json(await ownProjectUpdates(database(),user.userId,page,projectId));
});}
export async function POST(request:Request){return handle(async()=>{
  const user=await requireIdentity(request),conflict=updateAccountConflict(request,user.userId);
  if(conflict)return conflict;
  const input=validateCreateUpdate(await readMutation(request));
  return json({update:await createProjectUpdate(database(),user,input)},201);
});}
