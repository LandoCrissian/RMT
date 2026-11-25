import {database,requireIdentity} from '@/lib/server/runtime';
import {handle,json,readMutation} from '@/lib/server/http';
import {updateAccountConflict} from '@/lib/server/project-updates';
export const dynamic='force-dynamic';
import {memberEvents,saveEvent} from '@/lib/server/calendar';
export function GET(request:Request){return handle(async()=>{const u=await requireIdentity(request);return updateAccountConflict(request,u.userId)??json(await memberEvents(database(),u.userId));});}
export function POST(request:Request){return handle(async()=>{const u=await requireIdentity(request);return updateAccountConflict(request,u.userId)??json(await saveEvent(database(),u.userId,await readMutation(request)));});}
