import {database,requireIdentity} from '@/lib/server/runtime';
import {libraryAccountConflict} from '@/lib/server/library';
import {followedProjects} from '@/lib/server/following';
import {handle,json} from '@/lib/server/http';
export const dynamic='force-dynamic';
export function GET(request:Request){return handle(async()=>{
  const user=await requireIdentity(request);
  return libraryAccountConflict(request,user.userId)??json(await followedProjects(database(),user.userId));
});}
