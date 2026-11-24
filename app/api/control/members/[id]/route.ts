import {database,runtime} from '@/lib/server/runtime';
import {requireControl,controlQuery} from '@/lib/server/control-access';
import {controlMemberDetail,setMemberStatus} from '@/lib/server/control-members';
import {handle,json,readMutation} from '@/lib/server/http';
export const dynamic='force-dynamic';
type Context={params:Promise<{id:string}>};
export async function GET(request:Request,context:Context){return handle(async()=>{await requireControl(request,'members');controlQuery(request,[]);const {id}=await context.params;return json(await controlMemberDetail(database(),id,runtime().RMT_ADMIN_USER_IDS));});}
export async function PATCH(request:Request,context:Context){return handle(async()=>{const actor=await requireControl(request,'members'),body=await readMutation(request),{id}=await context.params;return json(await setMemberStatus(database(),actor,id,body,runtime().RMT_ADMIN_USER_IDS));});}
