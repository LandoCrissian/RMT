import type {PrivateProfile, ProfileArtwork, ProfileArtworkKind, ProfileInput, ProfileLink, ProfileProject, PublicProfile, UploadedProfileArtwork} from '../profiles';

const assetId = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const handlePattern = /^[a-z0-9][a-z0-9_-]{1,22}[a-z0-9]$/;
const projectImagePattern = /^\/projects\/[a-z0-9][a-z0-9._-]{0,180}\.(?:png|jpe?g|webp|svg)$/i;
const publicProjectImagePattern = /^\/media\/(?:project-artwork|control-project-artwork)\/[a-z0-9][a-z0-9_-]{0,127}$/i;
const record = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const time = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) > 0 && Number(value) <= 8_640_000_000_000_000;
const text = (value: unknown, max: number): value is string => typeof value === 'string' && value.length <= max;
const invalid = () => new ProfileRequestError('The profile response was incomplete. Please reload and try again.', true);

export class ProfileRequestError extends Error {
  constructor(message: string, readonly needsRefresh = false, readonly accountChanged = false, readonly status = 0) { super(message); }
}

export async function profileResponseData(response: Response, mutation = false): Promise<Record<string, unknown>> {
  const accessChanged = response.status === 401 || response.status === 403;
  let data: unknown;
  try { data = await response.json(); } catch {
    throw new ProfileRequestError(accessChanged ? 'Your account or access changed. Refresh RMT before continuing.' : 'We couldn’t confirm the response. Reload your saved profile before trying again.', mutation && !accessChanged, accessChanged, response.status);
  }
  if (!record(data)) throw new ProfileRequestError(accessChanged ? 'Your account or access changed. Refresh RMT before continuing.' : 'The profile response was incomplete. Please try again.', mutation && !accessChanged, accessChanged, response.status);
  if (!response.ok) {
    const message = typeof data.error === 'string' ? data.error : 'Your profile could not be reached. Please try again.';
    const changed = accessChanged || data.code === 'account_changed';
    const conflict = response.status === 409 && data.code !== 'handle_taken' && message !== 'That handle is already in use. Choose another.';
    throw new ProfileRequestError(message, !changed && (conflict || (mutation && response.status >= 500)), changed, response.status);
  }
  return data;
}

function https(value: unknown): value is string {
  if (!text(value, 2048)) return false;
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password; } catch { return false; }
}

function artwork(value: unknown, kind: ProfileArtworkKind, visibility: 'private' | 'public'): ProfileArtwork | null {
  if (value === null) return null;
  if (!record(value) || typeof value.id !== 'string' || !assetId.test(value.id) || value.kind !== kind || value.mime !== 'image/png'
    || !Number.isSafeInteger(value.width) || !Number.isSafeInteger(value.height) || Number(value.width) < 1 || Number(value.height) < 1
    || Number(value.width) > 4096 || Number(value.height) > 4096
    || value.url !== `${visibility === 'public' ? '/media' : '/api'}/profile-artwork/${value.id}`) throw invalid();
  return {id: value.id, kind, mime: 'image/png', width: Number(value.width), height: Number(value.height), url: value.url};
}

function links(value: unknown): ProfileLink[] {
  if (!Array.isArray(value) || value.length > 4) throw invalid();
  const parsed = value.map(link => {
    if (!record(link) || !text(link.label, 32) || link.label.trim().length < 2 || !https(link.url)) throw invalid();
    return {label: link.label, url: link.url};
  });
  if (new Set(parsed.map(link => link.url)).size !== parsed.length) throw invalid();
  return parsed;
}

function projects(value: unknown): ProfileProject[] {
  if (!Array.isArray(value)) throw invalid();
  const ids = new Set<string>();
  return value.map(project => {
    if (!record(project) || !text(project.id, 128) || !project.id || ids.has(project.id)
      || !text(project.slug, 160) || !/^[a-z0-9][a-z0-9_-]*$/i.test(project.slug)
      || !text(project.name, 140) || !project.name || !text(project.tagline, 500)
      || !['Games', 'Music', 'Tools', 'Community'].includes(String(project.category))
      || !text(project.cover, 2048) || (project.cover !== 'community' && !projectImagePattern.test(project.cover) && !publicProjectImagePattern.test(project.cover))
      || !text(project.initials, 12) || !text(project.accent, 80)
      || (project.logo !== undefined && (!text(project.logo, 2048) || (!projectImagePattern.test(project.logo) && !publicProjectImagePattern.test(project.logo))))
      || (project.coverFit !== undefined && !['cover', 'contain'].includes(String(project.coverFit)))
      || (project.coverAspectRatio !== undefined && (typeof project.coverAspectRatio !== 'number' || !Number.isFinite(project.coverAspectRatio) || project.coverAspectRatio <= 0))) throw invalid();
    ids.add(project.id);
    return {id: project.id, slug: project.slug, name: project.name, tagline: project.tagline, category: project.category as ProfileProject['category'],
      cover: project.cover, initials: project.initials, accent: project.accent,
      ...(typeof project.logo === 'string' ? {logo: project.logo} : {}),
      ...(project.coverFit ? {coverFit: project.coverFit as ProfileProject['coverFit']} : {}),
      ...(typeof project.coverAspectRatio === 'number' ? {coverAspectRatio: project.coverAspectRatio} : {})};
  });
}

/** Only explicitly public fields survive parsing; a private media URL is never accepted. */
export function publicProfileResponse(value: unknown, expectedHandle?: string): PublicProfile {
  if (!record(value) || !record(value.profile)) throw invalid();
  const row = value.profile;
  if (!text(row.handle, 24) || !handlePattern.test(row.handle) || (expectedHandle !== undefined && row.handle !== expectedHandle)
    || !text(row.displayName, 48) || row.displayName.trim().length < 2 || !text(row.bio, 280) || typeof row.isBuilder !== 'boolean') throw invalid();
  const managedProjects = projects(row.managedProjects);
  if (row.isBuilder !== (managedProjects.length > 0)) throw invalid();
  return {handle: row.handle, displayName: row.displayName, bio: row.bio, links: links(row.links),
    avatar: artwork(row.avatar, 'avatar', 'public'), banner: artwork(row.banner, 'banner', 'public'), managedProjects, isBuilder: row.isBuilder};
}

export function privateProfileResponse(value: unknown): PrivateProfile | null {
  if (!record(value) || !('profile' in value)) throw invalid();
  if (value.profile === null) return null;
  const row = value.profile;
  if (!record(row) || !text(row.handle, 24) || (row.handle !== '' && !handlePattern.test(row.handle))
    || !text(row.displayName, 48) || !text(row.bio, 280) || !['private', 'public'].includes(String(row.visibility))
    || typeof row.showManagedProjects !== 'boolean' || typeof row.isBuilder !== 'boolean' || typeof row.handleLocked !== 'boolean'
    || !Number.isSafeInteger(row.revision) || Number(row.revision) < 1 || !time(row.createdAt) || !time(row.updatedAt)
    || !(row.firstPublishedAt === null || time(row.firstPublishedAt))
    || ![row.avatarAssetId, row.bannerAssetId].every(id => id === null || (typeof id === 'string' && assetId.test(id)))
    || row.handleLocked !== (row.firstPublishedAt !== null)
    || ((row.visibility === 'public' || row.handleLocked) && !row.handle)
    || (row.visibility === 'public' && row.displayName.trim().length < 2)) throw invalid();
  const avatar = artwork(row.avatar, 'avatar', 'private'), banner = artwork(row.banner, 'banner', 'private');
  if ((avatar?.id ?? null) !== row.avatarAssetId || (banner?.id ?? null) !== row.bannerAssetId) throw invalid();
  return {handle: row.handle, displayName: row.displayName, bio: row.bio, visibility: row.visibility as PrivateProfile['visibility'],
    showManagedProjects: row.showManagedProjects, avatarAssetId: row.avatarAssetId as string | null, bannerAssetId: row.bannerAssetId as string | null,
    links: links(row.links), revision: Number(row.revision), handleLocked: row.handleLocked, firstPublishedAt: row.firstPublishedAt as number | null,
    createdAt: row.createdAt, updatedAt: row.updatedAt, avatar, banner, managedProjects: projects(row.managedProjects), isBuilder: row.isBuilder};
}

export function uploadedProfileArtwork(value: unknown, expectedKind?: ProfileArtworkKind): UploadedProfileArtwork {
  if (!record(value) || !['avatar', 'banner'].includes(String(value.kind)) || (expectedKind && value.kind !== expectedKind)
    || !Number.isSafeInteger(value.byteSize) || Number(value.byteSize) < 1 || Number(value.byteSize) > 2 * 1024 * 1024
    || !time(value.createdAt) || value.previewUrl !== value.url) throw invalid();
  const image = artwork(value, value.kind as ProfileArtworkKind, 'private');
  if (!image) throw invalid();
  return {...image, previewUrl: image.url, byteSize: Number(value.byteSize), createdAt: value.createdAt};
}

export function profileArtworkList(value: unknown): UploadedProfileArtwork[] {
  if (!record(value) || !Array.isArray(value.artwork)) throw invalid();
  const images = value.artwork.map(image => uploadedProfileArtwork(image));
  if (new Set(images.map(image => image.id)).size !== images.length) throw invalid();
  return images;
}

export function profileForm(profile: PrivateProfile | null): ProfileInput {
  return profile ? {expectedRevision: profile.revision, handle: profile.handle, displayName: profile.displayName, bio: profile.bio,
    visibility: profile.visibility, showManagedProjects: profile.showManagedProjects, avatarAssetId: profile.avatarAssetId,
    bannerAssetId: profile.bannerAssetId, links: profile.links.map(link => ({...link}))}
    : {expectedRevision: 0, handle: '', displayName: '', bio: '', visibility: 'private', showManagedProjects: false,
      avatarAssetId: null, bannerAssetId: null, links: []};
}
