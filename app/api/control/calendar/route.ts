import {database} from '@/lib/server/runtime';
import {handle,json,readMutation} from '@/lib/server/http';
import {requireControl} from '@/lib/server/control-access';
import {controlDatabase} from '@/lib/server/control-database';
import {controlWorkspace,changeEvent} from '@/lib/server/calendar';
export const dynamic='force-dynamic';
export function GET(request:Request){return handle(async()=>{await requireControl(request,'review');return json(await controlWorkspace(database()));});}
export function PATCH(request:Request){return handle(async()=>{const a=await requireControl(request,'review');return json(await changeEvent(controlDatabase(database(),a),a.userId,await readMutation(request),true));});}
