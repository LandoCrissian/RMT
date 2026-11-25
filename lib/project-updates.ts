import { InputError, expectedRevision, field, publicHttpsUrl } from './submission-validation';

export const updateKinds = ['announcement', 'progress', 'release', 'event'] as const;
export type UpdateKind = (typeof updateKinds)[number];
export type UpdateStatus = 'draft' | 'pending' | 'approved' | 'rejected' | 'archived';
export type UpdateContent = {kind: UpdateKind; title: string; body: string; linkLabel: string; linkUrl: string};
export type PublicProjectUpdate = UpdateContent & {
  id: string; projectId: string; projectName: string; publishedAt: number;
};
export type ProjectUpdate = UpdateContent & {
  id: string; projectId: string; projectName: string; status: UpdateStatus; revision: number;
  reviewNote: string; createdAt: number; updatedAt: number; publishedAt: number | null;
  canManage: boolean; userId?: string;
};
export type CreateUpdateInput = UpdateContent & {projectId: string};
export type ChangeUpdateInput = {action: 'save'; expectedRevision: number; content: UpdateContent}
  | {action: 'submit' | 'withdraw' | 'archive'; expectedRevision: number};
export type ReviewUpdateInput = {action: 'approve' | 'reject' | 'archive'; expectedRevision: number; note: string};
export type UpdatesPage<T> = {updates: T[]; nextCursor: string | null; hasMore: boolean};
export type UpdateCursor = {at: number; id: string; rank?: number};
export type UpdatePageInput = {limit: number; cursor: UpdateCursor | null};

const contentFields = ['kind', 'title', 'body', 'linkLabel', 'linkUrl'];
function object(value: unknown, allowed: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new InputError('Send a valid project update.');
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some(key => !allowed.includes(key))) throw new InputError('Unsupported project update field.');
  return input;
}
export function validateUpdateProjectId(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,127}$/i.test(value)) throw new InputError('Choose a valid project.');
  return value;
}
export function validateUpdateId(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,127}$/i.test(value)) throw new InputError('Choose a valid update.');
  return value;
}
export function validateUpdateContent(value: unknown, complete = false): UpdateContent {
  const input = object(value, contentFields);
  if (!updateKinds.includes(input.kind as UpdateKind)) throw new InputError('Choose an announcement, progress update, event, or release.');
  const title = field(input, 'title', complete ? 5 : 0, 100, 'Title');
  if (/[\r\n\t]/.test(title)) throw new InputError('Keep the title on one line.');
  const body = field(input, 'body', complete ? 20 : 0, 2400, 'Update');
  const linkLabel = field({...input, linkLabel: input.linkLabel ?? ''}, 'linkLabel', 0, 50, 'Link label');
  if (/[\r\n\t]/.test(linkLabel)) throw new InputError('Keep the link label on one line.');
  const rawLink = input.linkUrl ?? '';
  if (typeof rawLink !== 'string') throw new InputError('Add a valid HTTPS link.');
  const linkUrl = rawLink.trim() ? publicHttpsUrl(rawLink, 'Update link') : '';
  if (linkUrl.length > 2048) throw new InputError('The encoded update link must be no longer than 2,048 characters.');
  if (Boolean(linkLabel) !== Boolean(linkUrl) || (linkLabel && linkLabel.length < 2)) throw new InputError('Give your optional link a label of 2–50 characters and a public HTTPS address.');
  return {kind: input.kind as UpdateKind, title, body, linkLabel, linkUrl};
}
export function validateCreateUpdate(value: unknown): CreateUpdateInput {
  const input = object(value, ['projectId', ...contentFields]);
  const {projectId, ...content} = input;
  return {projectId: validateUpdateProjectId(projectId), ...validateUpdateContent(content)};
}
export function validateChangeUpdate(value: unknown): ChangeUpdateInput {
  const input = object(value, ['action', 'expectedRevision', ...contentFields]);
  const revision = expectedRevision(input.expectedRevision);
  if (input.action === 'save') {
    const {action: _action, expectedRevision: _revision, ...content} = input;
    return {action: 'save', expectedRevision: revision, content: validateUpdateContent(content)};
  }
  if (!['submit', 'withdraw', 'archive'].includes(String(input.action)) || contentFields.some(key => key in input)) throw new InputError('Choose a valid update action.');
  return {action: input.action as 'submit' | 'withdraw' | 'archive', expectedRevision: revision};
}
export function validateReviewUpdate(value: unknown): ReviewUpdateInput {
  const input = object(value, ['action', 'expectedRevision', 'note']);
  if (!['approve', 'reject', 'archive'].includes(String(input.action))) throw new InputError('Choose a valid review action.');
  const note = field({...input, note: input.note ?? ''}, 'note', input.action === 'approve' ? 0 : 5, 1000, 'Review note');
  return {action: input.action as ReviewUpdateInput['action'], expectedRevision: expectedRevision(input.expectedRevision), note};
}
export function encodeUpdateCursor(cursor: UpdateCursor): string {
  return btoa(JSON.stringify(cursor)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function validateUpdatesPage(url: URL, scope: 'public' | 'owner' | 'review'): UpdatePageInput {
  const allowed = scope === 'owner' ? ['limit', 'cursor', 'projectId'] : ['limit', 'cursor'];
  for (const key of url.searchParams.keys()) if (!allowed.includes(key) || url.searchParams.getAll(key).length > 1) throw new InputError('Invalid update page options.');
  const rawLimit = url.searchParams.get('limit');
  const limit = rawLimit === null ? (scope === 'public' ? 6 : 50) : Number(rawLimit);
  if ((rawLimit !== null && !/^[1-9]\d{0,2}$/.test(rawLimit)) || !Number.isSafeInteger(limit) || limit < 1 || limit > (scope === 'public' ? 12 : 100)) throw new InputError('Choose a valid update page size.');
  const rawCursor = url.searchParams.get('cursor');
  if (rawCursor === null) return {limit, cursor: null};
  if (!/^[A-Za-z0-9_-]{1,400}$/.test(rawCursor)) throw new InputError('This update page link is invalid. Start from the first page.');
  try {
    const cursor = JSON.parse(atob(rawCursor.replace(/-/g, '+').replace(/_/g, '/'))) as Record<string, unknown>;
    const keys = scope === 'review' ? ['at', 'id', 'rank'] : ['at', 'id'];
    if (!cursor || typeof cursor !== 'object' || Array.isArray(cursor) || Object.keys(cursor).some(key => !keys.includes(key)) ||
        !Number.isSafeInteger(cursor.at) || (cursor.at as number) < 0 || (cursor.at as number) > 8_640_000_000_000_000 ||
        typeof cursor.id !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,127}$/i.test(cursor.id) ||
        (scope === 'review' && cursor.rank !== 0 && cursor.rank !== 1)) throw new Error('Invalid cursor');
    return {limit, cursor: cursor as UpdateCursor};
  } catch { throw new InputError('This update page link is invalid. Start from the first page.'); }
}
