import { savedLibrary, libraryAccountConflict } from '@/lib/server/library';
import { database, requireIdentity } from '@/lib/server/runtime';
import { handle, json } from '@/lib/server/http';

export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  return handle(async () => {
    const user = await requireIdentity(request);
    const conflict = libraryAccountConflict(request, user.userId);
    if (conflict) return conflict;
    return json(await savedLibrary(database(), user.userId));
  });
}
