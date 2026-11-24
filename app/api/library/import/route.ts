import { importLibraryProjects, validateLibraryImport, libraryAccountConflict } from '@/lib/server/library';
import { database, requireIdentity } from '@/lib/server/runtime';
import { handle, json, readMutation } from '@/lib/server/http';

export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  return handle(async () => {
    const user = await requireIdentity(request);
    const conflict = libraryAccountConflict(request, user.userId);
    if (conflict) return conflict;
    const projectIds = validateLibraryImport(await readMutation(request));
    return json(await importLibraryProjects(database(), user.userId, projectIds));
  });
}
