import { claimsQueue } from '@/lib/server/claims';
import { database,requireAdmin } from '@/lib/server/runtime';
import { handle,json } from '@/lib/server/http';
export const dynamic='force-dynamic';
export async function GET(request:Request){return handle(async()=>{await requireAdmin(request);return json({claims:await claimsQueue(database())});});}
