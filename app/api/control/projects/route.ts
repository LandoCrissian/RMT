import {database} from '@/lib/server/runtime';
import {requireControl,controlQuery} from '@/lib/server/control-access';
import {controlProjects,projectListInput,createControlProject,validateCreateControlProject} from '@/lib/server/control-projects';
import {handle,json,readMutation} from '@/lib/server/http';
export const dynamic='force-dynamic';
export async function GET(request:Request){return handle(async()=>{await requireControl(request,'projects');return json(await controlProjects(database(),projectListInput(controlQuery(request,['q','visibility','category','page','pageSize']))));});}
export async function POST(request:Request){return handle(async()=>{const actor=await requireControl(request,'projects'),input=validateCreateControlProject(await readMutation(request));return json({project:await createControlProject(database(),actor,input)},201);});}
