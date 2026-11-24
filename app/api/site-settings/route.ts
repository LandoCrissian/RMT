import {publicSiteSettings} from '@/lib/control-settings';
import {database} from '@/lib/server/runtime';
import {siteSettings} from '@/lib/server/control-settings';
import {handle,json} from '@/lib/server/http';
export const dynamic='force-dynamic';
export async function GET(){return handle(async()=>json({settings:publicSiteSettings(await siteSettings(database()))}));}
