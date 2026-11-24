'use client';

import { useEffect, useRef, useState } from 'react';
import {
  ArrowDownToLine, ArrowRight, ArrowUpRight, Bookmark, Check, ChevronRight,
  Compass, Gamepad2, Grid2X2, LayoutGrid, Library, ListFilter, Menu,
  Music2, Plus, Search, ShieldCheck, Sparkles, Terminal, Wrench, X,
} from 'lucide-react';
import { seedProjects, projectMatchesCategory, type Project } from '@/lib/catalog';
import Studio from './Studio';
import ReviewQueue from './ReviewQueue';

type Section = 'discover' | 'library' | 'games' | 'music' | 'tools' | 'studio' | 'review';
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
  return <div className={'project-art art-' + project.slug + ' ' + className} style={{ '--accent': project.accent } as React.CSSProperties}>
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
  const [saved, setSaved] = useState<string[]>([]);
  const [selected, setSelected] = useState<Project | null>(null);
  const [session, setSession] = useState<Session>(emptySession);
  const [toast, setToast] = useState('');
  const [mobileMenu, setMobileMenu] = useState(false);
  const [installOpen, setInstallOpen] = useState(false);
  const [catalogError, setCatalogError] = useState(false);
  const [storageAvailable, setStorageAvailable] = useState(true);
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const installRef = useRef<HTMLDialogElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function notify(message: string) {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 4200);
  }

  function go(next: Section) {
    setSection(next); setQuery(''); setCategory('All projects'); setMobileMenu(false);
    window.history.replaceState(null, '', '#' + next);
  }

  useEffect(() => {
    try {
      const value = JSON.parse(localStorage.getItem('rmt-library-v1') || '[]');
      if (Array.isArray(value)) setSaved(value.filter((item: unknown) => typeof item === 'string'));
    } catch { setStorageAvailable(false); }
    const fromHash = () => {
      const hash = window.location.hash.slice(1);
      if (['discover', 'library', 'games', 'music', 'tools', 'studio', 'review'].includes(hash)) setSection(hash as Section);
    };
    fromHash();
    window.addEventListener('hashchange', fromHash);
    fetch('/api/session', { cache: 'no-store' }).then(res => res.ok ? res.json() : null).then(data => {
      const value = data as Session | null;
      if (value && typeof value.authenticated === 'boolean' && typeof value.isAdmin === 'boolean') setSession(value);
    }).catch(() => {});
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
    window.addEventListener('keydown', onShortcut);
    window.addEventListener('beforeinstallprompt', onInstall);
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
    return () => {
      window.removeEventListener('hashchange', fromHash);
      window.removeEventListener('keydown', onShortcut);
      window.removeEventListener('beforeinstallprompt', onInstall);
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  useEffect(() => {
    if (selected) dialogRef.current?.showModal();
    else dialogRef.current?.close();
  }, [selected]);
  useEffect(() => {
    if (installOpen) installRef.current?.showModal();
    else installRef.current?.close();
  }, [installOpen]);

  function toggleSave(project: Project) {
    const removing = saved.includes(project.id);
    const next = removing ? saved.filter(id => id !== project.id) : [...saved, project.id];
    setSaved(next);
    try {
      localStorage.setItem('rmt-library-v1', JSON.stringify(next));
      notify(removing ? project.name + ' removed from your library.' : project.name + ' added to your library.');
    } catch {
      setStorageAvailable(false); notify('Saved for this visit. This browser isn’t allowing local storage.');
    }
  }

  async function install() {
    if (!installPrompt) { setInstallOpen(true); return; }
    await installPrompt.prompt();
    const result = await installPrompt.userChoice;
    if (result.outcome === 'accepted') notify('RMT is being added to your home screen.');
    setInstallPrompt(null);
  }

  const activeCategory = section === 'games' ? 'Games' : section === 'music' ? 'Music' : section === 'tools' ? 'Tools' : category;
  const filtered = projects.filter(project =>
    (section !== 'library' || saved.includes(project.id)) &&
    projectMatchesCategory(project, activeCategory) &&
    [project.name, project.tagline, project.description, ...project.links.map(link => link.label)].join(' ').toLowerCase().includes(query.toLowerCase())
  );
  const isDirectory = !['studio', 'review'].includes(section);
  const feature = projects.find(project => project.id === 'vamps') || projects[0];
  const savedProjects = saved.map(id => projects.find(project => project.id === id)).filter(Boolean) as Project[];
  const titles: Record<string, { eyebrow: string; title: string; description: string }> = {
    discover: { eyebrow: 'LESS SEARCHING. MORE EXPLORING.', title: 'Your ecosystem. All together.', description: 'Discover what communities are building. Keep your favorites one tap away.' },
    library: { eyebrow: 'MAKE YOURSELF AT HOME', title: 'Your corner of the ecosystem.', description: 'Your projects, games, and tools. Ready when you are.' },
    games: { eyebrow: 'FIND YOUR NEXT SESSION', title: 'Press play. Meet a new world.', description: 'Games from independent communities, launched from one place.' },
    music: { eyebrow: 'A SPACE FOR CREATORS', title: 'Something worth listening to.', description: 'A home for music experiences from independent creators.' },
    tools: { eyebrow: 'BUILT FOR THE CURIOUS', title: 'Find your next favorite tool.', description: 'Creative software and useful apps from ecosystem builders.' },
  };
  const heading = titles[section] || titles.discover;

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
          {id === 'library' && saved.length > 0 && <span className="nav-count">{saved.length}</span>}
        </button>)}
      </nav>
      <div className="nav-divider" />
      <div className="nav-caption">FOR BUILDERS</div>
      <button className={'nav-item ' + (section === 'studio' ? 'nav-active' : '')} onClick={() => go('studio')}><Terminal size={19} /><span>Builder Studio</span><ArrowUpRight size={14} /></button>
      {session.isAdmin && <button className={'nav-item ' + (section === 'review' ? 'nav-active' : '')} onClick={() => go('review')}><ShieldCheck size={19} /><span>Review queue</span></button>}
      <div className="sidebar-bottom">
        <div className="ecosystem-card"><span className="ecosystem-orbit">r</span><div><span>EXPLORING</span><strong>Robinhood ecosystem</strong></div><span className="status-dot" /></div>
        <button className="install-nav" onClick={install}><ArrowDownToLine size={17} /> Add RMT to your phone</button>
        <div className="sidebar-foot"><span>Independent. Community built.</span><span>v0.1</span></div>
      </div>
    </aside>
    {mobileMenu && <button className="sidebar-scrim" aria-label="Close menu" onClick={() => setMobileMenu(false)} />}
    <div className="workspace">
      <header className="topbar">
        <div className="mobile-brand"><button className="icon-button" onClick={() => setMobileMenu(!mobileMenu)} aria-label="Open navigation"><Menu size={21} /></button><button onClick={() => go('discover')}>RMT<span>.</span></button></div>
        <label className="search-box"><Search size={18} /><span className="sr-only">Search projects and experiences</span><input ref={searchRef} value={query} onChange={event => { setQuery(event.target.value); if (!isDirectory) setSection('discover'); }} placeholder="Search projects, games, and tools..." /><kbd>/</kbd>{query && <button className="search-clear" aria-label="Clear search" onClick={() => setQuery('')}><X size={15} /></button>}</label>
        <div className="topbar-actions"><span className="early-access"><span />Early access</span><button className="button button-small button-outline" onClick={() => go('studio')}><Plus size={16} /> Submit a project</button></div>
      </header>
      <main id="main-content" tabIndex={-1} className="main-content">
        {isDirectory ? <>
          <div className="page-heading"><div><div className="eyebrow">{heading.eyebrow}</div><h1>{heading.title}</h1><p>{heading.description}</p></div><span className="network-label"><span className="network-symbol">↗</span> ROBINHOOD CHAIN</span></div>
          {section === 'discover' && !query && category === 'All projects' && feature && <section className="feature-layout" aria-label="Featured project">
            <div className="hero-card">
              <Cover project={feature} className="hero-art" />
              <div className="hero-shade" />
              <div className="hero-content"><span className="feature-tag"><Sparkles size={13} /> FROM THE DIRECTORY</span><div className="hero-brand">VAMPS<span>AFTER HOURS</span></div><h2>Enter the<br />after hours.</h2><p>Games. Creative tools. A whole community to discover.</p><div className="hero-buttons"><button className="button button-lime" onClick={() => setSelected(feature)}>Explore VAMPS <ArrowUpRight size={17} /></button><button className={'button hero-save ' + (saved.includes(feature.id) ? 'is-saved' : '')} onClick={() => toggleSave(feature)} aria-label={saved.includes(feature.id) ? 'Remove VAMPS from library' : 'Save VAMPS to library'}>{saved.includes(feature.id) ? <Check size={19} /> : <Plus size={19} />}</button></div></div>
              <div className="hero-bottom"><span><span className="tiny-square" /> Games & creative tools</span><span>CURATED PICK · NOT SPONSORED</span></div>
            </div>
            <div className="feature-side">
              <div className="quick-library"><div className="card-overline"><span>YOUR QUICK LAUNCH</span><Library size={16} /></div><h3>Goodbye, lost links.</h3><p>Save the projects you come back to. We’ll keep them together.</p><div className="quick-icons">{savedProjects.length > 0 ? savedProjects.slice(0, 3).map(project => <button key={project.id} className="quick-icon" onClick={() => setSelected(project)} title={project.name}><Cover project={project} /></button>) : <><span className="empty-quick"><Gamepad2 size={24} /></span><span className="empty-quick"><Music2 size={24} /></span><span className="empty-quick"><Wrench size={24} /></span></>}<button className="quick-add" onClick={() => go('library')} aria-label="Open your library"><Plus size={22} /></button></div><button className="text-link" onClick={() => go('library')}>Open my library <ArrowRight size={15} /></button></div>
              <button className="builder-teaser" onClick={() => go('studio')}><div><span className="card-overline">BUILDING SOMETHING?</span><h3>There’s a place for you.</h3><p>Bring your project to RMT. Listing is free.</p></div><span className="teaser-arrow"><ArrowUpRight size={22} /></span></button>
            </div>
          </section>}
          <section className="directory-section" aria-labelledby="directory-heading">
            <div className="section-heading"><div><h2 id="directory-heading">{section === 'library' ? 'Saved by you' : query ? 'Search results' : section === 'discover' ? 'Explore the ecosystem' : section === 'games' ? 'Find your next game' : section === 'music' ? 'Music experiences' : 'Tools & creative apps'}<span className="count-pill">{filtered.length}</span></h2><p>{section === 'library' ? (storageAvailable ? 'Your library is saved on this device.' : 'Your library is available for this visit only.') : 'Real projects. Official destinations. A little less searching.'}</p></div><span className="view-indicator"><Grid2X2 size={16} /> Project view</span></div>
            {['discover', 'library'].includes(section) && <div className="filter-row"><div className="category-tabs" aria-label="Filter by category">{categories.map(item => <button key={item} className={category === item ? 'tab-active' : ''} onClick={() => setCategory(item)} aria-pressed={category === item}>{item === 'Games' && <Gamepad2 size={15} />}{item === 'Music' && <Music2 size={15} />}{item === 'Tools' && <Wrench size={15} />}{item}</button>)}</div><span className="directory-count"><ListFilter size={15} /> {section === 'library' ? 'Your picks' : 'A–Z below'}</span></div>}
            {catalogError && <p className="inline-notice" role="status">Community submissions are temporarily unavailable. You can still explore the curated directory.</p>}
            {filtered.length ? <div className="project-grid">{[...filtered].sort((a, b) => a.name.localeCompare(b.name)).map(project => <article className="project-card" key={project.id}>
              <button className="project-image-button" onClick={() => setSelected(project)} aria-label={'Explore ' + project.name}><Cover project={project} /><span className="card-category">{project.category}</span><span className="card-open"><ArrowUpRight size={19} /></span></button>
              <div className="project-card-body"><div className="project-card-heading"><button className="project-name-button" onClick={() => setSelected(project)}><h3>{project.name}</h3></button><button className={'save-button ' + (saved.includes(project.id) ? 'saved' : '')} aria-label={(saved.includes(project.id) ? 'Remove ' : 'Save ') + project.name + (saved.includes(project.id) ? ' from library' : ' to library')} aria-pressed={saved.includes(project.id)} onClick={() => toggleSave(project)}>{saved.includes(project.id) ? <Bookmark size={18} fill="currentColor" /> : <Bookmark size={18} />}</button></div><p>{project.tagline}</p><div className="project-card-footer"><span>{project.links.length} destinations</span><button onClick={() => setSelected(project)}>Explore <ArrowUpRight size={14} /></button></div></div>
            </article>)}</div> : <div className="empty-state"><div className="empty-state-icon">{section === 'library' ? <Library size={29} /> : section === 'music' ? <Music2 size={29} /> : <Search size={29} />}</div><h3>{query ? 'No projects found.' : section === 'library' ? 'Your next favorite belongs here.' : 'The first spot could be yours.'}</h3><p>{query ? 'Try a project name, a game, or another category.' : section === 'library' ? 'Tap the bookmark on any project to save it. Your favorites will be ready here next time.' : 'We’re opening this part of the directory to builders. Have an experience people should discover?'}</p><button className="button button-lime" onClick={() => query ? setQuery('') : go(section === 'library' ? 'discover' : 'studio')}>{query ? 'Clear search' : section === 'library' ? 'Find a project' : 'Submit your project'}<ArrowRight size={16} /></button></div>}
          </section>
          {section === 'discover' && <section className="community-banner"><div className="community-banner-icon"><LayoutGrid size={26} /></div><div><h3>Your community built it. Let people find it.</h3><p>Games, creative tools, and projects deserve more than a buried link.</p></div><button className="button button-outline" onClick={() => go('studio')}>Join the directory <ArrowUpRight size={16} /></button></section>}
          <footer className="content-footer"><span>RMT is an independent directory. Listings don’t imply a partnership.</span><button onClick={() => go('studio')}>Built something? Let’s see it. <ArrowUpRight size={12} /></button></footer>
        </> : section === 'studio' ? <Studio session={session} onToast={notify} /> : <ReviewQueue session={session} onToast={notify} />}
      </main>
    </div>
    <nav className="mobile-bottom" aria-label="Mobile navigation">
      {[navItems[0], navItems[1], navItems[2], { id: 'studio' as Section, label: 'Build', icon: Terminal }].map(({ id, label, icon: Icon }) => <button key={id} className={section === id ? 'active' : ''} onClick={() => go(id)}><Icon size={20} /><span>{label}</span></button>)}
    </nav>
    <dialog ref={dialogRef} className="project-dialog" onCancel={() => setSelected(null)} onClick={event => { if (event.target === event.currentTarget) setSelected(null); }}>
      {selected && <div className="detail-inner"><div className="detail-cover"><Cover project={selected} /><div className="detail-cover-shade" /><button className="dialog-close" onClick={() => setSelected(null)} aria-label="Close project"><X size={20} /></button><span className="detail-category">{selected.category}</span></div><div className="detail-body"><div className="detail-heading"><div><span className="detail-listing">{selected.claimed ? 'BUILDER CLAIMED' : 'CURATED LISTING · UNCLAIMED'}</span><h2>{selected.name}</h2><p>{selected.tagline}</p></div><button className={'button button-outline detail-save ' + (saved.includes(selected.id) ? 'is-saved' : '')} onClick={() => toggleSave(selected)}>{saved.includes(selected.id) ? <Check size={16} /> : <Plus size={16} />}{saved.includes(selected.id) ? 'In your library' : 'Add to library'}</button></div><p className="detail-description">{selected.description}</p><div className="detail-section-label">PICK YOUR DESTINATION <span>{selected.links.length}</span></div><div className="destination-list">{selected.links.map(link => <a key={link.url} href={link.url} target="_blank" rel="noopener noreferrer" className="destination"><span className="destination-symbol">{/game/i.test(link.type || '') ? <Gamepad2 size={20} /> : /tool|software/i.test(link.type || '') ? <Wrench size={20} /> : <Compass size={20} />}</span><span><strong>{link.label}</strong><small>{domain(link.url)} <span>· {link.type}</span></small></span><ArrowUpRight size={18} /></a>)}</div><div className="detail-note"><ArrowUpRight size={15} /><p>Opens on the project’s own website. RMT doesn’t run these apps or request wallet access. {selected.claimed ? 'Project ownership has been reviewed.' : 'This public listing has not been claimed by its builder.'}</p></div><button className="claim-link" onClick={() => { setSelected(null); go('studio'); }}>Building something? Visit Builder Studio <ChevronRight size={15} /></button></div></div>}
    </dialog>
    <dialog ref={installRef} className="install-dialog" onCancel={() => setInstallOpen(false)} onClick={event => { if (event.target === event.currentTarget) setInstallOpen(false); }}><button className="dialog-close" onClick={() => setInstallOpen(false)} aria-label="Close install instructions"><X size={20} /></button><div className="install-app-icon">RMT<span>.</span></div><h2>One tap from home.</h2><p>Add RMT to your phone’s home screen for quick access to your library.</p><div className="install-step"><span>1</span><div><strong>On iPhone</strong><p>Open RMT in Safari. Tap Share, then “Add to Home Screen.”</p></div></div><div className="install-step"><span>2</span><div><strong>On Android</strong><p>Open RMT in Chrome. Open the browser menu and choose “Install app” or “Add to Home screen.”</p></div></div><p className="small-note">Your library stays on this device. Games and tools open on their creators’ websites.</p><button className="button button-lime" onClick={() => setInstallOpen(false)}>Got it <Check size={16} /></button></dialog>
    {toast && <div className="toast" role="status"><span className="toast-check"><Check size={16} /></span>{toast}<button onClick={() => setToast('')} aria-label="Dismiss notification"><X size={15} /></button></div>}
  </div>;
}
