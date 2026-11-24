'use client';

import { useEffect, useRef, useState } from 'react';
import {
  ArrowDownToLine, ArrowRight, ArrowUpRight, Bookmark, Check, ChevronRight,
  Compass, Gamepad2, Grid2X2, LayoutGrid, Library, ListFilter, Menu,
  Music2, Plus, Search, ShieldCheck, Sparkles, Terminal, Wrench, X, Copy, Share2, Layers3,
  UserRound, Cloud, LoaderCircle, RefreshCw, AlertCircle,
} from 'lucide-react';
import { seedProjects, type Project } from '@/lib/catalog';
import { normalizeProjectQuery, searchProjects } from '@/lib/project-search';
import Studio from './Studio';
import ReviewQueue from './ReviewQueue';
import ClaimProject from './ClaimProject';
import Account, { LibrarySyncStatus, signInHref } from './Account';
import { useProjectLibrary, type SessionStatus } from './use-project-library';
import { LinkOptions, ManualCopyDialog } from './LinkOptions';

type Section = 'discover' | 'library' | 'games' | 'music' | 'tools' | 'studio' | 'review' | 'claim' | 'account';
type Session = { authenticated: boolean; userId: string | null; displayName: string | null; isAdmin: boolean };
const emptySession: Session = { authenticated: false, userId: null, displayName: null, isAdmin: false };
const categories = ['All projects', 'Games', 'Music', 'Tools', 'Community'];
const navItems = [
  { id: 'discover' as Section, label: 'Discover', icon: Compass },
  { id: 'library' as Section, label: 'My library', icon: Library },
  { id: 'games' as Section, label: 'Games', icon: Gamepad2 },
  { id: 'music' as Section, label: 'Music', icon: Music2 },
  { id: 'tools' as Section, label: 'Tools', icon: Wrench },
];

function domain(url: string) { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; } }

function Cover({ project, className = '' }: { project: Project; className?: string }) {
  const [failed, setFailed] = useState(false);
  return <div className={'project-art art-' + project.slug + (project.coverFit === 'contain' ? ' art-contained' : '') + ' ' + className} style={{ '--accent': project.accent } as React.CSSProperties}>
    {project.cover.startsWith('/') && !failed
      ? <img src={project.cover} alt={project.name + ' project artwork'} onError={() => setFailed(true)} loading="lazy" />
      : <span className="art-monogram">{project.initials}</span>}
  </div>;
}

export default function Hub() {
  const [section, setSection] = useState<Section>('discover');
  const [category, setCategory] = useState('All projects');
  const [query, setQuery] = useState('');
  const [projects, setProjects] = useState<Project[]>(seedProjects);
  const [selected, setSelected] = useState<Project | null>(null);
  const [claimProject, setClaimProject] = useState<Project | null>(null);
  const [session, setSession] = useState<Session>(emptySession);
  const [sessionStatus, setSessionStatus] = useState<SessionStatus>('loading');
  const [toast, setToast] = useState('');
  const [mobileMenu, setMobileMenu] = useState(false);
  const [installOpen, setInstallOpen] = useState(false);
  const [catalogError, setCatalogError] = useState(false);
  const [copyFallback, setCopyFallback] = useState<string | null>(null);
  const [framedOrigin, setFramedOrigin] = useState('');
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const installRef = useRef<HTMLDialogElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionRequest = useRef<AbortController | null>(null);
  const copyRequest = useRef(0);
  const library = useProjectLibrary(session, sessionStatus, () => { notify('Your account changed. Reconnecting your library.'); void refreshSession(); });
  const saved = library.saved;

  function notify(message: string) {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 4200);
  }

  function go(next: Section) {
    setSection(next); setQuery(''); setCategory('All projects'); setMobileMenu(false); setSelected(null); setClaimProject(null);
    window.history.replaceState(null, '', '#' + next);
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  function searchAllProjects() {
    const currentQuery = query;
    go('discover');
    setQuery(currentQuery);
    searchRef.current?.focus();
  }

  async function refreshSession() {
    sessionRequest.current?.abort();
    const controller = new AbortController();
    sessionRequest.current = controller;
    setSessionStatus('loading');
    try {
      const response = await fetch('/api/session', { cache: 'no-store', credentials: 'same-origin', signal: controller.signal });
      if (!response.ok) throw new Error('Account unavailable');
      const value = await response.json() as Session;
      if (typeof value.authenticated !== 'boolean' || typeof value.isAdmin !== 'boolean' || (value.authenticated && (typeof value.userId !== 'string' || !value.userId.trim())) || (value.displayName !== null && typeof value.displayName !== 'string')) throw new Error('Invalid account response');
      if (controller.signal.aborted) return;
      setSession(value); setSessionStatus('ready');
    } catch {
      if (!controller.signal.aborted) { setSession(emptySession); setSessionStatus('error'); }
    }
  }

  useEffect(() => {
    if (window.self !== window.top) setFramedOrigin(window.location.origin);
    void refreshSession();
    fetch('/api/catalog', { cache: 'no-store' }).then(res => {
      if (!res.ok) throw new Error('Unavailable');
      return res.json();
    }).then(data => {
      const value = data as { projects?: Project[] };
      if (Array.isArray(value.projects)) setProjects(value.projects);
      else throw new Error('Invalid catalog response');
    }).catch(() => setCatalogError(true));
    const onShortcut = (event: KeyboardEvent) => {
      if (event.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes((event.target as HTMLElement).tagName)) {
        event.preventDefault(); searchRef.current?.focus();
      }
    };
    const onInstall = (event: Event) => { event.preventDefault(); setInstallPrompt(event); };
    const recheckAccount = () => { if (document.visibilityState === 'visible') void refreshSession(); };
    const restoreAccount = (event: PageTransitionEvent) => { if (event.persisted) void refreshSession(); };
    const hideAccount = () => { sessionRequest.current?.abort(); setSessionStatus('loading'); };
    window.addEventListener('keydown', onShortcut);
    window.addEventListener('beforeinstallprompt', onInstall);
    window.addEventListener('focus', recheckAccount);
    window.addEventListener('pageshow', restoreAccount);
    window.addEventListener('pagehide', hideAccount);
    document.addEventListener('visibilitychange', recheckAccount);
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
    return () => {
      window.removeEventListener('keydown', onShortcut);
      window.removeEventListener('beforeinstallprompt', onInstall);
      window.removeEventListener('focus', recheckAccount);
      window.removeEventListener('pageshow', restoreAccount);
      window.removeEventListener('pagehide', hideAccount);
      document.removeEventListener('visibilitychange', recheckAccount);
      if (toastTimer.current) clearTimeout(toastTimer.current);
      sessionRequest.current?.abort();
      copyRequest.current += 1;
    };
  }, []);

  useEffect(() => {
    const route = () => {
      const hash = window.location.hash.slice(1);
      const match = hash.match(/^(project|claim)\/(.+)$/);
      const legacyClaim = new URLSearchParams(window.location.search).get('claim');
      if (match || (hash === 'claim' && legacyClaim)) {
        let id: string;
        try { id = decodeURIComponent(match?.[2] ?? legacyClaim ?? ''); } catch { return; }
        const project = projects.find(item => item.id === id || item.slug === id);
        if (project) {
          if (match?.[1] === 'project') { setSection('discover'); setSelected(project); setClaimProject(null); }
          else { setSection('claim'); setClaimProject(project); setSelected(null); }
        }
        return;
      }
      if (['discover', 'library', 'games', 'music', 'tools', 'studio', 'review', 'account'].includes(hash)) {
        setSection(hash as Section); setSelected(null); setClaimProject(null);
      }
    };
    route(); window.addEventListener('hashchange', route); window.addEventListener('popstate', route);
    return () => { window.removeEventListener('hashchange', route); window.removeEventListener('popstate', route); };
  }, [projects]);

  function openProject(project: Project) {
    setSelected(project); setClaimProject(null);
    window.history.pushState(null, '', '#project/' + encodeURIComponent(project.id));
  }

  function closeProject() {
    setSelected(null);
    window.history.replaceState(null, '', '#' + (section === 'claim' ? 'discover' : section));
  }

  function startClaim(project: Project) {
    setSelected(null); setClaimProject(project); setSection('claim'); setMobileMenu(false);
    window.history.pushState(null, '', '#claim/' + encodeURIComponent(project.id));
    window.scrollTo({top: 0, behavior: 'instant'});
  }

  async function copyLink(value: string, message: string) {
    const request = ++copyRequest.current;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const clipboardWrite = navigator.clipboard.writeText(value);
      // Some embedded browsers leave clipboard permission requests pending.
      await Promise.race([
        clipboardWrite,
        new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error('Clipboard unavailable')), 1500); }),
      ]);
      if (request === copyRequest.current) { setCopyFallback(null); notify(message); }
    } catch {
      if (request === copyRequest.current) setCopyFallback(value);
    } finally {
      if (timeout !== undefined) clearTimeout(timeout);
    }
  }

  function destinationCount(project: Project) {
    return new Set([...project.links.map(link => link.url), ...(project.collections ?? []).map(item => item.url)]).size;
  }

  useEffect(() => {
    if (selected) dialogRef.current?.showModal();
    else dialogRef.current?.close();
  }, [selected]);
  useEffect(() => {
    if (installOpen) installRef.current?.showModal();
    else installRef.current?.close();
  }, [installOpen]);

  async function toggleSave(project: Project) {
    try {
      const result = await library.toggle(project.id);
      if (!result) return;
      if (result.storage === 'visit') notify(result.removed ? 'Removed for this visit. Browser storage is unavailable.' : 'Saved for this visit. Browser storage is unavailable.');
      else notify(result.removed ? project.name + ' removed from your library.' : project.name + (result.storage === 'cloud' ? ' saved to your RMT account.' : ' saved on this device.'));
    } catch (error) { notify(error instanceof Error ? error.message : 'Your library could not be updated. Please try again.'); }
  }

  async function importDeviceLibrary() {
    try {
      const result = await library.importDevice();
      if (!result) return;
      notify((result.importedCount || 0) + ' device favorites added to your account.' + (result.skippedCount ? ' ' + result.skippedCount + ' unavailable or over the 200-project limit.' : ''));
    } catch (error) { notify(error instanceof Error ? error.message : 'Your favorites could not be imported. Please try again.'); }
  }

  async function removeUnavailable(projectId: string) {
    try {
      const result = await library.toggle(projectId);
      if (result) notify(result.storage === 'visit' ? 'Removed for this visit. Browser storage is unavailable.' : 'Unavailable project removed from your library.');
    } catch (error) { notify(error instanceof Error ? error.message : 'That saved project could not be removed.'); }
  }

  async function install() {
    if (!installPrompt) { setInstallOpen(true); return; }
    await installPrompt.prompt();
    const result = await installPrompt.userChoice;
    if (result.outcome === 'accepted') notify('RMT is being added to your home screen.');
    setInstallPrompt(null);
  }

  const activeCategory = section === 'games' ? 'Games' : section === 'music' ? 'Music' : section === 'tools' ? 'Tools' : category;
  const hasSearch = normalizeProjectQuery(query).length > 0;
  const DirectoryHeading = hasSearch ? 'h1' : 'h2';
  const filtered = searchProjects(projects, { query, category: activeCategory, savedIds: section === 'library' ? saved : undefined });
  const isSearchScoped = section === 'library' || activeCategory !== 'All projects';
  const searchScope = section === 'library' ? (activeCategory === 'All projects' ? 'your library' : activeCategory.toLowerCase() + ' in your library') : activeCategory.toLowerCase();
  const matchesOutsideScope = hasSearch && isSearchScoped ? searchProjects(projects, { query }).length - filtered.length : 0;
  const isDirectory = !['studio', 'review', 'claim', 'account'].includes(section);
  const feature = projects.find(project => project.id === 'vamps') || projects[0];
  const savedProjects = saved.map(id => projects.find(project => project.id === id)).filter(Boolean) as Project[];
  const unavailableSaved = saved.filter(id => !projects.some(project => project.id === id));
  const returnTo = '/#' + (claimProject ? 'claim/' + encodeURIComponent(claimProject.id) : selected ? 'project/' + encodeURIComponent(selected.id) : section);
  const titles: Record<string, { eyebrow: string; title: string; description: string }> = {
    discover: { eyebrow: 'LESS SEARCHING. MORE EXPLORING.', title: 'Your ecosystem. All together.', description: 'Discover what communities are building. Keep your favorites one tap away.' },
    library: { eyebrow: 'MAKE YOURSELF AT HOME', title: 'Your corner of the ecosystem.', description: 'Your projects, games, and tools. Ready when you are.' },
    games: { eyebrow: 'FIND YOUR NEXT SESSION', title: 'Press play. Meet a new world.', description: 'Games from independent communities, launched from one place.' },
    music: { eyebrow: 'A SPACE FOR CREATORS', title: 'Something worth listening to.', description: 'A home for music experiences from independent creators.' },
    tools: { eyebrow: 'BUILT FOR THE CURIOUS', title: 'Find your next favorite tool.', description: 'Creative software and useful apps from ecosystem builders.' },
  };
  const heading = titles[section] || titles.discover;
  const toastNode = toast ? (<div className="toast" role="status"><span className="toast-check"><Check size={16} /></span>{toast}<button onClick={() => setToast('')} aria-label="Dismiss notification"><X size={15} /></button></div>) : null;

  return <div className="hub">
    <a className="skip-link" href="#main-content">Skip to content</a>
    <aside className={'sidebar ' + (mobileMenu ? 'sidebar-open' : '')} aria-label="Main navigation">
      <button className="brand" onClick={() => go('discover')} aria-label="RMT home">
        <span className="brand-mark" aria-hidden="true"><span /><span /><span /></span>
        <span className="brand-word">RMT<span className="brand-dot">.</span></span>
        <span className="beta-tag">BETA</span>
      </button>
      <div className="nav-caption">YOUR SPACE</div>
      <nav>
        {navItems.map(({ id, label, icon: Icon }) => <button key={id} className={'nav-item ' + (section === id ? 'nav-active' : '')} onClick={() => go(id)} aria-current={section === id ? 'page' : undefined}>
          <Icon size={19} strokeWidth={1.8} /><span>{label}</span>
          {id === 'library' && savedProjects.length > 0 && <span className="nav-count">{savedProjects.length}</span>}
        </button>)}
        <button className={'nav-item ' + (section === 'account' ? 'nav-active' : '')} onClick={() => go('account')} aria-current={section === 'account' ? 'page' : undefined}><UserRound size={19} strokeWidth={1.8} /><span>My account</span></button>
      </nav>
      <div className="nav-divider" />
      <div className="nav-caption">FOR BUILDERS</div>
      <button className={'nav-item ' + (section === 'studio' ? 'nav-active' : '')} onClick={() => go('studio')}><Terminal size={19} /><span>Builder Studio</span><ArrowUpRight size={14} /></button>
      {sessionStatus === 'ready' && session.isAdmin && <button className={'nav-item ' + (section === 'review' ? 'nav-active' : '')} onClick={() => go('review')}><ShieldCheck size={19} /><span>Review queue</span></button>}
      <div className="sidebar-bottom">
        <div className="ecosystem-card"><span className="ecosystem-orbit">r</span><div><span>EXPLORING</span><strong>Robinhood ecosystem</strong></div><span className="status-dot" /></div>
        <button className="install-nav" onClick={install}><ArrowDownToLine size={17} /> Add RMT to your phone</button>
        <div className="sidebar-foot"><span>Independent. Community built.</span><span>v0.4</span></div>
      </div>
    </aside>
    {mobileMenu && <button className="sidebar-scrim" aria-label="Close menu" onClick={() => setMobileMenu(false)} />}
    <div className="workspace">
      <header className="topbar">
        <div className="mobile-brand"><button className="icon-button" onClick={() => setMobileMenu(!mobileMenu)} aria-label="Open navigation"><Menu size={21} /></button><button onClick={() => go('discover')}>RMT<span>.</span></button></div>
        <div className="search-box" role="search"><Search size={18} aria-hidden="true" /><label htmlFor="project-search" className="sr-only">Search projects and experiences</label><input id="project-search" type="search" ref={searchRef} value={query} autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false} enterKeyHint="search" onChange={event => { const value = event.target.value; if (!isDirectory) go('discover'); setQuery(value); }} placeholder="Search projects, games, tools…" /><kbd>/</kbd>{query && <button type="button" className="search-clear" aria-label="Clear search" onClick={() => { setQuery(''); searchRef.current?.focus(); }}><X size={15} /></button>}</div>
        <div className="topbar-actions"><button className="button button-small button-outline submit-project-topbar" onClick={() => go('studio')} aria-label="Submit a project"><Plus size={16} /><span className="submit-label">Submit a project</span></button>{sessionStatus === 'loading' ? <span className="topbar-account-loading" role="status" aria-label="Checking your account"><LoaderCircle className="rmt-spin" size={17} /></span> : session.authenticated || sessionStatus === 'error' ? <button className="topbar-account" onClick={() => go('account')} aria-label="Open your RMT account" title={session.displayName || 'My account'}><span className="topbar-account-avatar"><UserRound size={14} /></span><span>{session.displayName?.split(' ')[0] || 'Account'}</span></button> : <a className="topbar-signin" href={signInHref(returnTo)} target="_top"><UserRound size={15} /> Sign in</a>}</div>
      </header>
      <main id="main-content" tabIndex={-1} className={'main-content' + (hasSearch ? ' search-mode' : '')}>
        {framedOrigin && <aside className={'embedded-view-notice' + (hasSearch ? ' embedded-view-compact' : '')} aria-label="Embedded preview navigation">
          <span className="embedded-view-icon" aria-hidden="true"><ArrowUpRight size={18} /></span>
          <div><strong>{hasSearch ? 'Preview' : 'A little more room to explore.'}</strong>{!hasSearch && <><p>Some previews block links. Open RMT directly, or copy a destination into your browser.</p><small>{domain(framedOrigin)}</small></>}</div>
          <div className="embedded-view-actions"><a href={framedOrigin + returnTo} target="_top" className="button button-outline">Open RMT <ArrowUpRight size={14} /></a><button type="button" onClick={() => void copyLink(framedOrigin + returnTo, 'RMT link copied.')} aria-label="Copy direct RMT link"><Copy size={13} /> {hasSearch ? 'Copy' : 'Copy link'}</button></div>
        </aside>}
        {isDirectory ? <>
          {!hasSearch && <div className="page-heading"><div><div className="eyebrow">{heading.eyebrow}</div><h1>{heading.title}</h1><p>{heading.description}</p></div><span className="network-label"><span className="network-symbol">↗</span> ROBINHOOD CHAIN</span></div>}
          {section === 'discover' && !hasSearch && category === 'All projects' && feature && <section className="feature-layout" aria-label="Featured project">
            <div className="hero-card">
              <Cover project={feature} className="hero-art" />
              <div className="hero-shade" />
              <div className="hero-content"><span className="feature-tag"><Sparkles size={13} /> FROM THE DIRECTORY</span><div className="hero-brand">VAMPS<span>AFTER HOURS</span></div><h2>Enter the<br />after hours.</h2><p>Games. Creative tools. A whole community to discover.</p><div className="hero-buttons"><button type="button" className="button button-lime hero-project-trigger" onClick={() => openProject(feature)} aria-haspopup="dialog">Explore VAMPS <ArrowUpRight size={17} /></button><button className={'button hero-save ' + (saved.includes(feature.id) ? 'is-saved' : '')} disabled={!library.canSave} onClick={() => void toggleSave(feature)} aria-label={saved.includes(feature.id) ? 'Remove VAMPS from library' : 'Save VAMPS to library'}>{saved.includes(feature.id) ? <Check size={19} /> : <Plus size={19} />}</button></div></div>
              <div className="hero-bottom"><span><span className="tiny-square" /> Games & creative tools</span><span>CURATED PICK · NOT SPONSORED</span></div>
            </div>
            <div className="feature-side">
              <div className="quick-library"><div className="card-overline"><span>YOUR QUICK LAUNCH</span><Library size={16} /></div><h3>Goodbye, lost links.</h3><p>Save the projects you come back to. We’ll keep them together.</p><div className="quick-icons">{savedProjects.length > 0 ? savedProjects.slice(0, 3).map(project => <button key={project.id} className="quick-icon" onClick={() => openProject(project)} title={project.name} aria-label={'Explore ' + project.name} aria-haspopup="dialog"><Cover project={project} /></button>) : <><span className="empty-quick"><Gamepad2 size={24} /></span><span className="empty-quick"><Music2 size={24} /></span><span className="empty-quick"><Wrench size={24} /></span></>}<button className="quick-add" onClick={() => go('library')} aria-label="Open your library"><Plus size={22} /></button></div><button className="text-link" onClick={() => go('library')}>Open my library <ArrowRight size={15} /></button></div>
              <button className="builder-teaser" onClick={() => go('studio')}><div><span className="card-overline">BUILDING SOMETHING?</span><h3>There’s a place for you.</h3><p>Bring your project to RMT. Listing is free.</p></div><span className="teaser-arrow"><ArrowUpRight size={22} /></span></button>
            </div>
          </section>}
          {section === 'library' && <>
            {!hasSearch && <section className="library-home" aria-label="Your personal launchpad">
              <div className="library-home-header"><div className="library-home-heading"><span className="library-home-icon"><Library size={25} /></span><div><span className="account-kicker">YOUR PERSONAL LAUNCHPAD</span><h2>Right where you left them.</h2><p>{library.status === 'ready' ? savedProjects.length + (savedProjects.length === 1 ? ' project ready to explore.' : ' projects ready to explore.') : library.status === 'loading' ? 'Your favorites are on their way.' : 'Reconnect to see your saved projects.'}</p></div></div><div className="library-home-tools"><LibrarySyncStatus library={library} />{library.isCloud && <button className="library-refresh" disabled={library.busy || library.status === 'loading'} onClick={() => library.status === 'error' ? void refreshSession() : void library.refresh()} aria-label="Refresh your account library" title="Refresh your account library"><RefreshCw size={13} /></button>}</div></div>
              {savedProjects.length > 0 && <div className="library-launches">{savedProjects.slice(0, 4).map(project => <div className="library-launch-entry" key={project.id}><button type="button" className="library-launch" onClick={() => openProject(project)} aria-label={'Explore ' + project.name} aria-haspopup="dialog"><div className="library-launch-art"><Cover project={project} /></div><div><strong>{project.name}</strong><small>View project · {domain(project.launchUrl)}</small></div><ArrowUpRight size={19} /></button><div className="library-launch-actions"><a className="library-direct-launch" href={project.launchUrl} target="_top" rel="noopener noreferrer" aria-label={'Launch ' + project.name + ' in this tab'}>{project.launchLabel} <ArrowUpRight size={13} /></a><LinkOptions href={project.launchUrl} label={project.name} onCopy={copyLink} /></div></div>)}</div>}
              {!session.authenticated && sessionStatus === 'ready' && <div className="library-account-prompt"><p>A new phone shouldn’t mean starting over. Sign in to save your library with your account.</p><a className="text-link" href={signInHref('/#library')} target="_top">Take it with you <ArrowRight size={14} /></a></div>}
            </section>}
            {!hasSearch && library.pendingImportCount > 0 && <section className="library-import" aria-label="Bring device favorites into your account"><div><h3>{library.pendingImportCount} {library.pendingImportCount === 1 ? 'favorite is' : 'favorites are'} waiting on this device.</h3><p>Choose to add these browser favorites to this account. Your existing account library stays in place.</p></div><div className="library-import-actions"><button className="button button-lime" disabled={library.busy} onClick={() => void importDeviceLibrary()}>{library.busy ? <LoaderCircle size={14} className="rmt-spin" /> : <Cloud size={14} />} Add to my account</button><button disabled={library.busy} onClick={library.dismissImport}>Later</button></div></section>}
            {library.status === 'loading' && <div className="library-load-state" role="status"><LoaderCircle className="rmt-spin" size={18} /><div><strong>Opening your library…</strong><p>Checking where your favorites are saved.</p></div></div>}
            {library.status === 'error' && <div className="library-load-state library-load-error" role="alert"><AlertCircle size={18} /><div><strong>Your library needs a reconnect.</strong><p>{library.error}</p></div><button className="button button-outline" onClick={() => void refreshSession()}><RefreshCw size={14} /> Try again</button></div>}
            {!hasSearch && unavailableSaved.length > 0 && <details className="library-unavailable"><summary>{unavailableSaved.length} saved {unavailableSaved.length === 1 ? 'project is' : 'projects are'} currently unavailable</summary><p>These projects are not in the current directory. Keep them for their return, or remove a saved reference below.</p><ul>{unavailableSaved.map(id => <li key={id}><span>Unavailable project <small>{id}</small></span><button disabled={!library.canSave} onClick={() => void removeUnavailable(id)} aria-label={'Remove unavailable saved project ' + id}>Remove <X size={12} /></button></li>)}</ul></details>}
          </>}
          <section className="directory-section" aria-labelledby="directory-heading">
            <div className="section-heading"><div><DirectoryHeading id="directory-heading" className="directory-heading">{hasSearch ? 'Search results' : section === 'library' ? 'Saved by you' : section === 'discover' ? 'Explore the ecosystem' : section === 'games' ? 'Find your next game' : section === 'music' ? 'Music experiences' : 'Tools & creative apps'}<span className="count-pill">{filtered.length}</span></DirectoryHeading>{!hasSearch && <p>{section === 'library' ? (library.status !== 'ready' ? 'Your library will appear when the connection is checked.' : library.isCloud ? 'Your favorites are connected to your RMT account.' : library.storageAvailable ? 'Favorites saved while signed out stay on this device.' : 'Browser storage is unavailable. Favorites last for this visit.') : 'Real projects. Official destinations. A little less searching.'}</p>}</div><span className="view-indicator"><Grid2X2 size={16} /> Project view</span></div>
            {['discover', 'library'].includes(section) && <div className="filter-row"><div className="category-tabs" aria-label="Filter by category">{categories.map(item => <button key={item} className={category === item ? 'tab-active' : ''} onClick={() => setCategory(item)} aria-pressed={category === item}>{item === 'Games' && <Gamepad2 size={15} />}{item === 'Music' && <Music2 size={15} />}{item === 'Tools' && <Wrench size={15} />}{item}</button>)}</div><span className="directory-count"><ListFilter size={15} /> {section === 'library' ? 'Your picks' : 'A–Z below'}</span></div>}
            {hasSearch && (section !== 'library' || library.status === 'ready') && <div className="search-feedback"><div role="status" aria-live="polite" aria-atomic="true"><p><strong>{filtered.length} {filtered.length === 1 ? 'result' : 'results'}</strong> for “{query.trim()}” in <strong>{searchScope}</strong>.</p>{matchesOutsideScope > 0 && <span>{matchesOutsideScope} more {matchesOutsideScope === 1 ? 'match is' : 'matches are'} outside this view.</span>}</div>{isSearchScoped && filtered.length > 0 && <button type="button" onClick={searchAllProjects}>Search all projects <ArrowRight size={14} /></button>}</div>}
            {catalogError && <p className="inline-notice" role="status">Community submissions are temporarily unavailable. You can still explore the curated directory.</p>}
            {section === 'library' && library.status !== 'ready' ? null : filtered.length ? <div className="project-grid">{[...filtered].sort((a, b) => a.name.localeCompare(b.name)).map(project => <article className="project-card" key={project.id}>
              <div className="project-image-button"><Cover project={project} /><span className="card-category">{project.category}</span><span className="card-open" aria-hidden="true"><ArrowUpRight size={19} /></span></div>
              <div className="project-card-body"><div className="project-card-heading"><div className="project-name-button"><h3><button type="button" className="project-card-trigger" onClick={() => openProject(project)} aria-label={'Explore ' + project.name} aria-haspopup="dialog">{project.name}</button></h3></div><button type="button" className={'save-button ' + (saved.includes(project.id) ? 'saved' : '')} aria-label={(saved.includes(project.id) ? 'Remove ' : 'Save ') + project.name + (saved.includes(project.id) ? ' from library' : ' to library')} aria-pressed={saved.includes(project.id)} disabled={!library.canSave} onClick={() => void toggleSave(project)}>{saved.includes(project.id) ? <Bookmark size={18} fill="currentColor" /> : <Bookmark size={18} />}</button></div><p>{project.tagline}</p><div className="project-card-footer"><span>{destinationCount(project)} destinations{project.stage && project.stage !== 'live' ? ' · ' + (project.stage === 'starting' ? 'Starting out' : 'In development') : ''}</span><span className="project-card-explore" aria-hidden="true">Explore <ArrowUpRight size={14} /></span></div></div>
            </article>)}</div> : <div className="empty-state"><div className="empty-state-icon">{section === 'library' ? <Library size={29} /> : section === 'music' ? <Music2 size={29} /> : <Search size={29} />}</div><h3>{hasSearch ? (matchesOutsideScope > 0 ? 'There’s more beyond this view.' : 'No projects found.') : section === 'library' ? 'Your next favorite belongs here.' : 'The first spot could be yours.'}</h3><p>{hasSearch ? (matchesOutsideScope > 0 ? 'Your search matches projects elsewhere in the directory. Open all projects to see them without changing your search.' : isSearchScoped ? 'Try a shorter name, or search all projects to look beyond your current filters.' : 'Try a project name, part of a name, a game, or a website.') : section === 'library' ? (library.isCloud ? 'Tap the bookmark on any project to save it to your account. Your favorites will be ready here on any device.' : 'Tap the bookmark on any project to keep it here. Sign in to take your library to another device.') : 'We’re opening this part of the directory to builders. Have an experience people should discover?'}</p><button className="button button-lime" onClick={() => hasSearch ? (isSearchScoped ? searchAllProjects() : setQuery('')) : go(section === 'library' ? 'discover' : 'studio')}>{hasSearch ? (isSearchScoped ? 'Search all projects' : 'Clear search') : section === 'library' ? 'Find a project' : 'Submit your project'}<ArrowRight size={16} /></button></div>}
          </section>
          {section === 'discover' && <section className="community-banner"><div className="community-banner-icon"><LayoutGrid size={26} /></div><div><h3>Your community built it. Let people find it.</h3><p>Games, creative tools, and projects deserve more than a buried link.</p></div><button className="button button-outline" onClick={() => go('studio')}>Join the directory <ArrowUpRight size={16} /></button></section>}
          <footer className="content-footer"><span>RMT is an independent directory. Listings don’t imply a partnership.</span><button onClick={() => go('studio')}>Built something? Let’s see it. <ArrowUpRight size={12} /></button></footer>
        </> : section === 'account' ? <Account session={sessionStatus === 'ready' ? session : emptySession} sessionStatus={sessionStatus} library={library} onRetrySession={() => void refreshSession()} onToast={notify} onLibrary={() => go('library')} onStudio={() => go('studio')} onReview={() => go('review')} /> : <>
          {sessionStatus !== 'ready' && <div className={'library-load-state ' + (sessionStatus === 'error' ? 'library-load-error' : '')} role="status">{sessionStatus === 'loading' ? <LoaderCircle className="rmt-spin" size={18} /> : <AlertCircle size={18} />}<div><strong>{sessionStatus === 'loading' ? 'Checking your account…' : 'Your account needs a reconnect.'}</strong><p>Your private workspace opens after your account is checked.</p></div>{sessionStatus === 'error' && <button className="button button-outline" onClick={() => void refreshSession()}><RefreshCw size={14} /> Try again</button>}</div>}
          <div className="private-workspace" key={session.userId || 'guest'} hidden={sessionStatus !== 'ready'} inert={sessionStatus !== 'ready'}>{section === 'studio' ? <Studio session={session} onToast={notify} /> : section === 'claim' && claimProject ? <ClaimProject key={claimProject.id} project={claimProject} session={session} onToast={notify} onClose={() => { go('discover'); openProject(claimProject); }} /> : <ReviewQueue session={session} onToast={notify} />}</div>
        </>}

      </main>
    </div>
    <nav className="mobile-bottom" aria-label="Mobile navigation">
      {[navItems[0], navItems[1], navItems[2], { id: 'studio' as Section, label: 'Build', icon: Terminal }].map(({ id, label, icon: Icon }) => <button key={id} className={section === id ? 'active' : ''} onClick={() => go(id)}><Icon size={20} /><span>{label}</span></button>)}
    </nav>
    <dialog ref={dialogRef} className="project-dialog" aria-labelledby="project-title" onCancel={closeProject} onClick={event => { if (event.target === event.currentTarget) closeProject(); }}>
      {selected && <div className="detail-inner">
        <div className="detail-cover"><Cover project={selected} /><div className="detail-cover-shade" /><button className="dialog-close" onClick={closeProject} aria-label="Close project"><X size={20} /></button><span className="detail-category">{selected.category}{selected.stage && selected.stage !== 'live' ? ' · ' + (selected.stage === 'starting' ? 'Starting out' : 'In development') : ''}</span></div>
        <div className="detail-body">
          <div className="detail-heading"><div><span className="detail-listing">{selected.claimed ? 'BUILDER CLAIMED' : 'CURATED LISTING · UNCLAIMED'}</span><h2 id="project-title">{selected.name}</h2><p>{selected.tagline}</p></div><button className={'button button-outline detail-save ' + (saved.includes(selected.id) ? 'is-saved' : '')} disabled={!library.canSave} onClick={() => void toggleSave(selected)}>{saved.includes(selected.id) ? <Check size={16} /> : <Plus size={16} />}{saved.includes(selected.id) ? 'In your library' : 'Add to library'}</button></div>
          <p className="detail-description">{selected.description}</p>
          <div className="detail-launch-row"><a className="button button-lime" href={selected.launchUrl} target="_top" rel="noopener noreferrer">{selected.launchLabel} <ArrowUpRight size={17} /></a><button className="button button-outline" onClick={() => void copyLink(window.location.origin + '/#project/' + encodeURIComponent(selected.id), 'Project link copied.')}><Share2 size={15} /> Share project</button></div>
          <div className="launch-hint"><span>Opens {domain(selected.launchUrl)} in this tab.</span><LinkOptions href={selected.launchUrl} label={selected.name + ' launch destination'} onCopy={copyLink} /></div>
          {selected.links.length > 0 && <><div className="detail-section-label">EXPLORE THE PROJECT <span>{selected.links.length}</span></div><div className="destination-list">{selected.links.map(link => <div className="destination-entry" key={link.url}><a href={link.url} target="_top" rel="noopener noreferrer" className="destination"><span className="destination-symbol">{/game/i.test(link.type || '') ? <Gamepad2 size={20} /> : /tool|software|wallet/i.test(link.type || '') ? <Wrench size={20} /> : <Compass size={20} />}</span><span><strong>{link.label}</strong><small>{domain(link.url)}{link.type && <span> · {link.type}</span>}</small></span><ArrowUpRight size={18} /></a><LinkOptions href={link.url} label={link.label} onCopy={copyLink} /></div>)}</div></>}
          {!!selected.collections?.length && <section className="collections-section" aria-label="Project collections"><div className="detail-section-label"><Layers3 size={14} /> COLLECTIONS <span>{selected.collections.length}</span></div><div className="collection-list">{selected.collections.map((collection, index) => <div className="collection-entry" key={collection.url}><a className="collection-link" href={collection.url} target="_top" rel="noopener noreferrer"><span className="collection-index">{String(index + 1).padStart(2, '0')}</span><span><strong>{collection.name}</strong><small>{domain(collection.url)} · {collection.chain || 'Collection'} · {index === 0 ? 'Primary collection' : 'Related collection'}</small></span><ArrowUpRight size={16} /></a><LinkOptions href={collection.url} label={collection.name} onCopy={copyLink} /></div>)}</div><p className="collection-footnote">Collections are grouped using links published by the project or its creator.</p></section>}
          <div className="detail-note"><ArrowUpRight size={15} /><p>Experiences open on their creators’ sites. Access requirements vary. {selected.claimed ? 'Project ownership has been reviewed by RMT.' : 'This listing is curated from public project pages and is waiting for its builder to claim it.'}</p></div>
          <div className="detail-claim-row"><div><strong>{selected.claimed ? 'Keep your project up to date.' : 'Is this your project?'}</strong><p>{selected.claimed ? 'Manage your listing in Builder Studio.' : 'Claim it for free and help people find everything you build.'}</p></div><button className="button button-outline" onClick={() => selected.claimed ? go('studio') : startClaim(selected)}>{selected.claimed ? 'Builder Studio' : 'Claim this project'} <ChevronRight size={15} /></button></div>
        </div>
        {toastNode}
      </div>}
    </dialog>
    <dialog ref={installRef} className="install-dialog" onCancel={() => setInstallOpen(false)} onClick={event => { if (event.target === event.currentTarget) setInstallOpen(false); }}><button className="dialog-close" onClick={() => setInstallOpen(false)} aria-label="Close install instructions"><X size={20} /></button><div className="install-app-icon">RMT<span>.</span></div><h2>One tap from home.</h2><p>Add RMT to your phone’s home screen for quick access to your library.</p><div className="install-step"><span>1</span><div><strong>On iPhone</strong><p>Open RMT in Safari. Tap Share, then “Add to Home Screen.”</p></div></div><div className="install-step"><span>2</span><div><strong>On Android</strong><p>Open RMT in Chrome. Open the browser menu and choose “Install app” or “Add to Home screen.”</p></div></div><p className="small-note">Sign in to keep your library across devices. Guest favorites stay in this browser. Games and tools open on their creators’ websites.</p><button className="button button-lime" onClick={() => setInstallOpen(false)}>Got it <Check size={16} /></button></dialog>
    <ManualCopyDialog value={copyFallback} onClose={() => setCopyFallback(null)} />
    {!selected && toastNode}
  </div>;
}
