import {publicProfile} from '@/lib/server/profiles';
import {database} from '@/lib/server/runtime';
import {handle,json} from '@/lib/server/http';
export const dynamic='force-dynamic';
export async function GET(request:Request,context:{params:Promise<{handle:string}>}){return handle(async()=>{
  if(new URL(request.url).search)return json({error:'This profile endpoint takes no query parameters.'},400);
  const {handle:profileHandle}=await context.params;
  return json({profile:await publicProfile(database(),profileHandle)});
});}
