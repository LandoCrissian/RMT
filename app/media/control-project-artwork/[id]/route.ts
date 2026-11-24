import {InputError} from '@/lib/submission-validation';
import {publicControlArtworkRow} from '@/lib/server/control-artwork';
import {artworkResponse} from '@/lib/server/project-artwork';
import {database,runtime} from '@/lib/server/runtime';
import {handle} from '@/lib/server/http';
export const dynamic='force-dynamic';
type Context={params:Promise<{id:string}>};
async function image(context:Context,head:boolean){return handle(async()=>{
 const {id}=await context.params,db=database(),row=await publicControlArtworkRow(db,id),bucket=runtime().BUCKET;
 if(!bucket)throw new InputError('This project image is temporarily unavailable.',503);
 const response=await artworkResponse(bucket,row,head);
 try{await publicControlArtworkRow(db,id);}catch(error){await response.body?.cancel().catch(()=>{});throw error;}
 return response;
});}
export async function GET(_request:Request,context:Context){return image(context,false);}
export async function HEAD(_request:Request,context:Context){return image(context,true);}
