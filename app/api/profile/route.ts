import {validateProfileInput} from '@/lib/profiles';
import {ownProfile,saveProfile,profileAccountConflict,ProfileConflict} from '@/lib/server/profiles';
import {database,requireIdentity} from '@/lib/server/runtime';
import {handle,json,readMutation} from '@/lib/server/http';
export const dynamic='force-dynamic';
export async function GET(request:Request){return handle(async()=>{
  const user=await requireIdentity(request),conflict=profileAccountConflict(request,user.userId);
  if(conflict)return conflict;
  if(new URL(request.url).search) return json({error:'This profile endpoint takes no query parameters.'},400);
  return json({profile:await ownProfile(database(),user.userId)});
});}
export async function PATCH(request:Request){return handle(async()=>{
  const user=await requireIdentity(request),conflict=profileAccountConflict(request,user.userId);
  if(conflict)return conflict;
  if(new URL(request.url).search)return json({error:'This profile endpoint takes no query parameters.'},400);
  const input=validateProfileInput(await readMutation(request));
  try{return json({profile:await saveProfile(database(),user,input)});}
  catch(error){if(error instanceof ProfileConflict)return json({error:error.message,code:error.code},error.status);throw error;}
});}
