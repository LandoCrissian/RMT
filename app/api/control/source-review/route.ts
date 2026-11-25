import {database} from '@/lib/server/runtime';
import {requireControl} from '@/lib/server/control-access';
import {controlDatabase} from '@/lib/server/control-database';
import {handle,json,readMutation} from '@/lib/server/http';
import {enrichmentQueue,decideEnrichment} from '@/lib/server/source-review';
export const dynamic='force-dynamic';
export function GET(request:Request){return handle(async()=>{await requireControl(request,'review');return json({suggestions:await enrichmentQueue(database())});});}
export function PATCH(request:Request){return handle(async()=>{const a=await requireControl(request,'review');return json(await decideEnrichment(controlDatabase(database(),a),await readMutation(request),a.userId));});}
