'use client';

import {useEffect, useRef, useState} from 'react';
import {ArrowLeft, ArrowRight, ArrowUpRight, ChevronDown, ChevronUp, CircleAlert, Compass, Hammer, Megaphone, Radio, RefreshCw, Rocket, Terminal, UserRound} from 'lucide-react';
import type {ActivityItem, ActivityPage} from '@/lib/activity';
import {publicActivityPage} from '@/lib/client/activity';
import './activity.css';

type Filter = 'all' | 'listing' | 'announcement' | 'progress' | 'release';
const filters: {id: Filter; label: string}[] = [
  {id: 'all', label: 'All activity'}, {id: 'listing', label: 'New projects'},
  {id: 'announcement', label: 'Announcements'}, {id: 'progress', label: 'In progress'}, {id: 'release', label: 'Releases'},
];
const labels = {listing: 'New to RMT', announcement: 'Announcement', progress: 'In progress', release: 'Release'};
const icons = {listing: Compass, announcement: Megaphone, progress: Hammer, release: Rocket};

function Artwork({project, banner = false}: {project: ActivityItem['project']; banner?: boolean}) {
  const [failed, setFailed] = useState(false);
  const source = banner ? project.cover : project.artwork?.logo?.url || project.logo || project.cover;
  useEffect(() => setFailed(false), [source]);
  const custom = source.startsWith('/media/project-artwork/');
  const contained = !custom && (project.coverFit === 'contain' || (project.coverAspectRatio ?? 0) > 2.2);
  return <span className={'activity-art' + (banner ? ' activity-art-banner' : '') + (contained ? ' activity-art-contained' : '')} style={{'--activity-accent': project.accent, backgroundColor: custom ? undefined : project.coverBackground} as React.CSSProperties}>
    {!failed && source.startsWith('/') ? <img src={source} alt={banner ? project.name + ' artwork' : ''} loading="lazy" decoding="async" onError={() => setFailed(true)} /> : <span>{project.initials}</span>}
  </span>;
}

function ActivityCard({item, onProject}: {item: ActivityItem; onProject: (id: string, updates: boolean) => boolean}) {
  const [expanded, setExpanded] = useState(false);
  const KindIcon = icons[item.kind];
  const date = new Date(item.publishedAt);
  const long = item.body.length > 440 || item.body.split('\n').length > 6;
  const href = '/projects/' + encodeURIComponent(item.project.slug) + (item.kind === 'listing' ? '' : '#updates');
  function open(event: React.MouseEvent<HTMLAnchorElement>) {
    if (event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey && onProject(item.project.id, item.kind !== 'listing')) event.preventDefault();
  }
  return <article className={'activity-card activity-kind-' + item.kind} aria-labelledby={'activity-title-' + item.id}>
    <div className="activity-card-top">
      <a className="activity-project" href={href} onClick={open}><Artwork project={item.project} /><span><strong>{item.project.name}</strong><small>{item.project.category}</small></span></a>
      <time dateTime={date.toISOString()}>{date.toLocaleDateString(undefined, {month: 'short', day: 'numeric', year: 'numeric'})}</time>
    </div>
    {item.kind === 'listing' && <a className="activity-banner-link" href={href} onClick={open} aria-label={'Explore ' + item.project.name}><Artwork project={item.project} banner /><span>MEET THE PROJECT <ArrowUpRight size={16} /></span></a>}
    <div className="activity-card-body">
      <span className="activity-kind"><KindIcon size={13} />{labels[item.kind]}</span>
      <h2 id={'activity-title-' + item.id}>{item.kind === 'listing' ? item.project.name + ' has a home here.' : item.title}</h2>
      <p id={'activity-body-' + item.id} className={'activity-copy' + (long && !expanded ? ' activity-copy-collapsed' : '')}>{item.body}</p>
      {long && <button type="button" className="activity-read-more" aria-expanded={expanded} aria-controls={'activity-body-' + item.id} onClick={() => setExpanded(value => !value)}>{expanded ? 'Show less' : 'Read full update'}{expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</button>}
      <div className="activity-card-actions"><a href={href} onClick={open}>{item.kind === 'listing' ? 'Explore project' : 'View project updates'} <ArrowRight size={15} /></a>{item.linkUrl && <a href={item.linkUrl} target="_blank" rel="noopener noreferrer">{item.linkLabel}<ArrowUpRight size={15} /><span className="sr-only"> (opens in a new tab)</span></a>}</div>
    </div>
  </article>;
}

export default function ActivityFeed({onProject, onBuilder, onProfile}: {onProject: (id: string, updates: boolean) => boolean; onBuilder: () => void; onProfile: () => void}) {
  const [filter, setFilter] = useState<Filter>('all');
  const [cursors, setCursors] = useState<(string | null)[]>([null]);
  const [page, setPage] = useState<ActivityPage | null>(null);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const cursor = cursors[cursors.length - 1];

  useEffect(() => {
    const controller = new AbortController();
    setPage(null); setError('');
    const query = new URLSearchParams({kind: filter, limit: '6'});
    if (cursor) query.set('cursor', cursor);
    void fetch('/api/activity?' + query, {cache: 'no-store', credentials: 'omit', signal: controller.signal}).then(async response => {
      if (!response.ok) throw new Error('The activity feed is unavailable right now. Please try again.');
      const next = publicActivityPage(await response.json());
      if (!controller.signal.aborted) setPage(next);
    }).catch(cause => {if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Activity could not be loaded. Please try again.');});
    return () => controller.abort();
  }, [filter, cursor, refresh]);

  useEffect(() => {
    const recheck = () => {if (document.visibilityState === 'visible') setRefresh(value => value + 1);};
    const restore = (event: PageTransitionEvent) => {if (event.persisted) recheck();};
    const hide = () => setPage(null);
    window.addEventListener('focus', recheck); window.addEventListener('pageshow', restore); window.addEventListener('pagehide', hide);
    document.addEventListener('visibilitychange', recheck);
    return () => {window.removeEventListener('focus', recheck); window.removeEventListener('pageshow', restore); window.removeEventListener('pagehide', hide); document.removeEventListener('visibilitychange', recheck);};
  }, []);

  function move(next: (string | null)[]) {
    setPage(null); setCursors(next);
    heading.current?.focus({preventScroll: true});
    heading.current?.scrollIntoView({behavior: 'instant', block: 'start'});
  }
  function choose(next: Filter) {if (next !== filter) {setPage(null); setFilter(next); setCursors([null]);}}

  return <div className="activity-page">
    <header className="activity-heading"><div><span className="eyebrow"><span className="activity-signal" /> WHAT’S HAPPENING</span><h1 ref={heading} tabIndex={-1}>The ecosystem, in motion.</h1><p>Fresh projects. Real progress. New things to open.</p></div><span className="activity-heading-symbol" aria-hidden="true"><Radio size={37} /></span></header>
    <div className="activity-layout">
      <section className="activity-main" aria-label="Ecosystem activity">
        <div className="activity-filterbar"><div className="activity-filters" role="group" aria-label="Filter activity">{filters.map(item => <button key={item.id} type="button" aria-pressed={filter === item.id} onClick={() => choose(item.id)}>{item.label}</button>)}</div><button type="button" className="activity-refresh" aria-label="Refresh activity" onClick={() => setRefresh(value => value + 1)} disabled={!page && !error}><RefreshCw size={16} /></button></div>
        <div className="activity-feed-status" aria-live="polite"><span>{filter === 'all' ? 'ACROSS THE ECOSYSTEM' : filters.find(item => item.id === filter)?.label.toUpperCase()}</span><span>{page ? (page.items.length ? 'Page ' + cursors.length : 'Up to date') : error ? 'Connection needs attention' : 'Loading…'}</span></div>
        {error ? <div className="activity-feedback" role="alert"><CircleAlert size={28} /><h2>We couldn’t load activity.</h2><p>{error}</p><button className="button button-outline" type="button" onClick={() => setRefresh(value => value + 1)}><RefreshCw size={15} /> Try again</button></div>
          : !page ? <div className="activity-loading" role="status" aria-label="Loading activity"><span className="sr-only">Loading ecosystem activity…</span>{[0, 1].map(item => <div className="activity-skeleton" key={item} aria-hidden="true"><span /><strong /><p /><p /></div>)}</div>
          : !page.items.length ? <div className="activity-feedback activity-empty"><span className="activity-empty-icon"><Radio size={30} /></span><span className="eyebrow">ROOM FOR WHAT’S NEXT</span><h2>{cursors.length > 1 ? 'You’re at the end of this view.' : filter === 'listing' ? 'New arrivals will appear here.' : 'The next update could be yours.'}</h2><p>{cursors.length > 1 ? 'Head back to the newest activity across RMT.' : filter === 'listing' ? 'As projects join RMT, this becomes another way to find them.' : 'Confirmed project builders can share announcements, work in progress, and releases from Builder Studio.'}</p>{cursors.length > 1 ? <button type="button" className="button button-outline" onClick={() => move([null])}><ArrowLeft size={15} /> Newest activity</button> : <button type="button" className="button button-outline" onClick={onBuilder}><Terminal size={15} /> Open Builder Studio</button>}</div>
          : <div className="activity-list">{page.items.map(item => <ActivityCard key={item.id} item={item} onProject={onProject} />)}</div>}
        {page && page.items.length > 0 && (cursors.length > 1 || page.nextCursor) && <nav className="activity-pagination" aria-label="Activity pages"><button type="button" className="button button-outline" disabled={cursors.length <= 1} onClick={() => move(cursors.slice(0, -1))}><ArrowLeft size={15} /> Newer</button><span>Page {cursors.length}</span><button type="button" className="button button-outline" disabled={!page.nextCursor} onClick={() => {if (page.nextCursor) move([...cursors, page.nextCursor]);}}>Older <ArrowRight size={15} /></button></nav>}
        <p className="activity-footnote">Builder updates are reviewed before publishing. “New to RMT” marks when a project joined this directory.</p>
      </section>
      <aside className="activity-sidebar" aria-label="Make yourself at home">
        <section className="activity-builder-card"><span className="activity-side-icon"><Terminal size={23} /></span><span className="eyebrow">SOMETHING TAKING SHAPE?</span><h2>Let the ecosystem<br /> in on it.</h2><p>Give your project a home. Claim your listing, keep your links together, and share what you’re building.</p><button type="button" className="button button-lime" onClick={onBuilder}>Open Builder Studio <ArrowUpRight size={16} /></button><small>Free to list. Free to claim.</small></section>
        <section className="activity-profile-card"><UserRound size={22} /><h2>A face behind the build.</h2><p>Create your RMT profile. Choose what to share, and connect the projects you manage.</p><button type="button" onClick={onProfile}>Make it yours <ArrowRight size={15} /></button></section>
      </aside>
    </div>
  </div>;
}
