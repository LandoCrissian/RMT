import {database,requireIdentity} from '@/lib/server/runtime';
import {libraryAccountConflict,validateLibraryMutation,validateLibraryProjectId} from '@/lib/server/library';
import {changeFollow,followState} from '@/lib/server/following';
import {handle,json,readMutation} from '@/lib/server/http';
export const dynamic='force-dynamic';
type Context={params:Promise<{projectId:string}>};
function serve(request:Request,context:Context,follow?:boolean){return handle(async()=>{
  const id=validateLibraryProjectId((await context.params).projectId);
  if(follow===undefined&&!request.headers.has('x-rmt-account'))return json(await followState(database(),id,null));
  const user=await requireIdentity(request),conflict=libraryAccountConflict(request,user.userId);
  if(conflict)return conflict;
  if(follow===undefined)return json(await followState(database(),id,user.userId));
  validateLibraryMutation(await readMutation(request));
  return json(await changeFollow(database(),user.userId,id,follow));
});}
export function GET(r:Request,c:Context){return serve(r,c);}
export function PUT(r:Request,c:Context){return serve(r,c,true);}
export function DELETE(r:Request,c:Context){return serve(r,c,false);}
