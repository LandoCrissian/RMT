import {database,runtime} from '@/lib/server/runtime';
import {requireControl,controlQuery} from '@/lib/server/control-access';
import {controlExport} from '@/lib/server/control-exports';
import {handle} from '@/lib/server/http';
export const dynamic='force-dynamic';
export async function GET(request:Request){return handle(async()=>{const actor=await requireControl(request,'exports'),query=controlQuery(request,['dataset','format','cursor','limit']);return controlExport(database(),actor,query,runtime().RMT_ADMIN_USER_IDS);});}
