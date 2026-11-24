import {database} from '@/lib/server/runtime';
import {requireControl,controlQuery} from '@/lib/server/control-access';
import {controlContent,contentListInput} from '@/lib/server/control-content';
import {handle,json} from '@/lib/server/http';
export const dynamic='force-dynamic';
export async function GET(request:Request){return handle(async()=>{await requireControl(request,'content');return json(await controlContent(database(),contentListInput(controlQuery(request,['kind','visibility','q','page','pageSize']))));});}
