import { getSeedProjects } from '@/lib/catalog';
import { InputError } from '@/lib/submission-validation';
import { catalog } from './repository';
import { json } from './http';

export const MAX_SAVED_PROJECTS = 200;

/** A consistency check, never authentication: cookies may change in another tab. */
export function libraryAccountConflict(request: Request, authenticatedUserId: string): Response | null {
  if (request.headers.get('x-rmt-account') === authenticatedUserId) return null;
  return json({
    error: 'Your account needs to be checked again. Refresh your account before changing your library.',
    code: 'account_changed',
  }, 409);
}

export function validateLibraryProjectId(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-z0-9][a-z0-9-]{0,119}$/.test(value)) {
    throw new InputError('Choose a valid RMT project.');
  }
  return value;
}

export function validateLibraryMutation(value: unknown): void {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== 0) {
    throw new InputError('This action accepts an empty JSON object. Your account comes from your sign-in.');
  }
}

export function validateLibraryImport(value: unknown): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new InputError('Choose the projects to import.');
  const body = value as Record<string, unknown>;
  if (Object.keys(body).some(key => key !== 'projectIds') || !Array.isArray(body.projectIds) || body.projectIds.length > MAX_SAVED_PROJECTS) {
    throw new InputError(`Import up to ${MAX_SAVED_PROJECTS} projects at once.`);
  }
  return [...new Set(body.projectIds.map(validateLibraryProjectId))];
}

/** Keep unavailable IDs so an account never silently loses a saved item. */
export async function savedLibrary(db: D1Database, userId: string): Promise<{projectIds: string[]}> {
  const rows = await db.prepare('SELECT project_id FROM saved_projects WHERE user_id = ? ORDER BY created_at DESC, project_id ASC LIMIT ?')
    .bind(userId, MAX_SAVED_PROJECTS).all<{project_id: string}>();
  return {projectIds: rows.results.map(row => row.project_id)};
}

/** One statement enforces the account cap even when several devices save at once. */
async function insertAvailableProjects(db: D1Database, userId: string, projectIds: string[]): Promise<number> {
  if (!projectIds.length) return 0;
  const seedIds = getSeedProjects().map(project => project.id);
  const result = await db.prepare(`
    WITH requested AS (
      SELECT value AS project_id, CAST(key AS INTEGER) AS ordinal FROM json_each(?)
    ), available AS (
      SELECT project_id, ordinal FROM requested
      WHERE project_id IN (SELECT value FROM json_each(?))
        OR project_id IN (SELECT 'community-' || id FROM submissions
          WHERE status = 'approved' ORDER BY name COLLATE NOCASE LIMIT 500)
    )
    INSERT INTO saved_projects (user_id, project_id, created_at)
    SELECT ?, project_id, ? FROM available
    WHERE NOT EXISTS (SELECT 1 FROM saved_projects existing WHERE existing.user_id = ? AND existing.project_id = available.project_id)
    ORDER BY ordinal
    LIMIT MAX(0, ? - (SELECT COUNT(*) FROM saved_projects WHERE user_id = ?))
    ON CONFLICT(user_id, project_id) DO NOTHING
  `).bind(JSON.stringify(projectIds), JSON.stringify(seedIds), userId, Date.now(), userId, MAX_SAVED_PROJECTS, userId).run();
  return result.meta.changes;
}

export async function saveLibraryProject(db: D1Database, userId: string, projectId: string) {
  validateLibraryProjectId(projectId);
  const publicIds = new Set((await catalog(db)).projects.map(project => project.id));
  if (!publicIds.has(projectId)) throw new InputError('This project is not currently available in RMT.', 404);
  await insertAvailableProjects(db, userId, [projectId]);
  const library = await savedLibrary(db, userId);
  if (!library.projectIds.includes(projectId)) {
    if (library.projectIds.length >= MAX_SAVED_PROJECTS) throw new InputError(`Your library can hold ${MAX_SAVED_PROJECTS} projects. Remove one before saving another.`, 409);
    throw new InputError('This project is no longer available in RMT. Refresh the directory.', 409);
  }
  return library;
}

export async function removeLibraryProject(db: D1Database, userId: string, projectId: string) {
  validateLibraryProjectId(projectId);
  // No public-catalog requirement: a removed or suspended project can be unsaved.
  await db.prepare('DELETE FROM saved_projects WHERE user_id = ? AND project_id = ?').bind(userId, projectId).run();
  return savedLibrary(db, userId);
}

export async function importLibraryProjects(db: D1Database, userId: string, projectIds: string[]) {
  const uniqueIds = validateLibraryImport({projectIds});
  const publicIds = new Set((await catalog(db)).projects.map(project => project.id));
  const availableIds = uniqueIds.filter(id => publicIds.has(id));
  const importedCount = await insertAvailableProjects(db, userId, availableIds);
  const library = await savedLibrary(db, userId);
  const savedIds = new Set(library.projectIds);
  return {
    ...library,
    importedCount,
    skippedCount: uniqueIds.filter(id => !publicIds.has(id) || !savedIds.has(id)).length,
  };
}
