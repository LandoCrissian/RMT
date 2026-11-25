import {database,requireIdentity} from '@/lib/server/runtime';
import {libraryAccountConflict} from '@/lib/server/library';
import {handle,json} from '@/lib/server/http';
import {weeklyDigest} from '@/lib/server/weekly-digest';
export const dynamic='force-dynamic';

export function GET(request:Request) {
  return handle(async()=>{
    const user=await requireIdentity(request);
    const conflict=libraryAccountConflict(request,user.userId);
    return conflict??json(await weeklyDigest(database(),user.userId));
  });
}
