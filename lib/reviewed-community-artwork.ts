import type {Project} from './catalog';
import approved from './reviewed-community-artwork.json';

export function reviewedCommunityArtwork(project:Partial<Project>) {
  return project.source === 'community' && approved.find(item =>
    item.id === project.id && item.slug === project.slug && item.website === project.website) || undefined;
}

export function applyReviewedCommunityArtwork(project:Project) {
  const reviewed = reviewedCommunityArtwork(project);
  if (reviewed && !project.artwork && project.cover === 'community') {
    project.cover = reviewed.cover;
    project.coverFit = 'cover';
    project.coverAspectRatio = reviewed.coverAspectRatio;
    project.logo = reviewed.logo;
  }
}

export const communityCardMark = '/icons/rmt-mark-v5.png';
