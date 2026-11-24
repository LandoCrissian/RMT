import {database} from '@/lib/server/runtime';
import {recordMetric,validateMetric} from '@/lib/server/control-analytics';
import {handle,json,readMutation} from '@/lib/server/http';
export const dynamic='force-dynamic';
export async function POST(request:Request){return handle(async()=>{
  const body=await readMutation(request);
  if(request.headers.get('dnt')==='1'||request.headers.get('sec-gpc')==='1')return json({ok:true});
  await recordMetric(database(),validateMetric(body));return json({ok:true});
});}
