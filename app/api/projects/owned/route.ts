import { ownedProjects } from '@/lib/server/project-edits';
import { database,requireIdentity } from '@/lib/server/runtime';
import { handle,json } from '@/lib/server/http';
export const dynamic='force-dynamic';
export async function GET(request:Request){return handle(async()=>{const user=requireIdentity(request);return json(await ownedProjects(database(),user.userId));});}
