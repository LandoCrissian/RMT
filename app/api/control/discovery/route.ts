import {requireControl} from '@/lib/server/control-access';
import {discoveryWorkspace,changeDiscoveryConfig} from '@/lib/server/discovery-config';
import {database} from '@/lib/server/runtime';
import {handle,json,readMutation} from '@/lib/server/http';
export const dynamic='force-dynamic';
export function GET(request:Request){return handle(async()=>{
  await requireControl(request,'settings');
  return json(await discoveryWorkspace(database()));
});}
export function PATCH(request:Request){return handle(async()=>{
  const actor=await requireControl(request,'settings');
  return json(await changeDiscoveryConfig(database(),actor,await readMutation(request)));
});}
