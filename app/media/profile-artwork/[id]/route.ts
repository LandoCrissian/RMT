import {InputError} from '@/lib/submission-validation';
import {publicProfileArtworkRow,profileArtworkResponse} from '@/lib/server/profile-artwork';
import {database,runtime} from '@/lib/server/runtime';
import {handle} from '@/lib/server/http';
export const dynamic='force-dynamic';
type Context={params:Promise<{id:string}>};
async function image(context:Context,head:boolean){return handle(async()=>{
  const {id}=await context.params,db=database(),row=await publicProfileArtworkRow(db,id),bucket=runtime().BUCKET;
  if(!bucket)throw new InputError('Profile images are temporarily unavailable.',503);
  const response=await profileArtworkResponse(bucket,row,head);
  // Storage can finish after the owner hides the profile or replaces this image.
  // Confirm the public reference again before returning any bytes to the caller.
  try{await publicProfileArtworkRow(db,id);}catch(error){await response.body?.cancel().catch(()=>{});throw error;}
  return response;
});}
export async function GET(_request:Request,context:Context){return image(context,false);}
export async function HEAD(_request:Request,context:Context){return image(context,true);}
