import {requireControl} from '@/lib/server/control-access';
import {database} from '@/lib/server/runtime';
import {siteSettings,changeSiteSettings} from '@/lib/server/control-settings';
import {handle,json,readMutation} from '@/lib/server/http';
export const dynamic='force-dynamic';
export async function GET(request:Request){return handle(async()=>{await requireControl(request,'settings');return json({settings:await siteSettings(database())});});}
export async function PATCH(request:Request){return handle(async()=>{const actor=await requireControl(request,'settings');return json({settings:await changeSiteSettings(database(),actor,await readMutation(request))});});}
