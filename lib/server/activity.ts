import type { Project } from '@/lib/catalog';
import { encodeActivityCursor, type ActivityItem, type ActivityPage, type ActivityPageInput, type ActivityProject } from '@/lib/activity';
import { catalog } from './repository';
import { publicUpdateOwnershipGuard, publicUpdateProjectGuard } from './project-updates';

type ActivityRow = {
  id: string; project_id: string; kind: ActivityItem['kind']; happened_at: number;
  title: string; body: string; link_label: string; link_url: string; update_id: string | null;
};

/** Deliberate public projection; never copy an account, application, or claim row. */
function activityProject(project: Project): ActivityProject {
  return {
    id: project.id, slug: project.slug, name: project.name, category: project.category,
    initials: project.initials, accent: project.accent, cover: project.cover,
    ...(project.coverFit ? {coverFit: project.coverFit} : {}),
    ...(project.coverAspectRatio ? {coverAspectRatio: project.coverAspectRatio} : {}),
    ...(project.coverBackground ? {coverBackground: project.coverBackground} : {}),
    ...(project.logo ? {logo: project.logo} : {}),
    ...(project.artwork ? {artwork: project.artwork} : {}),
  };
}

export async function publicActivity(db: D1Database, page: ActivityPageInput): Promise<ActivityPage> {
  const {projects} = await catalog(db);
  const projectsById = new Map(projects.map(project => [project.id, project]));
  // Only actual first-listing dates become events. Legacy entries without a
  // known date stay discoverable without pretending they have just joined.
  const available = projects.map(project => {
    const at = project.listedAt ? Date.parse(project.listedAt) : NaN;
    return {id: project.id, listedAt: Number.isSafeInteger(at) && at >= 0 && at <= 8_640_000_000_000_000 ? at : null};
  });
  const binds: (string | number)[] = [JSON.stringify(available)];
  let where = page.kind === 'all' ? '1=1' : 'kind=?';
  if (page.kind !== 'all') binds.push(page.kind);
  if (page.cursor) {
    where += ' AND (happened_at<? OR (happened_at=? AND id<?))';
    binds.push(page.cursor.at, page.cursor.at, page.cursor.id);
  }
  binds.push(page.limit + 1);
  // Restrict and paginate in SQL, before constructing the public result. The
  // same ownership/revision/publication guards power the existing project tab.
  // Recheck publication here so suspension between the catalog and feed reads
  // cannot let a no-longer-public community project enter the response.
  const result = await db.prepare(`WITH available_projects AS (
      SELECT json_extract(value,'$.id') AS project_id,json_extract(value,'$.listedAt') AS listed_at FROM json_each(?)
    ), events AS (
      SELECT 'update-'||u.id AS id,u.project_id,u.kind,u.published_at AS happened_at,
        u.title,u.body,u.link_label,u.link_url,u.id AS update_id
      FROM project_updates u JOIN available_projects p ON p.project_id=u.project_id
      WHERE u.status='approved' AND u.published_at IS NOT NULL
        AND ${publicUpdateOwnershipGuard('u')} AND ${publicUpdateProjectGuard('u')}
      UNION ALL
      SELECT 'listing-'||p.project_id,p.project_id,'listing',p.listed_at,'','','','',NULL
      FROM available_projects p WHERE p.listed_at IS NOT NULL AND ${publicUpdateProjectGuard('p')}
    ) SELECT * FROM events WHERE ${where} ORDER BY happened_at DESC,id DESC LIMIT ?`).bind(...binds).all<ActivityRow>();
  const shown = result.results.slice(0, page.limit);
  const items = shown.map(row => {
    const project = projectsById.get(row.project_id);
    if (!project) throw new Error('Activity project is unavailable');
    return {
      id: row.id, kind: row.kind, publishedAt: row.happened_at, project: activityProject(project),
      title: row.kind === 'listing' ? 'Joined RMT' : row.title,
      body: row.kind === 'listing' ? project.tagline : row.body,
      linkLabel: row.link_label, linkUrl: row.link_url, updateId: row.update_id,
    };
  });
  const last = shown.at(-1), hasMore = result.results.length > page.limit;
  return {items, hasMore, nextCursor: hasMore && last ? encodeActivityCursor({at: last.happened_at, id: last.id, kind: page.kind}) : null};
}
