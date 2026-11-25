import {database} from '@/lib/server/runtime';
import {requireControl} from '@/lib/server/control-access';
import {handle,json,readMutation} from '@/lib/server/http';
import {taxonomyWorkspace,updateTaxonomy} from '@/lib/server/taxonomy-admin';
export const dynamic='force-dynamic';
export async function GET(request:Request){return handle(async()=>{await requireControl(request,'projects');return json(await taxonomyWorkspace(database()));});}
export async function PATCH(request:Request){return handle(async()=>{const actor=await requireControl(request,'projects');return json(await updateTaxonomy(database(),actor,await readMutation(request)));});}
