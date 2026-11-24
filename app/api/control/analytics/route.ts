import {requireControl,controlQuery} from '@/lib/server/control-access';
import {database} from '@/lib/server/runtime';
import {controlAnalytics} from '@/lib/server/control-analytics';
import {InputError} from '@/lib/submission-validation';
import {handle,json} from '@/lib/server/http';
export const dynamic='force-dynamic';
export async function GET(request:Request){return handle(async()=>{
  await requireControl(request,'health');const params=controlQuery(request,['days']),days=params.get('days')??'7';
  if(days!=='7'&&days!=='30')throw new InputError('Choose a 7 or 30 day window.');
  return json({analytics:await controlAnalytics(database(),Number(days) as 7|30)});
});}
