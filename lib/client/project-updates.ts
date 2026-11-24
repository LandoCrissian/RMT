import type { PublicProjectUpdate, UpdatesPage } from '../project-updates';

/** Treat a malformed or cross-project response as a failure, never as an empty feed. */
export function publicUpdatesPage(value: unknown, projectId: string): UpdatesPage<PublicProjectUpdate> {
  const invalid = () => new Error('Project updates could not be loaded. Please try again.');
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid();
  const page = value as Record<string, unknown>;
  if (!Array.isArray(page.updates) || page.updates.length > 12 ||
      !(page.nextCursor === null || (typeof page.nextCursor === 'string' && /^[A-Za-z0-9_-]{1,400}$/.test(page.nextCursor))) ||
      ('hasMore' in page && page.hasMore !== (page.nextCursor !== null))) throw invalid();
  const ids = new Set<string>();
  const updates = page.updates.map((value: unknown) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid();
    const item = value as Record<string, unknown>;
    if (typeof item.id !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,127}$/i.test(item.id) || ids.has(item.id) ||
        item.projectId !== projectId || typeof item.projectName !== 'string' || !item.projectName ||
        !['announcement', 'progress', 'release'].includes(String(item.kind)) ||
        typeof item.title !== 'string' || item.title.length < 5 || item.title.length > 100 ||
        typeof item.body !== 'string' || item.body.length < 20 || item.body.length > 2400 ||
        typeof item.linkLabel !== 'string' || item.linkLabel.length > 50 ||
        typeof item.linkUrl !== 'string' || item.linkUrl.length > 2048 ||
        Boolean(item.linkLabel) !== Boolean(item.linkUrl) ||
        !Number.isSafeInteger(item.publishedAt) || (item.publishedAt as number) <= 0 ||
        (item.publishedAt as number) > 8_640_000_000_000_000) throw invalid();
    if (item.linkUrl) {
      try {
        const url = new URL(item.linkUrl);
        if (url.protocol !== 'https:' || url.username || url.password) throw invalid();
      } catch { throw invalid(); }
    }
    ids.add(item.id);
    // Even a future accidental extra API field is never retained in the public view model.
    return {
      id: item.id, projectId, projectName: item.projectName,
      kind: item.kind as PublicProjectUpdate['kind'], title: item.title, body: item.body,
      linkLabel: item.linkLabel, linkUrl: item.linkUrl, publishedAt: item.publishedAt as number,
    };
  });
  return {updates, nextCursor: page.nextCursor as string | null, hasMore: page.nextCursor !== null};
}
