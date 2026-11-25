import {controlQuery,requireControl} from '@/lib/server/control-access';
import {handle,json} from '@/lib/server/http';
import {database} from '@/lib/server/runtime';
import {insightPeriod,platformInsights} from '@/lib/server/platform-insights';
export const dynamic='force-dynamic';
export function GET(request:Request){return handle(async()=>{
  await requireControl(request,'health');
  return json(await platformInsights(database(),insightPeriod(controlQuery(request,['period']).get('period'))));
});}
