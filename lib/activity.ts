import type { Project } from './catalog';
import type { UpdateKind } from './project-updates';
import { InputError } from './submission-validation';

export const activityKinds = ['all', 'announcement', 'progress', 'release', 'event', 'listing'] as const;
export type ActivityFilter = (typeof activityKinds)[number];
export type ActivityKind = UpdateKind | 'listing';
export type ActivityProject = Pick<Project, 'id' | 'slug' | 'name' | 'category' | 'initials' | 'accent' | 'cover'
  | 'coverFit' | 'coverAspectRatio' | 'coverBackground' | 'logo' | 'artwork'> & {categoryNames?:string[]};
export type ActivityItem = {
  id: string;
  kind: ActivityKind;
  publishedAt: number;
  project: ActivityProject;
  title: string;
  body: string;
  linkLabel: string;
  linkUrl: string;
  updateId: string | null;
};
export type ActivityPage = {items: ActivityItem[]; nextCursor: string | null; hasMore: boolean};
export type ActivityCursor = {at: number; id: string; kind: ActivityFilter};
export type ActivityPageInput = {kind: ActivityFilter; limit: number; cursor: ActivityCursor | null};

export function encodeActivityCursor(cursor: ActivityCursor): string {
  return btoa(JSON.stringify(cursor)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function validateActivityPage(url: URL): ActivityPageInput {
  for (const key of url.searchParams.keys()) {
    if (!['kind', 'limit', 'cursor'].includes(key) || url.searchParams.getAll(key).length > 1) {
      throw new InputError('Invalid activity page options.');
    }
  }
  const kind = url.searchParams.get('kind') ?? 'all';
  if (!activityKinds.includes(kind as ActivityFilter)) throw new InputError('Choose a valid activity filter.');
  const rawLimit = url.searchParams.get('limit');
  const limit = rawLimit === null ? 6 : Number(rawLimit);
  if ((rawLimit !== null && !/^[1-9]\d?$/.test(rawLimit)) || !Number.isSafeInteger(limit) || limit < 1 || limit > 12) {
    throw new InputError('Choose an activity page size from 1 to 12.');
  }
  const rawCursor = url.searchParams.get('cursor');
  if (rawCursor === null) return {kind: kind as ActivityFilter, limit, cursor: null};
  try {
    if (!/^[A-Za-z0-9_-]{1,400}$/.test(rawCursor)) throw new Error('Invalid cursor');
    const cursor = JSON.parse(atob(rawCursor.replace(/-/g, '+').replace(/_/g, '/'))) as Record<string, unknown>;
    if (!cursor || typeof cursor !== 'object' || Array.isArray(cursor) ||
        Object.keys(cursor).some(key => !['at', 'id', 'kind'].includes(key)) ||
        !Number.isSafeInteger(cursor.at) || (cursor.at as number) < 0 || (cursor.at as number) > 8_640_000_000_000_000 ||
        typeof cursor.id !== 'string' || !/^(?:update|listing)-[a-z0-9][a-z0-9_-]{0,127}$/i.test(cursor.id) || cursor.kind !== kind) {
      throw new Error('Invalid cursor');
    }
    return {kind: kind as ActivityFilter, limit, cursor: cursor as ActivityCursor};
  } catch { throw new InputError('This activity page link is invalid. Start from the first page.'); }
}
