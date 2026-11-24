import type { ActivityItem, ActivityPage, ActivityProject } from '../activity';
import type { PublicArtwork } from '../catalog';
import { publicHttpsUrl } from '../submission-validation';

const idPattern = /^[a-z0-9][a-z0-9_-]{0,127}$/i;
const colorPattern = /^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i;
const localImagePattern = /^\/projects\/[a-z0-9][a-z0-9._-]{0,180}\.(?:png|jpe?g|webp|svg)$/i;
const publicArtworkPattern = /^\/media\/project-artwork\/[a-z0-9][a-z0-9_-]{0,127}$/i;
const invalid = () => new Error('Activity could not be loaded. Please try again.');
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid();
  return value as Record<string, unknown>;
}
function localImage(value: unknown): string {
  if (typeof value !== 'string' || (!localImagePattern.test(value) && !publicArtworkPattern.test(value))) throw invalid();
  return value;
}
function artwork(value: unknown): PublicArtwork {
  const image = record(value);
  if (typeof image.id !== 'string' || !idPattern.test(image.id) || image.url !== `/media/project-artwork/${image.id}` ||
      !Number.isSafeInteger(image.width) || (image.width as number) < 1 || (image.width as number) > 8192 ||
      !Number.isSafeInteger(image.height) || (image.height as number) < 1 || (image.height as number) > 8192 ||
      !['image/png', 'image/jpeg', 'image/webp'].includes(String(image.mime))) throw invalid();
  return {id: image.id, url: localImage(image.url), width: image.width as number, height: image.height as number, mime: image.mime as PublicArtwork['mime']};
}
function project(value: unknown): ActivityProject {
  const data = record(value);
  if (typeof data.id !== 'string' || !idPattern.test(data.id) || typeof data.slug !== 'string' || !idPattern.test(data.slug) ||
      typeof data.name !== 'string' || !data.name.trim() || data.name.length > 120 ||
      !['Games', 'Music', 'Tools', 'Community'].includes(String(data.category)) ||
      typeof data.initials !== 'string' || !data.initials || data.initials.length > 8 ||
      typeof data.accent !== 'string' || !colorPattern.test(data.accent) ||
      (data.coverFit !== undefined && data.coverFit !== 'cover' && data.coverFit !== 'contain') ||
      (data.coverAspectRatio !== undefined && (typeof data.coverAspectRatio !== 'number' || !Number.isFinite(data.coverAspectRatio) || data.coverAspectRatio <= 0 || data.coverAspectRatio > 100)) ||
      (data.coverBackground !== undefined && (typeof data.coverBackground !== 'string' || !colorPattern.test(data.coverBackground)))) throw invalid();
  const cover = data.cover === 'community' ? 'community' : localImage(data.cover);
  const images = data.artwork === undefined ? undefined : record(data.artwork);
  const logoArtwork = images?.logo === undefined ? undefined : artwork(images.logo);
  const bannerArtwork = images?.banner === undefined ? undefined : artwork(images.banner);
  return {
    id: data.id, slug: data.slug, name: data.name, category: data.category as ActivityProject['category'],
    initials: data.initials, accent: data.accent, cover,
    ...(data.coverFit ? {coverFit: data.coverFit as ActivityProject['coverFit']} : {}),
    ...(data.coverAspectRatio ? {coverAspectRatio: data.coverAspectRatio as number} : {}),
    ...(data.coverBackground ? {coverBackground: data.coverBackground as string} : {}),
    ...(data.logo !== undefined ? {logo: localImage(data.logo)} : {}),
    ...(logoArtwork || bannerArtwork ? {artwork: {...(logoArtwork ? {logo: logoArtwork} : {}), ...(bannerArtwork ? {banner: bannerArtwork} : {})}} : {}),
  };
}

/** Fail visibly on malformed data; retain only the intended public fields. */
export function publicActivityPage(value: unknown): ActivityPage {
  const page = record(value);
  if (!Array.isArray(page.items) || page.items.length > 12 ||
      !(page.nextCursor === null || (typeof page.nextCursor === 'string' && /^[A-Za-z0-9_-]{1,400}$/.test(page.nextCursor))) ||
      page.hasMore !== (page.nextCursor !== null) || (page.hasMore && page.items.length === 0)) throw invalid();
  const seen = new Set<string>();
  const items: ActivityItem[] = page.items.map(value => {
    const item = record(value);
    if (typeof item.id !== 'string' || !/^(?:update|listing)-[a-z0-9][a-z0-9_-]{0,127}$/i.test(item.id) || seen.has(item.id) ||
        !['announcement', 'progress', 'release', 'listing'].includes(String(item.kind)) ||
        !Number.isSafeInteger(item.publishedAt) || (item.publishedAt as number) < 0 || (item.publishedAt as number) > 8_640_000_000_000_000 ||
        typeof item.title !== 'string' || item.title.length < (item.kind === 'listing' ? 1 : 5) || item.title.length > 100 ||
        typeof item.body !== 'string' || item.body.length < (item.kind === 'listing' ? 0 : 20) || item.body.length > 2400 ||
        typeof item.linkLabel !== 'string' || item.linkLabel.length > 50 ||
        typeof item.linkUrl !== 'string' || item.linkUrl.length > 2048 || Boolean(item.linkLabel) !== Boolean(item.linkUrl)) throw invalid();
    const publicProject = project(item.project);
    if (item.kind === 'listing') {
      if (item.id !== `listing-${publicProject.id}` || item.updateId !== null || item.linkLabel || item.linkUrl) throw invalid();
    } else {
      if (typeof item.updateId !== 'string' || !idPattern.test(item.updateId) || item.id !== `update-${item.updateId}`) throw invalid();
      if (item.linkUrl) {
        try { publicHttpsUrl(item.linkUrl, 'Update link'); } catch { throw invalid(); }
        if (item.linkLabel.length < 2) throw invalid();
      }
    }
    seen.add(item.id);
    return {
      id: item.id, kind: item.kind as ActivityItem['kind'], publishedAt: item.publishedAt as number,
      project: publicProject, title: item.title, body: item.body, linkLabel: item.linkLabel, linkUrl: item.linkUrl,
      updateId: item.updateId as string | null,
    };
  });
  for (let index = 1; index < items.length; index++) {
    const previous = items[index - 1], current = items[index];
    if (previous.publishedAt < current.publishedAt || (previous.publishedAt === current.publishedAt && previous.id < current.id)) throw invalid();
  }
  return {items, nextCursor: page.nextCursor as string | null, hasMore: page.hasMore as boolean};
}
