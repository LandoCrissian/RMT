'use client';

import { useEffect, useRef, useState } from 'react';
import { CalendarDays, ArrowLeft, ArrowRight, ArrowUpRight, BellRing, ChevronDown, ChevronUp, CircleAlert, Hammer, Megaphone, RefreshCw, Rocket, Terminal } from 'lucide-react';
import type { Project } from '@/lib/catalog';
import type { PublicProjectUpdate, UpdatesPage } from '@/lib/project-updates';
import { publicUpdatesPage } from '@/lib/client/project-updates';
import { updateKindLabels } from './ProjectUpdatePreview';
import './project-updates.css';

const kindIcons = {announcement: Megaphone, progress: Hammer, release: Rocket, event: CalendarDays};

function UpdateCard({update}: {update: PublicProjectUpdate}) {
  const [expanded, setExpanded] = useState(false);
  const Icon = kindIcons[update.kind];
  const date = new Date(update.publishedAt);
  const long = update.body.length > 420 || update.body.split('\n').length > 6;
  return <article className={'pu-card pu-kind-' + update.kind} aria-labelledby={'update-title-' + update.id}>
    <div className="pu-card-meta"><span className="pu-kind"><Icon size={13} />{updateKindLabels[update.kind]}</span><time dateTime={date.toISOString()}>{date.toLocaleDateString(undefined, {month: 'short', day: 'numeric', year: 'numeric'})}</time></div>
    <h4 id={'update-title-' + update.id}>{update.title}</h4>
    <p id={'update-body-' + update.id} className={'pu-copy' + (long && !expanded ? ' pu-copy-collapsed' : '')}>{update.body}</p>
    {long && <button type="button" className="pu-read-more" aria-expanded={expanded} aria-controls={'update-body-' + update.id} onClick={() => setExpanded(value => !value)}>{expanded ? 'Show less' : 'Read full update'}{expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</button>}
    {update.linkUrl && <a className="pu-action" href={update.linkUrl} target="_blank" rel="noopener noreferrer">{update.linkLabel}<ArrowUpRight size={15} /><span className="sr-only"> (opens in a new tab)</span></a>}
  </article>;
}

export default function ProjectUpdates({project, onBuilder}: {project: Project; onBuilder: () => void}) {
  const [cursors, setCursors] = useState<(string | null)[]>([null]);
  const [page, setPage] = useState<UpdatesPage<PublicProjectUpdate> | null>(null);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const cursor = cursors[cursors.length - 1];

  useEffect(() => {
    const controller = new AbortController();
    setPage(null); setError('');
    const query = new URLSearchParams({limit: '6'});
    if (cursor) query.set('cursor', cursor);
    void fetch('/api/projects/' + encodeURIComponent(project.id) + '/updates?' + query, {
      cache: 'no-store', credentials: 'omit', signal: controller.signal,
    }).then(async response => {
      if (!response.ok) throw new Error('Updates are unavailable right now. Please try again.');
      const next = publicUpdatesPage(await response.json(), project.id);
      if (!controller.signal.aborted) setPage(next);
    }).catch(cause => {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Updates are unavailable right now. Please try again.');
    });
    return () => controller.abort();
  }, [project.id, cursor, refresh]);

  useEffect(() => {
    const recheck = () => { if (document.visibilityState === 'visible') setRefresh(value => value + 1); };
    window.addEventListener('focus', recheck);
    document.addEventListener('visibilitychange', recheck);
    return () => {window.removeEventListener('focus', recheck); document.removeEventListener('visibilitychange', recheck);};
  }, []);

  function move(next: (string | null)[]) {
    setCursors(next);
    heading.current?.focus({preventScroll: true});
    heading.current?.scrollIntoView({behavior: 'instant', block: 'nearest'});
  }

  return <section className="project-updates" aria-labelledby="project-updates-heading">
    <header className="pu-heading"><div><span className="pu-eyebrow"><span /> FROM THE BUILDERS</span><h3 id="project-updates-heading" ref={heading} tabIndex={-1}>The latest from {project.name}.</h3><p>Announcements, work in progress, and things ready to explore.</p></div><span className="pu-heading-icon" aria-hidden="true"><BellRing size={23} /></span></header>
    {error ? <div className="pu-feedback" role="alert"><CircleAlert size={23} /><h4>Couldn’t load project updates.</h4><p>{error}</p><button type="button" className="button button-outline" onClick={() => setRefresh(value => value + 1)}><RefreshCw size={14} /> Try again</button></div>
      : !page ? <div className="pu-loading" role="status" aria-label="Loading project updates"><span className="sr-only">Loading project updates…</span>{[0, 1].map(item => <div className="pu-skeleton" key={item} aria-hidden="true"><span /><strong /><p /></div>)}</div>
      : page.updates.length === 0 ? <div className="pu-feedback pu-empty"><span className="pu-empty-icon"><Megaphone size={24} /></span><h4>{cursors.length > 1 ? 'You’ve reached the end.' : 'No project updates yet.'}</h4><p>{cursors.length > 1 ? 'Head back to the newest updates from this builder.' : 'This is where the project’s confirmed builder can share what’s new and what’s taking shape.'}</p>{cursors.length > 1 ? <button type="button" className="button button-outline" onClick={() => move([null])}><ArrowLeft size={15} /> Newest updates</button> : <button type="button" className="button button-outline" onClick={onBuilder}><Terminal size={15} />{project.claimed ? 'Open Builder Studio' : 'Is this your project?'}</button>}</div>
      : <><div className="pu-list">{page.updates.map(update => <UpdateCard key={update.id} update={update} />)}</div><p className="pu-attribution">Posted by the project’s confirmed builder. Reviewed before publishing.</p></>}
    {page && page.updates.length > 0 && (cursors.length > 1 || page.nextCursor) && <nav className="pu-pagination" aria-label="Project update pages"><button type="button" className="button button-outline" disabled={cursors.length <= 1} onClick={() => move(cursors.slice(0, -1))}><ArrowLeft size={14} /> Newer</button><span aria-live="polite">Page {cursors.length}</span><button type="button" className="button button-outline" disabled={!page.nextCursor} onClick={() => {if (page.nextCursor) move([...cursors, page.nextCursor]);}}>Older <ArrowRight size={14} /></button></nav>}
  </section>;
}
