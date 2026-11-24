import {database,runtime} from '@/lib/server/runtime';
import {requireControl,controlQuery} from '@/lib/server/control-access';
import {controlHealth} from '@/lib/server/control-health';
import {handle,json} from '@/lib/server/http';
export const dynamic='force-dynamic';
export async function GET(request:Request){return handle(async()=>{await requireControl(request,'health');controlQuery(request,[]);return json(await controlHealth(database(),runtime()));});}
