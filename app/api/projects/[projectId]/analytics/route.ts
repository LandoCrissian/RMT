import {database,requireIdentity} from '@/lib/server/runtime';
import {handle,json} from '@/lib/server/http';
import {libraryAccountConflict} from '@/lib/server/library';
import {controlQuery} from '@/lib/server/control-access';
import {readBuilderAnalytics,readAnalyticsPeriod} from '@/lib/server/builder-analytics';
export const dynamic='force-dynamic';
export function GET(request:Request,context:{params:Promise<{projectId:string}>}){return handle(async()=>{
  const user=await requireIdentity(request);
  const conflict=libraryAccountConflict(request,user.userId);
  if(conflict)return conflict;
  const period=readAnalyticsPeriod(controlQuery(request,['period']).get('period'));
  return json(await readBuilderAnalytics(database(),user.userId,(await context.params).projectId,period));
});}
