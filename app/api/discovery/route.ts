import {database,requireIdentity} from '@/lib/server/runtime';
import {libraryAccountConflict} from '@/lib/server/library';
import {handle,json,readMutation} from '@/lib/server/http';
import {discovery,changeDiscovery} from '@/lib/server/discovery';
export const dynamic='force-dynamic';
export function GET(request:Request){return handle(async()=>{
  const user=request.headers.has('x-rmt-account')?await requireIdentity(request):null;
  const conflict=user&&libraryAccountConflict(request,user.userId);
  return conflict??json(await discovery(database(),new URL(request.url),user?.userId??null));
});}
export function POST(request:Request){return handle(async()=>{
  const user=await requireIdentity(request);
  return libraryAccountConflict(request,user.userId)??json(await changeDiscovery(database(),user.userId,await readMutation(request)));
});}
