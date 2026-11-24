import { InputError } from '@/lib/submission-validation';
import { assertArtworkOwner, ownerArtwork, readArtworkUpload, uploadProjectArtwork } from '@/lib/server/project-artwork';
import { database, requireIdentity, runtime } from '@/lib/server/runtime';
import { handle, json } from '@/lib/server/http';

export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  return handle(async () => {
    const user = await requireIdentity(request);
    const projectId = new URL(request.url).searchParams.get('projectId') ?? '';
    return json({artwork: await ownerArtwork(database(),user,projectId)});
  });
}
export async function POST(request: Request) {
  return handle(async () => {
    const user = await requireIdentity(request), db = database();
    const query = new URL(request.url).searchParams;
    const projectId = query.get('projectId') ?? '', kind = query.get('kind');
    if (kind !== 'logo' && kind !== 'banner') throw new InputError('Choose a logo or banner image.');
    await assertArtworkOwner(db,user,projectId);
    const bucket = runtime().BUCKET;
    if (!bucket) throw new InputError('Artwork uploads are temporarily unavailable.',503);
    const {bytes,mime} = await readArtworkUpload(request);
    return json({artwork: await uploadProjectArtwork(db,bucket,user,projectId,kind,bytes,mime)},201);
  });
}
