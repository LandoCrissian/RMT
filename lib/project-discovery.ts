import type { Project } from './catalog';
import { searchProjects } from './project-search';

export type DirectorySort = 'name' | 'recent';
export const DIRECTORY_PAGE_SIZE = 8;
const MAX_PAGE_SIZE = 48;

type DiscoveryOptions = {
  query?: string;
  category?: string;
  categories?: readonly string[];
  savedIds?: readonly string[];
  sort?: DirectorySort;
  page?: number;
  pageSize?: number;
};

export type ProjectPage = {
  items: Project[];
  total: number;
  page: number;
  pageCount: number;
  start: number;
  end: number;
};

function byName(a: Project, b: Project): number {
  return a.name.localeCompare(b.name, 'en', { sensitivity: 'base', numeric: true })
    || a.id.localeCompare(b.id, 'en');
}

function listingTime(project: Project): number | null {
  const value = project.listedAt;
  // This is the date the project joined RMT, never its collection's launch date.
  // Accept an ISO day or a full timestamp with an explicit timezone.
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2}))?$/.test(value)) return null;
  const time = Date.parse(value);
  const day = value.slice(0, 10);
  const dayTime = Date.parse(day);
  if (!Number.isFinite(time) || !Number.isFinite(dayTime) || new Date(dayTime).toISOString().slice(0, 10) !== day) return null;
  return time;
}

function byRecent(a: Project, b: Project): number {
  const left = listingTime(a);
  const right = listingTime(b);
  if (left === null && right !== null) return 1;
  if (right === null && left !== null) return -1;
  return left !== null && right !== null && left !== right ? right - left : byName(a, b);
}

export function discoverProjects(projects: readonly Project[], options: DiscoveryOptions = {}): ProjectPage {
  const requestedSize = options.pageSize;
  const pageSize = typeof requestedSize === 'number' && Number.isFinite(requestedSize) && requestedSize > 0
    ? Math.max(1, Math.min(MAX_PAGE_SIZE, Math.floor(requestedSize))) : DIRECTORY_PAGE_SIZE;
  const matches = searchProjects(projects, options).sort(options.sort === 'recent' ? byRecent : byName);
  const total = matches.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const requestedPage = options.page;
  const page = typeof requestedPage === 'number' && Number.isFinite(requestedPage)
    ? Math.max(1, Math.min(pageCount, Math.floor(requestedPage))) : 1;
  const offset = (page - 1) * pageSize;
  return {
    items: matches.slice(offset, offset + pageSize),
    total,
    page,
    pageCount,
    start: total ? offset + 1 : 0,
    end: Math.min(offset + pageSize, total),
  };
}

export function recentProjects(projects: readonly Project[], limit = 3): Project[] {
  const count = Number.isFinite(limit) ? Math.max(0, Math.min(MAX_PAGE_SIZE, Math.floor(limit))) : 3;
  return projects.filter(project => listingTime(project) !== null).sort(byRecent).slice(0, count);
}
