'use client';

import {useEffect, useState, type CSSProperties} from 'react';
import useEmblaCarousel from 'embla-carousel-react';
import {ArrowUpRight, Bookmark, Check, ChevronLeft, ChevronRight} from 'lucide-react';
import type {Project} from '@/lib/catalog';
import {spotlightFor, spotlightImage} from '@/lib/spotlight';
import './spotlight.css';
import {projectPath} from '@/lib/project-sharing';
import {followPublicLink} from './public-link';

type Props = {
  projects: Project[];
  saved: string[];
  canSave: boolean;
  onOpen: (project: Project) => void;
  onSave: (project: Project) => void;
};

export default function ProjectSpotlights({projects, saved, canSave, onOpen, onSave}: Props) {
  const [viewport, carousel] = useEmblaCarousel({align: 'start', loop: false});
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (!carousel) return;
    const sync = () => setIndex(carousel.selectedScrollSnap());
    sync();
    carousel.on('select', sync).on('reInit', sync);
    return () => {carousel.off('select', sync).off('reInit', sync);};
  }, [carousel]);
  function go(to: number) {
    carousel?.scrollTo(to, window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }
  return <section className="spotlights" aria-label="Project spotlight" aria-roledescription="carousel">
    <div ref={viewport} className="spot-viewport"><div className="spot-track">
      {projects.map((project, at) => {
        const settings = spotlightFor(project);
        const image = spotlightImage(project, settings.artwork);
        const flock = project.id === 'lammbs' && settings.artwork === 'flock';
        const bookmarked = saved.includes(project.id);
        return <div key={project.id} className="spot-slide" role="group" aria-roledescription="slide"
          aria-label={project.name + ', ' + (at + 1) + ' of ' + projects.length} inert={at !== index}>
          <article className={'hero-card spot-card' + (flock ? ' spot-flock' : '')}
            style={{'--spot-accent':settings.accent} as CSSProperties}>
            {image.startsWith('/') && <img className={'spot-background' + (settings.artwork === 'logo' || (settings.artwork === 'cover' && project.coverFit === 'contain') ? ' spot-contain' : '')}
              src={image} alt="" loading={at === 0 ? 'eager' : 'lazy'} fetchPriority={at === 0 ? 'high' : undefined} decoding="async" />}
            {flock && <img className="spot-character" src="/projects/lammb-character.webp" alt="" loading="lazy" decoding="async" />}
            <div className="spot-shade" />
            <div className="spot-copy">
              <span className="spot-label">{project.name}</span>
              <h2>{settings.headline}</h2>
              <p>{settings.description}</p>
              <div className="spot-actions">
                <a className="button button-lime hero-project-trigger" href={projectPath(project)} onClick={event => followPublicLink(event, () => onOpen(project))}>{settings.cta} <ArrowUpRight size={17}/></a>
                <button type="button" className={'button hero-save' + (bookmarked ? ' is-saved' : '')} disabled={!canSave} aria-pressed={bookmarked}
                  aria-label={(bookmarked ? 'Remove ' : 'Save ') + project.name + (bookmarked ? ' from library' : ' to library')} onClick={() => onSave(project)}>
                  {bookmarked ? <Check size={17}/> : <Bookmark size={17}/>}
                </button>
              </div>
            </div>
            {project.id === 'lammbs' && <span className="spot-disclosure">RMT creator project</span>}
          </article>
        </div>;
      })}
    </div></div>
    {projects.length > 1 && <nav className="spot-navigation" aria-label="Spotlight navigation">
      <span aria-live="polite" aria-atomic="true">Spotlight {index + 1} of {projects.length}</span>
      <div className="spot-indicators">{projects.map((project, at) => <button key={project.id} type="button"
        aria-label={'Show ' + project.name + ' spotlight'} aria-current={index === at ? 'true' : undefined} onClick={() => go(at)}><span /></button>)}</div>
      <button type="button" className="spot-arrow" aria-label="Previous spotlight" disabled={index === 0} onClick={() => go(index - 1)}><ChevronLeft size={18}/></button>
      <button type="button" className="spot-arrow" aria-label="Next spotlight" disabled={index >= projects.length - 1} onClick={() => go(index + 1)}><ChevronRight size={18}/></button>
    </nav>}
  </section>;
}
