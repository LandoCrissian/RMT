import {database,runtime} from '@/lib/server/runtime';
import {requireControl} from '@/lib/server/control-access';
import {setControlRole} from '@/lib/server/control-members';
import {handle,json,readMutation} from '@/lib/server/http';
export const dynamic='force-dynamic';
export async function POST(request:Request){return handle(async()=>{const actor=await requireControl(request,'roles'),body=await readMutation(request);return json(await setControlRole(database(),actor,body,runtime().RMT_ADMIN_USER_IDS));});}
