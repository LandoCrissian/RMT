import {database} from '@/lib/server/runtime';
import {handle,json} from '@/lib/server/http';
import {agenda} from '@/lib/server/calendar';
export const dynamic='force-dynamic';
export function GET(){return handle(async()=>json(await agenda(database())));}
