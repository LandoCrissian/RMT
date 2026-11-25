import {database} from '@/lib/server/runtime';
import {handle,json,readMutation} from '@/lib/server/http';
import {ignoreTelemetry,recordEngagement} from '@/lib/server/engagement';
export const dynamic='force-dynamic';
export function POST(request:Request){return handle(async()=>{
  if(ignoreTelemetry(request))return json({ok:true});
  await recordEngagement(database(),await readMutation(request));
  return json({ok:true});
});}
