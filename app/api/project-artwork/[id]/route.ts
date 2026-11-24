import { InputError } from '@/lib/submission-validation';
import { artworkResponse, privateArtworkRow } from '@/lib/server/project-artwork';
import { database, isAdmin, requireIdentity, runtime } from '@/lib/server/runtime';
import { handle } from '@/lib/server/http';

export const dynamic = 'force-dynamic';
type Context = {params: Promise<{id: string}>};
async function preview(request: Request, context: Context, head: boolean) {
  return handle(async () => {
    const user = await requireIdentity(request), {id} = await context.params;
    const row = await privateArtworkRow(database(),id,user.userId,await isAdmin(request));
    const bucket = runtime().BUCKET;
    if (!bucket) throw new InputError('Artwork previews are temporarily unavailable.',503);
    return artworkResponse(bucket,row,head);
  });
}
export async function GET(request: Request, context: Context) { return preview(request,context,false); }
export async function HEAD(request: Request, context: Context) { return preview(request,context,true); }
