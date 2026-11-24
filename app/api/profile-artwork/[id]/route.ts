import {InputError} from '@/lib/submission-validation';
import {privateProfileArtworkRow,profileArtworkResponse} from '@/lib/server/profile-artwork';
import {database,requireIdentity,runtime} from '@/lib/server/runtime';
import {handle} from '@/lib/server/http';
export const dynamic='force-dynamic';
type Context={params:Promise<{id:string}>};
async function image(request:Request,context:Context,head:boolean){return handle(async()=>{
  // Image elements cannot attach an account-expectation header. The verified
  // session and exact stored asset owner are authoritative for every request.
  const user=await requireIdentity(request),{id}=await context.params;
  const row=await privateProfileArtworkRow(database(),user.userId,id),bucket=runtime().BUCKET;
  if(!bucket)throw new InputError('Profile images are temporarily unavailable.',503);
  return profileArtworkResponse(bucket,row,head);
});}
export async function GET(request:Request,context:Context){return image(request,context,false);}
export async function HEAD(request:Request,context:Context){return image(request,context,true);}
