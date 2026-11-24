import { editsQueue } from '@/lib/server/project-edits';
import { database,requireAdmin } from '@/lib/server/runtime';
import { handle,json } from '@/lib/server/http';
export const dynamic='force-dynamic';
export async function GET(request:Request){return handle(async()=>{requireAdmin(request);return json({edits:await editsQueue(database())});});}
