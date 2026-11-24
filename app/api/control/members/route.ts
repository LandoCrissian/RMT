import {database,runtime} from '@/lib/server/runtime';
import {requireControl,controlQuery} from '@/lib/server/control-access';
import {controlMembers} from '@/lib/server/control-members';
import {handle,json} from '@/lib/server/http';
export const dynamic='force-dynamic';
export async function GET(request:Request){return handle(async()=>{await requireControl(request,'members');const query=controlQuery(request,['q','status','role','cursor','limit']);return json(await controlMembers(database(),query,runtime().RMT_ADMIN_USER_IDS));});}
