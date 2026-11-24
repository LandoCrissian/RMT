import { optionalXProfile } from './submission-validation';
import type { Metadata } from 'next';
import { seedProjects, type Project, type PublicArtwork } from './catalog';

/** A stable public URL, independent of preview hosts or a visitor's current URL. */
export const RMT_PUBLIC_ORIGIN = 'https://rmtlaunch.fun';
export const SOCIAL_IMAGE_WIDTH = 1200;
export const SOCIAL_IMAGE_HEIGHT = 630;
export const SOCIAL_IMAGE_VERSION = 'v3';
type ShareArtworkProject = Pick<Project, 'id' | 'slug'> & Partial<Pick<Project, 'name' | 'cover' | 'artwork'>>;

function approvedImage(image?: PublicArtwork) {
  return image && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(image.id)
    && ['/media/project-artwork/' + image.id,'/media/control-project-artwork/' + image.id].includes(image.url)
    && Number.isSafeInteger(image.width) && Number.isSafeInteger(image.height) && image.width > 0 && image.height > 0
    && ['image/png','image/jpeg','image/webp'].includes(image.mime) ? image : undefined;
}
const approvedBanner = (project: ShareArtworkProject) => approvedImage(project.artwork?.banner);

function hasCuratedArtwork(project: ShareArtworkProject): boolean {
  return seedProjects.some(item => item.id === project.id && item.slug === project.slug
    && (project.name === undefined || item.name === project.name)
    && (project.cover === undefined || item.cover === project.cover || approvedImage(project.artwork?.logo)?.url === project.cover));
}

export function projectPath(project: Pick<Project, 'slug'>): string {
  return '/projects/' + encodeURIComponent(project.slug);
}

export function projectShareUrl(project: Pick<Project, 'slug'>): string {
  return RMT_PUBLIC_ORIGIN + projectPath(project);
}

export function projectSocialImagePath(project: ShareArtworkProject): string {
  const banner = approvedBanner(project);
  if (banner) return banner.url;
  // New builder listings have no reviewed artwork yet. Never construct arbitrary
  // image paths from submitted text or publish a private upload as a share image.
  return hasCuratedArtwork(project) ? `/social/${encodeURIComponent(project.slug)}-${SOCIAL_IMAGE_VERSION}.jpg` : `/social/rmt-${SOCIAL_IMAGE_VERSION}.jpg`;
}

export function projectSocialImageUrl(project: ShareArtworkProject): string {
  return RMT_PUBLIC_ORIGIN + projectSocialImagePath(project);
}

export function projectXIntentUrl(project: Pick<Project, 'slug' | 'name' | 'officialXProfile'>): string {
  let mention = '';
  if (project.officialXProfile) {
    try {
      const url = optionalXProfile(project.officialXProfile);
      if (url) mention = ' (@' + new URL(url).pathname.slice(1) + ')';
    } catch {
      // Older catalog records can contain a social destination other than a profile.
    }
  }
  const query = new URLSearchParams({text: `Explore ${project.name}${mention} on RMT.`, url: projectShareUrl(project)});
  return 'https://x.com/intent/post?' + query.toString();
}

export function projectMetadata(project: Project): Metadata {
  const title = `${project.name} | RMT`;
  const description = project.description.trim().slice(0, 200);
  const image = projectSocialImageUrl(project);
  const banner = approvedBanner(project);
  const hasArtwork = hasCuratedArtwork(project);
  const imageAlt = banner ? `${project.name} approved project banner` : hasArtwork ? `${project.name} artwork with its name on an RMT project card` : 'RMT — discover projects, games, and creative tools';
  return {
    title,
    description,
    alternates: {canonical: projectShareUrl(project)},
    openGraph: {
      type: 'website', siteName: 'RMT', title, description, url: projectShareUrl(project),
      images: [{url: image, width: banner?.width ?? SOCIAL_IMAGE_WIDTH, height: banner?.height ?? SOCIAL_IMAGE_HEIGHT, type: banner?.mime ?? 'image/jpeg', alt: imageAlt}],
    },
    twitter: {card: 'summary_large_image', title, description, images: [{url: image, alt: imageAlt}]},
  };
}
