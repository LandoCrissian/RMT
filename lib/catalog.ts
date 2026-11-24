import { additionalProjects } from './curated-projects';

export type Category = 'Games' | 'Music' | 'Tools' | 'Community';

export type PublicArtwork = {id: string; url: string; width: number; height: number; mime: 'image/png' | 'image/jpeg' | 'image/webp'};

export type Project = {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  description: string;
  category: Category;
  website: string;
  launchUrl: string;
  launchLabel: string;
  links: { label: string; url: string; type?: string }[];
  collections?: { name: string; url: string; chain?: string; relationship?: string }[];
  stage?: 'starting' | 'building' | 'live';
  sourceStatus?: 'confirmed' | 'details-pending';
  initials: string;
  accent: string;
  cover: string;
  coverFit?: 'cover' | 'contain';
  coverAspectRatio?: number;
  coverBackground?: string;
  logo?: string;
  /** Date first added to the RMT directory, not the collection launch date. */
  listedAt?: string;
  artwork?: {logo?: PublicArtwork; banner?: PublicArtwork};
  claimed: boolean;
  source: 'curated' | 'community';
};

// Public, unclaimed directory entries. Sources and artwork attribution:
// docs/catalog-sources.md. A listing never implies a partnership or audit.
export const seedProjects: Project[] = [
  {
    id: 'vamps', slug: 'vamps', name: 'VAMPS',
    tagline: 'A little after dark. A lot to explore.',
    description: 'Explore the VAMPS community through Shadow Crypt, its VTuber Studio, and Tenvek creator software. Each experience opens on the developer’s own site; access requirements vary by application.',
    category: 'Games', website: 'https://vamps.wtf/',
    launchUrl: 'https://games.vamps.wtf/', launchLabel: 'Open games',
    links: [
      { label: 'Shadow Crypt', url: 'https://games.vamps.wtf/', type: 'Game' },
      { label: 'VTuber Studio', url: 'https://play.vamps.wtf/studio', type: 'Creative tool' },
      { label: 'Tenvek', url: 'https://tenvek.com/', type: 'Software · alpha' },
      { label: 'Official website', url: 'https://vamps.wtf/', type: 'Community' },
      { label: 'VAMPS on X', url: 'https://x.com/VampsOnChain', type: 'Social' },
    ],
    initials: 'V', accent: '#c69cff', cover: '/projects/vamps-scene.webp', coverAspectRatio: 1.777778, claimed: false, source: 'curated',
  },
  {
    id: 'lammbs', slug: 'lammbs', name: 'LAMMBs',
    tagline: 'Meet the flock. Follow your curiosity.',
    description: 'Discover the LAMMB Genesis collection and its community. This directory links to the project’s existing public pages. Additional experiences can be added when their release links are confirmed.',
    category: 'Community', website: 'https://lammb.fun/',
    launchUrl: 'https://lammb.fun/', launchLabel: 'Visit LAMMBs',
    links: [
      { label: 'Official website', url: 'https://lammb.fun/', type: 'Community' },
      { label: 'Genesis collection', url: 'https://lammb.fun/genesis/', type: 'Explore' },
      { label: 'Collection on OpenSea', url: 'https://opensea.io/collection/lammbs-59693791', type: 'External collection' },
    ],
    initials: 'L', accent: '#d5f59b', cover: '/projects/lammb-character.webp', coverAspectRatio: 1, coverFit: 'contain', claimed: false, source: 'curated',
  },
  {
    id: 'suited-apes', slug: 'suited-apes', name: 'Suited Apes Society',
    tagline: 'Step into the society.',
    description: 'Find Suited Apes experiences, including Ape Fight Club and JungleTree, the community’s directory of official destinations. Individual applications may require a wallet or eligible NFT.',
    category: 'Games', website: 'https://suitedapes.com/',
    launchUrl: 'https://suitedapes.com/jungletree/', launchLabel: 'Explore apps',
    links: [
      { label: 'JungleTree', url: 'https://suitedapes.com/jungletree/', type: 'App directory' },
      { label: 'Ape Fight Club', url: 'https://fightclub.suitedapes.com/', type: 'Game · wallet required' },
      { label: 'Official website', url: 'https://suitedapes.com/', type: 'Community' },
    ],
    initials: 'SA', accent: '#ffcd86', cover: '/projects/fight-club.jpg', coverAspectRatio: 1.904762, claimed: false, source: 'curated',
  },
  ...additionalProjects,
];

export function getSeedProjects(): Project[] { return seedProjects; }

export function projectMatchesCategory(project: Project, category: string): boolean {
  if (category === 'All projects') return true;
  if (project.category === category) return true;
  if (category === 'Tools') return project.links.some(link => /tool|software|directory/i.test(link.type ?? ''));
  return false;
}
