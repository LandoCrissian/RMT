import type {Project} from './catalog';
import {InputError} from './submission-validation';
import {ARTWORK_ID_PATTERN} from './project-artwork-validation';

export type Spotlight = {
  position: number;
  headline: string;
  description: string;
  cta: string;
  accent: string;
  artwork: string;
};

export function isSpotlight(project: Pick<Project, 'id' | 'featured'>) {
  return project.featured ?? (project.id === 'vamps' || project.id === 'lammbs');
}

export function spotlightFor(project: Project): Spotlight {
  if (project.spotlight) return project.spotlight;
  const flock = project.id === 'lammbs', vamps = project.id === 'vamps';
  return {
    position: vamps ? 1 : flock ? 2 : 100,
    headline: flock ? 'Not your average flock.' : vamps ? 'Enter the after hours.' : project.name,
    description: flock ? '720 originals. One flock. An evolving collection built on Robinhood Chain.'
      : vamps ? 'Games. Creative tools. A whole community to discover.' : project.tagline,
    cta: 'Explore ' + project.name,
    accent: flock ? '#AD72FF' : vamps ? '#C23C55' : project.accent,
    artwork: flock ? 'flock' : 'cover',
  };
}

export function orderedSpotlights(projects: Project[]) {
  return projects.filter(isSpotlight).sort((a, b) => spotlightFor(a).position - spotlightFor(b).position || a.id.localeCompare(b.id));
}

export function spotlightImage(project: Project, artwork: string) {
  if (project.id === 'lammbs' && artwork === 'flock') return '/projects/lammb-skyline.webp';
  if (ARTWORK_ID_PATTERN.test(artwork)) return '/media/control-project-artwork/' + artwork;
  if (artwork === 'logo') return project.artwork?.logo?.url || project.logo || project.cover;
  return project.cover;
}

export function validateSpotlight(value: unknown, id: string): Spotlight {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new InputError('Check the spotlight settings.');
  const data = value as Record<string, unknown>;
  function text(key: string, max: number) {
    const input = data[key];
    if (typeof input !== 'string' || !input.trim() || input.trim().length > max || /[\x00-\x1F\x7F]/.test(input)) {
      throw new InputError('Check the spotlight ' + key + '.');
    }
    return input.trim();
  }
  const position = data.position;
  if (typeof position !== 'number' || !Number.isInteger(position) || position < 1 || position > 9999) throw new InputError('Choose an order from 1 to 9999.');
  const accent = text('accent', 7), artwork = text('artwork', 36);
  if (!/^#[\da-f]{6}$/i.test(accent)) throw new InputError('Choose a six-digit border color.');
  if (!['cover', 'logo'].includes(artwork) && !(id === 'lammbs' && artwork === 'flock') && !ARTWORK_ID_PATTERN.test(artwork)) throw new InputError('Choose artwork for this project.');
  return {position, headline: text('headline', 100), description: text('description', 280), cta: text('cta', 90), accent, artwork};
}
