import {database} from '@/lib/server/runtime';
import {requireControl} from '@/lib/server/control-access';
import {changeControlContent,validateControlContent} from '@/lib/server/control-content';
import {handle,json,readMutation} from '@/lib/server/http';
export const dynamic='force-dynamic';
export async function PATCH(request:Request,context:{params:Promise<{id:string}>}){return handle(async()=>{const actor=await requireControl(request,'content'),{id}=await context.params,input=validateControlContent(await readMutation(request));return json({item:await changeControlContent(database(),actor,id,input)});});}
