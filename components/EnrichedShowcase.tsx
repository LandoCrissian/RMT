import {ArrowLeft, ArrowUpRight, Layers3} from 'lucide-react';
import type {ReactNode} from 'react';
import type {Project} from '@/lib/catalog';
import {projectCategoryLabels} from '@/lib/project-search';
import type {enrichProject} from '@/lib/project-enrichment';
import {LinkOptions, type DestinationLink} from './LinkOptions';
import {stageLabel} from './studio-shared';
import './enriched-showcase.css';
import {followPublicLink} from './public-link';

type Enrichment = ReturnType<typeof enrichProject>;
type Destination = Enrichment['destinations'][number];

export function ShowcaseHero({project, enrichment, experiences, logo, onBack, standalone}: {
  project: Project; enrichment: Enrichment; experiences: Destination[]; logo: ReactNode; onBack: () => void; standalone: boolean;
}) {
  const Heading = standalone ? 'h1' : 'h2';
  const cover = project.presentation?.hero || project.cover;
  const illustrated = experiences.filter(link => link.image);
  // A wordmark with a companion portrait needs a different canvas from a
  // cinematic banner or a directory with several illustrated destinations.
  const specimen = !project.presentation?.hero && (project.coverAspectRatio ?? 0) > 4 && illustrated.find(link => /gallery/i.test(link.type || ''));
  const layout = specimen ? 'gallery' : illustrated.length > 1 ? 'atlas' : 'panorama';
  const chain = project.collections?.[0]?.chain;
  return <header className={'enriched-hero enriched-' + layout}>
    <div className="enriched-toolbar">
      <a href="/" className="showcase-back" onClick={event => followPublicLink(event, onBack)}><ArrowLeft size={16}/> Back to RMT</a>
      {chain && <span><Layers3 size={14}/>{chain}</span>}
    </div>
    <div className="enriched-hero-grid">
      <div className="enriched-heading">
        <div className="enriched-meta">{logo}<span>{project.classification ? projectCategoryLabels(project)[0] : enrichment.categoryLabel || project.category}</span>
          {project.id === 'lammbs' && <span>RMT creator project</span>}
          {project.stage && <span>{stageLabel(project.stage)}</span>}
        </div>
        <Heading id="project-title" tabIndex={-1}>{project.name}</Heading>
        {project.tagline && project.tagline !== enrichment.shortDescription && <p>{project.tagline}</p>}
      </div>
      <div className="enriched-key-art">
        <img className="enriched-banner" src={cover} alt={project.name + ' project artwork'} loading="eager" fetchPriority="high" decoding="async"/>
        {specimen && <img className="enriched-specimen" src={specimen.image} alt={specimen.alt || ''} decoding="async"/>}
      </div>
    </div>
  </header>;
}

export function ShowcaseExperiences({items, intro, onOptions}: {
  items: Destination[]; intro: string; onOptions: (link:DestinationLink) => void;
}) {
  if (!items.length) return null;
  return <section className="showcase-destinations enriched-experiences" aria-labelledby="experience-heading">
    <div className="showcase-section-heading"><h3 id="experience-heading">{items.length === 1 ? 'Project experience' : 'Explore the experiences'}</h3></div>
    {intro && <p className="enriched-intro">{intro}</p>}
    <div className={'enriched-grid' + (items.length === 1 ? ' enriched-feature' : '')}>
      {items.map(link => <article className="enriched-stop experience-entry" key={link.url}>
        <a href={link.url} className="enriched-stop-link" target="_top" rel="noopener noreferrer">
          {link.image && <div className="enriched-stop-art"><img src={link.image} alt={link.alt || ''} loading="lazy" decoding="async" /></div>}
          <div className="enriched-stop-copy">
            {link.type && <small>{link.type}</small>}
            <h4>{link.label}<ArrowUpRight size={16}/></h4>
            {link.copy && <p>{link.copy}</p>}
          </div>
        </a>
        <LinkOptions href={link.url} label={link.label} onOpen={onOptions}/>
      </article>)}
    </div>
  </section>;
}
