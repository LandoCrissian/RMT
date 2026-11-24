import {InputError} from '@/lib/submission-validation';
import {requireControl} from '@/lib/server/control-access';
import {privateControlArtworkRow} from '@/lib/server/control-artwork';
import {artworkResponse} from '@/lib/server/project-artwork';
import {database,runtime} from '@/lib/server/runtime';
import {handle} from '@/lib/server/http';
export const dynamic='force-dynamic';
type Context={params:Promise<{id:string}>};
async function image(request:Request,context:Context,head:boolean){return handle(async()=>{
 const actor=await requireControl(request,'projects'),{id}=await context.params,db=database(),row=await privateControlArtworkRow(db,actor,id),bucket=runtime().BUCKET;
 if(!bucket)throw new InputError('Artwork previews are temporarily unavailable.',503);
 const response=await artworkResponse(bucket,row,head);
 try{await privateControlArtworkRow(db,actor,id);}catch(error){await response.body?.cancel().catch(()=>{});throw error;}
 return response;
});}
export async function GET(request:Request,context:Context){return image(request,context,false);}
export async function HEAD(request:Request,context:Context){return image(request,context,true);}
