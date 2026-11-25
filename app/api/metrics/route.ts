import {database} from '@/lib/server/runtime';
import {validateMetric} from '@/lib/server/control-analytics';
import {ignoreTelemetry,recordEngagement} from '@/lib/server/engagement';
import {handle,json,readMutation} from '@/lib/server/http';
export const dynamic='force-dynamic';
/** Handles cached release clients with the same intake ceiling and deduplication key. */
export function POST(request:Request){return handle(async()=>{
  if(ignoreTelemetry(request))return json({ok:true});
  const {kind,sessionId,projectId}=validateMetric(await readMutation(request));
  await recordEngagement(database(),{session:sessionId,browser:sessionId,events:[{
    kind,projectId,dimension:kind==='outbound'?'unknown':'Direct or unknown'
  }]},Date.now(),true);
  return json({ok:true});
});}
