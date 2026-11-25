import {database,requireIdentity} from '@/lib/server/runtime';
import {handle,json,readMutation} from '@/lib/server/http';
import {updateAccountConflict} from '@/lib/server/project-updates';
export const dynamic='force-dynamic';
import {management,changeEvent} from '@/lib/server/calendar';
export function GET(request:Request){return handle(async()=>{const u=await requireIdentity(request);return updateAccountConflict(request,u.userId)??json(await management(database(),new URL(request.url).searchParams.get('projectId')??'',u.userId));});}
export function POST(request:Request){return handle(async()=>{const u=await requireIdentity(request);return updateAccountConflict(request,u.userId)??json(await changeEvent(database(),u.userId,await readMutation(request),false));});}
