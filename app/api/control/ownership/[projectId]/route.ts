import {database} from '@/lib/server/runtime';
import {requireControl} from '@/lib/server/control-access';
import {changeControlOwnership,validateControlOwnership,checkedProjectId} from '@/lib/server/control-projects';
import {handle,json,readMutation} from '@/lib/server/http';
export const dynamic='force-dynamic';
export async function POST(request:Request,context:{params:Promise<{projectId:string}>}){return handle(async()=>{const actor=await requireControl(request,'projects'),{projectId}=await context.params;checkedProjectId(projectId);const input=validateControlOwnership(await readMutation(request));return json({project:await changeControlOwnership(database(),actor,projectId,input)});});}
