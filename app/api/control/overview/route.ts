import {database} from '@/lib/server/runtime';
import {requireControl,controlQuery} from '@/lib/server/control-access';
import {controlOverview} from '@/lib/server/control-overview';
import {handle,json} from '@/lib/server/http';
export const dynamic='force-dynamic';
export async function GET(request:Request){return handle(async()=>{const actor=await requireControl(request,'overview');controlQuery(request,[]);return json(await controlOverview(database(),actor));});}
