import type { Metadata } from 'next';
import { seedProjects, type Project } from './catalog';

/** A stable public URL, independent of preview hosts or a visitor's current URL. */
export const RMT_PUBLIC_ORIGIN = 'https://rmtlaunch.fun';
export const SOCIAL_IMAGE_WIDTH = 1200;
export const SOCIAL_IMAGE_HEIGHT = 630;
export const SOCIAL_IMAGE_VERSION = 'v1';
type ShareArtworkProject = Pick<Project, 'id' | 'slug'> & Partial<Pick<Project, 'name' | 'cover'>>;

function hasCuratedArtwork(project: ShareArtworkProject): boolean {
  return seedProjects.some(item => item.id === project.id && item.slug === project.slug
    && (project.name === undefined || item.name === project.name)
    && (project.cover === undefined || item.cover === project.cover));
}

export function projectPath(project: Pick<Project, 'slug'>): string {
  return '/projects/' + encodeURIComponent(project.slug);
}

export function projectShareUrl(project: Pick<Project, 'slug'>): string {
  return RMT_PUBLIC_ORIGIN + projectPath(project);
}

export function projectSocialImagePath(project: ShareArtworkProject): string {
  // New builder listings have no reviewed artwork yet. Never construct arbitrary
  // image paths from submitted text or publish a private upload as a share image.
  return hasCuratedArtwork(project) ? `/social/${encodeURIComponent(project.slug)}-${SOCIAL_IMAGE_VERSION}.jpg` : `/social/rmt-${SOCIAL_IMAGE_VERSION}.jpg`;
}

export function projectSocialImageUrl(project: ShareArtworkProject): string {
  return RMT_PUBLIC_ORIGIN + projectSocialImagePath(project);
}

export function projectXIntentUrl(project: Pick<Project, 'slug' | 'name'>): string {
  const query = new URLSearchParams({text: `Explore ${project.name} on RMT.`, url: projectShareUrl(project)});
  return 'https://x.com/intent/post?' + query.toString();
}

export function projectMetadata(project: Project): Metadata {
  const title = `${project.name} | RMT`;
  const description = project.description.trim().slice(0, 200);
  const image = projectSocialImageUrl(project);
  const hasArtwork = hasCuratedArtwork(project);
  const imageAlt = hasArtwork ? `${project.name} artwork with its name on an RMT project card` : 'RMT — discover projects, games, and creative tools';
  return {
    title,
    description,
    alternates: {canonical: projectShareUrl(project)},
    openGraph: {
      type: 'website', siteName: 'RMT', title, description, url: projectShareUrl(project),
      images: [{url: image, width: SOCIAL_IMAGE_WIDTH, height: SOCIAL_IMAGE_HEIGHT, type: 'image/jpeg', alt: imageAlt}],
    },
    twitter: {card: 'summary_large_image', title, description, images: [{url: image, alt: imageAlt}]},
  };
}
