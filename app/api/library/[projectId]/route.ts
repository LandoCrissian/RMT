import { saveLibraryProject, removeLibraryProject, validateLibraryMutation, libraryAccountConflict } from '@/lib/server/library';
import { database, requireIdentity } from '@/lib/server/runtime';
import { handle, json, readMutation } from '@/lib/server/http';

export const dynamic = 'force-dynamic';
type Context = {params: Promise<{projectId: string}>};

export async function PUT(request: Request, context: Context) {
  return handle(async () => {
    const user = requireIdentity(request);
    const conflict = libraryAccountConflict(request, user.userId);
    if (conflict) return conflict;
    validateLibraryMutation(await readMutation(request));
    const {projectId} = await context.params;
    return json(await saveLibraryProject(database(), user.userId, projectId));
  });
}

export async function DELETE(request: Request, context: Context) {
  return handle(async () => {
    const user = requireIdentity(request);
    const conflict = libraryAccountConflict(request, user.userId);
    if (conflict) return conflict;
    validateLibraryMutation(await readMutation(request));
    const {projectId} = await context.params;
    return json(await removeLibraryProject(database(), user.userId, projectId));
  });
}
