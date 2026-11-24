import {database} from '@/lib/server/runtime';
import {requireControl} from '@/lib/server/control-access';
import {controlProject,changeControlProject,validateChangeControlProject,checkedProjectId} from '@/lib/server/control-projects';
import {handle,json,readMutation} from '@/lib/server/http';
export const dynamic='force-dynamic';
type Context={params:Promise<{id:string}>};
export async function GET(request:Request,context:Context){return handle(async()=>{await requireControl(request,'projects');const {id}=await context.params;return json({project:await controlProject(database(),id)});});}
export async function PATCH(request:Request,context:Context){return handle(async()=>{const actor=await requireControl(request,'projects'),{id}=await context.params;checkedProjectId(id);const input=validateChangeControlProject(await readMutation(request),id);return json({project:await changeControlProject(database(),actor,id,input)});});}
