import {database} from '@/lib/server/runtime';
import {requireControl,controlQuery} from '@/lib/server/control-access';
import {controlAudit} from '@/lib/server/control-audit';
import {handle,json} from '@/lib/server/http';
export const dynamic='force-dynamic';
export async function GET(request:Request){return handle(async()=>{await requireControl(request,'audit');const query=controlQuery(request,['q','kind','cursor','limit']);return json(await controlAudit(database(),query));});}
