'use client';

import { useEffect, useRef, useState } from 'react';
import {
  ArrowDownToLine, ArrowLeft, ArrowRight, ArrowUpRight, Bookmark, Check, ChevronRight,
  Compass, Gamepad2, Grid2X2, LayoutGrid, Library, ListFilter, Menu,
  Music2, Plus, Search, ShieldCheck, Sparkles, Terminal, Wrench, X, Copy, Share2, Layers3,
  UserRound, Cloud, LoaderCircle, RefreshCw, AlertCircle, List, ChevronLeft, ChevronDown, Megaphone, Radio,
} from 'lucide-react';
import { seedProjects, type Project } from '@/lib/catalog';
import { normalizeProjectQuery, searchProjects } from '@/lib/project-search';
import { discoverProjects, recentProjects, type DirectorySort } from '@/lib/project-discovery';
import { projectPath, projectShareUrl, projectSocialImagePath, projectXIntentUrl } from '@/lib/project-sharing';
import Studio from './Studio';
import { FirebaseSessionBridge } from './FirebaseAccount';
import ReviewQueue from './ReviewQueue';
import ClaimProject from './ClaimProject';
import Account, { LibrarySyncStatus, signInHref } from './Account';
import { useProjectLibrary, type SessionStatus } from './use-project-library';
import { LinkOptions, ManualCopyDialog } from './LinkOptions';
import ProjectUpdates from './ProjectUpdates';
import ActivityFeed from './ActivityFeed';
import ProfileEditor from './ProfileEditor';
import PublicProfilePage from './PublicProfilePage';
import ProjectBuilders from './ProjectBuilders';
import {PROFILE_HANDLE_PATTERN, type PublicProfile} from '@/lib/profiles';
import { stageLabel } from './studio-shared';
import './discovery.css';
import './navigation.css';

type Section = 'discover' | 'activity' | 'library' | 'games' | 'music' | 'tools' | 'studio' | 'review' | 'claim' | 'account' | 'profile' | 'member';
type Session = { authenticated: boolean; emailVerified?: boolean; provider?: string | null; userId: string | null; displayName: string | null; isAdmin: boolean };
const emptySession: Session = { authenticated: false, userId: null, displayName: null, isAdmin: false };
const categories = ['All projects', 'Games', 'Music', 'Tools', 'Community'];
const sectionTitles: Record<Section, string> = {
  discover: 'RMT — Your ecosystem. All together.',
  library: 'My library | RMT', games: 'Games | RMT', music: 'Music | RMT', tools: 'Tools | RMT',
  studio: 'Builder Studio | RMT', review: 'Review queue | RMT', claim: 'Claim a project | RMT', account: 'My account | RMT',
  activity: 'Activity | RMT', profile: 'My profile | RMT', member: 'Member profile | RMT',
};
const navItems = [
  { id: 'discover' as Section, label: 'Discover', icon: Compass },
  { id: 'activity' as Section, label: 'Activity', icon: Radio },
  { id: 'library' as Section, label: 'My library', icon: Library },
  { id: 'games' as Section, label: 'Games', icon: Gamepad2 },
  { id: 'music' as Section, label: 'Music', icon: Music2 },
  { id: 'tools' as Section, label: 'Tools', icon: Wrench },
];

function domain(url: string) { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; } }

function Cover({ project, className = '', thumbnail = false }: { project: Project; className?: string; thumbnail?: boolean }) {
  const [failed, setFailed] = useState(false);
  const logo = thumbnail ? project.artwork?.logo?.url || project.logo : undefined;
  const source = logo || project.cover;
  useEffect(() => { setFailed(false); }, [source]);
  // Uploaded artwork has its own composition; curated styling belongs only to the original asset.
  const approvedCover = source.startsWith('/media/project-artwork/');
  const coverBackground = approvedCover ? undefined : project.coverBackground;
  const panoramic = !logo && (project.coverAspectRatio ?? 0) > 2.2;
  const complete = !!logo || project.coverFit === 'contain' || panoramic;
  return <div className={'project-art art-' + (approvedCover ? 'owner-upload' : logo ? 'thumbnail' : project.slug) + (complete ? ' art-contained' : '') + (panoramic ? ' art-panoramic' : '') + (coverBackground ? ' art-branded' : '') + ' ' + className} style={{ '--accent': project.accent, '--art-background': coverBackground } as React.CSSProperties}>
    {source.startsWith('/') && !failed
      ? <><span className="art-ambient" aria-hidden="true" /><img className="art-foreground" src={source} alt={project.name + ' project artwork'} onError={() => setFailed(true)} loading="lazy" decoding="async" /></>
      : <span className="art-monogram">{project.initials}</span>}
  </div>;
}

function ProjectLogo({project}: {project: Project}) {
  const [failed, setFailed] = useState(false);
  const source = project.artwork?.logo?.url || project.logo;
  useEffect(() => { setFailed(false); }, [source]);
  if (!source || failed) return null;
  return <img className="approved-project-logo" src={source} alt="" width="58" height="58" loading="lazy" decoding="async" onError={() => setFailed(true)} />;
}

export default function Hub({ initialProjectId, initialProjects = seedProjects, initialProfileHandle, initialPublicProfile }: { initialProjectId?: string; initialProjects?: Project[]; initialProfileHandle?: string; initialPublicProfile?: PublicProfile } = {}) {
  const [section, setSection] = useState<Section>(initialProfileHandle ? 'member' : 'discover');
  const [memberHandle, setMemberHandle] = useState(initialProfileHandle ?? '');
  const [profileSeed, setProfileSeed] = useState(initialPublicProfile);
  const [category, setCategory] = useState('All projects');
  const [query, setQuery] = useState('');
  const [directoryView, setDirectoryView] = useState<'grid' | 'list'>('grid');
  const [directorySort, setDirectorySort] = useState<DirectorySort>('name');
  const [directoryPaging, setDirectoryPaging] = useState({ key: '', page: 1 });
  const [projects, setProjects] = useState<Project[]>(initialProjects);
  const [selected, setSelected] = useState<Project | null>(() => initialProjects.find(project => project.id === initialProjectId) ?? null);
  const [showcaseChoice, setShowcaseChoice] = useState<{projectId: string; tab: 'overview' | 'updates'}>({projectId: '', tab: 'overview'});
  const showcaseTab = showcaseChoice.projectId === selected?.id ? showcaseChoice.tab : 'overview';
  const [claimProject, setClaimProject] = useState<Project | null>(null);
  const [session, setSession] = useState<Session>(emptySession);
  const [sessionStatus, setSessionStatus] = useState<SessionStatus>('loading');
  const [toast, setToast] = useState('');
  const [mobileMenu, setMobileMenu] = useState(false);
  const [installOpen, setInstallOpen] = useState(false);
  const [catalogError, setCatalogError] = useState(false);
  const [catalogLoaded, setCatalogLoaded] = useState(false);
  const [copyFallback, setCopyFallback] = useState<string | null>(null);
  const [framedOrigin, setFramedOrigin] = useState('');
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const directoryRef = useRef<HTMLElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const installRef = useRef<HTMLDialogElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionRequest = useRef<AbortController | null>(null);
  const copyRequest = useRef(0);
  const library = useProjectLibrary(session, sessionStatus, () => { notify('Your account changed. Reconnecting your library.'); void refreshSession(); });
  const saved = library.saved;

  // Use the request-fresh SSR profile once. Returning through browser history
  // must fetch again instead of resurrecting a profile its owner has hidden.
  useEffect(() => {setProfileSeed(undefined);}, []);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem('rmt-directory-view');
      if (stored === 'grid' || stored === 'list') setDirectoryView(stored);
    } catch { /* Browsing still works when storage is unavailable. */ }
  }, []);

  function changeDirectoryView(view: 'grid' | 'list') {
    setDirectoryView(view);
    try { window.localStorage.setItem('rmt-directory-view', view); } catch { /* This visit only. */ }
    requestAnimationFrame(() => directoryRef.current?.scrollIntoView({ behavior: 'instant', block: 'start' }));
  }

  function focusDirectory() {
    requestAnimationFrame(() => {
      const heading = directoryRef.current?.querySelector<HTMLElement>('#directory-heading');
      heading?.focus({ preventScroll: true });
      directoryRef.current?.scrollIntoView({ behavior: 'instant', block: 'start' });
    });
  }

  function browseNewest() {
    setQuery(''); setCategory('All projects'); setDirectorySort('recent');
    focusDirectory();
  }

  function notify(message: string) {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 4200);
  }

  function go(next: Section) {
    setSection(next); setMemberHandle(''); setQuery(''); setCategory('All projects'); setDirectoryPaging({ key: '', page: 1 }); setMobileMenu(false); setSelected(null); setClaimProject(null);
    window.history.pushState(null, '', '/#' + next);
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
    }).catch(() => setCatalogError(true)).finally(() => setCatalogLoaded(true));
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
      const unavailable = () => {
        setSelected(null); setClaimProject(null); setSection('discover');
        window.history.replaceState(null, '', '/#discover');
        notify('This project is unavailable right now. Explore the directory or try its link again.');
      };
      const hash = window.location.hash.slice(1);
      const pathMatch = window.location.pathname.match(/^\/projects\/([^/]+)\/?$/);
      const profilePath = window.location.pathname.match(/^\/u\/([^/]+)\/?$/);
      if (profilePath) {
        let handle: string;
        try {handle = decodeURIComponent(profilePath[1]).toLowerCase();} catch {handle = '';}
        if (PROFILE_HANDLE_PATTERN.test(handle)) {
          setMemberHandle(handle); setSection('member'); setSelected(null); setClaimProject(null);
          return;
        }
      }
      const match = hash.match(/^(project|claim)\/(.+)$/);
      const legacyClaim = new URLSearchParams(window.location.search).get('claim');
      if (pathMatch || match || (hash === 'claim' && legacyClaim)) {
        let id: string;
        try { id = decodeURIComponent(pathMatch?.[1] ?? match?.[2] ?? legacyClaim ?? ''); } catch { unavailable(); return; }
        const project = projects.find(item => item.id === id || item.slug === id);
        if (project) {
          if (pathMatch || match?.[1] === 'project') {
            setSection('discover'); setSelected(project); setClaimProject(null);
            setShowcaseChoice({projectId: project.id, tab: pathMatch && hash === 'updates' ? 'updates' : 'overview'});
            if (!pathMatch) window.history.replaceState(null, '', projectPath(project));
          }
          else { setSection('claim'); setClaimProject(project); setSelected(null); }
        } else {
          // Never retain a project that is absent from the refreshed public catalog.
          setSelected(null); setClaimProject(null);
          // A legacy link can point to an approved community listing not in the
          // seed catalog. Resolve it after the first catalog request completes.
          if (catalogLoaded) unavailable();
        }
        return;
      }
      if (['discover', 'activity', 'library', 'games', 'music', 'tools', 'studio', 'review', 'account', 'profile'].includes(hash)) {
        setSection(hash as Section); setSelected(null); setClaimProject(null);
      } else if (!hash) {
        setSection('discover'); setSelected(null); setClaimProject(null);
      }
    };
    route(); window.addEventListener('hashchange', route); window.addEventListener('popstate', route);
    return () => { window.removeEventListener('hashchange', route); window.removeEventListener('popstate', route); };
  }, [projects, catalogLoaded]);

  useEffect(() => {
    // The server emits canonical metadata for direct requests. Keep the browser
    // tab title in step with in-app history navigation as well.
    document.title = selected ? `${selected.name} | RMT`
      : claimProject ? `Claim ${claimProject.name} | RMT`
      : normalizeProjectQuery(query) && !['studio', 'review', 'claim', 'account', 'activity', 'profile', 'member'].includes(section) ? 'Search results | RMT'
      : sectionTitles[section];
  }, [selected, claimProject, section, query]);

  function openProject(project: Project) {
    setSelected(project); setClaimProject(null);
    setShowcaseChoice({projectId: project.id, tab: 'overview'});
    window.history.pushState(null, '', projectPath(project));
  }

  function openActivityProject(projectId: string, updates: boolean) {
    const project = projects.find(item => item.id === projectId);
    if (!project) return false;
    setSelected(project); setClaimProject(null);
    setShowcaseChoice({projectId, tab: updates ? 'updates' : 'overview'});
    window.history.pushState(null, '', projectPath(project) + (updates ? '#updates' : ''));
    return true;
  }

  function chooseShowcaseTab(tab: 'overview' | 'updates') {
    if (!selected) return;
    setShowcaseChoice({projectId: selected.id, tab});
    window.history.replaceState(null, '', projectPath(selected) + (tab === 'updates' ? '#updates' : ''));
  }

  function openProjectManagement() {
    go('studio');
    window.history.replaceState(null, '', '/?studio=projects#studio');
  }

  function closeProject() {
    setSelected(null);
    window.history.replaceState(null, '', section === 'member' && memberHandle ? '/u/' + encodeURIComponent(memberHandle) : '/#' + (section === 'claim' ? 'discover' : section));
  }

  function startClaim(project: Project) {
    setSelected(null); setClaimProject(project); setSection('claim'); setMobileMenu(false);
    window.history.pushState(null, '', '/#claim/' + encodeURIComponent(project.id));
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

  async function shareProject(project: Project) {
    const url = projectShareUrl(project);
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: project.name + ' on RMT', text: project.tagline, url });
        return;
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return;
      }
    }
    await copyLink(url, 'Project link copied. Ready to share.');
  }

  function destinationCount(project: Project) {
    return new Set([...project.links.map(link => link.url), ...(project.collections ?? []).map(item => item.url)]).size;
  }

  useEffect(() => {
    if (selected) {
      if (!dialogRef.current?.open) dialogRef.current?.showModal();
      dialogRef.current?.scrollTo({ top: 0 });
      dialogRef.current?.querySelector<HTMLElement>('#project-title')?.focus({ preventScroll: true });
      document.body.classList.add('project-is-open');
    } else {
      dialogRef.current?.close();
      document.body.classList.remove('project-is-open');
    }
    return () => document.body.classList.remove('project-is-open');
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
  const directoryKey = [section, activeCategory, normalizeProjectQuery(query), directorySort].join('|');
  useEffect(() => { setDirectoryPaging({ key: directoryKey, page: 1 }); }, [directoryKey]);
  const page = discoverProjects(projects, { query, category: activeCategory, savedIds: section === 'library' ? saved : undefined, sort: directorySort, page: directoryPaging.key === directoryKey ? directoryPaging.page : 1 });
  const latest = recentProjects(projects);
  const isSearchScoped = section === 'library' || activeCategory !== 'All projects';
  const searchScope = section === 'library' ? (activeCategory === 'All projects' ? 'your library' : activeCategory.toLowerCase() + ' in your library') : activeCategory.toLowerCase();
  const matchesOutsideScope = hasSearch && isSearchScoped ? searchProjects(projects, { query }).length - page.total : 0;
  const isDirectory = !['studio', 'review', 'claim', 'account', 'activity', 'profile', 'member'].includes(section);
  const feature = projects.find(project => project.id === 'vamps') || projects[0];
  const savedProjects = saved.map(id => projects.find(project => project.id === id)).filter(Boolean) as Project[];
  const unavailableSaved = saved.filter(id => !projects.some(project => project.id === id));
  const returnTo = selected ? projectPath(selected) + (showcaseTab === 'updates' ? '#updates' : '') : section === 'member' && memberHandle ? '/u/' + encodeURIComponent(memberHandle) : '/#' + (claimProject ? 'claim/' + encodeURIComponent(claimProject.id) : section);
  const selectedExperiences = selected?.links.filter(link => /game|creative|software|tool|wallet|app directory|music|audio/i.test(link.type ?? '')) ?? [];
  const selectedCommunity = selected?.links.filter(link => !selectedExperiences.includes(link)) ?? [];
  const relatedProjects = selected ? projects.filter(project => project.id !== selected.id).sort((a, b) => Number(b.category === selected.category) - Number(a.category === selected.category) || a.name.localeCompare(b.name)).slice(0, 3) : [];
  const titles: Record<string, { eyebrow: string; title: string; description: string }> = {
    discover: { eyebrow: 'LESS SEARCHING. MORE EXPLORING.', title: 'Your ecosystem. All together.', description: 'Discover what communities are building. Keep your favorites one tap away.' },
    library: { eyebrow: 'MAKE YOURSELF AT HOME', title: 'Your corner of the ecosystem.', description: 'Your projects, games, and tools. Ready when you are.' },
    games: { eyebrow: 'FIND YOUR NEXT SESSION', title: 'Press play. Meet a new world.', description: 'Games from independent communities, launched from one place.' },
    music: { eyebrow: 'A SPACE FOR CREATORS', title: 'Something worth listening to.', description: 'A home for music experiences from independent creators.' },
    tools: { eyebrow: 'BUILT FOR THE CURIOUS', title: 'Find your next favorite tool.', description: 'Creative software and useful apps from ecosystem builders.' },
  };
  const heading = titles[section] || titles.discover;
  const toastNode = toast ? (<div className="toast" role="status"><span className="toast-check"><Check size={16} /></span>{toast}<button onClick={() => setToast('')} aria-label="Dismiss notification"><X size={15} /></button></div>) : null;
  const pageNumbers = Array.from({length: page.pageCount}, (_, index) => index + 1).filter(number => number === 1 || number === page.pageCount || Math.abs(number - page.page) <= 1);
  function changePage(next: number) {
    setDirectoryPaging({ key: directoryKey, page: next });
    focusDirectory();
  }

  return <div className="hub">
    <a className="skip-link" href="#main-content">Skip to content</a>
    <aside className={'sidebar ' + (mobileMenu ? 'sidebar-open' : '')} aria-label="Main navigation">
      <button className="brand" onClick={() => go('discover')} aria-label="RMT home">
        <img className="brand-icon" src="/icons/rmt-mark-v5.png" alt="" width="37" height="37" />
        <span className="brand-word">RMT<span className="brand-dot">.</span></span>
        <span className="beta-tag">BETA</span>
      </button>
      <div className="nav-caption">YOUR SPACE</div>
      <nav>
        {navItems.map(({ id, label, icon: Icon }) => <button key={id} className={'nav-item ' + (section === id ? 'nav-active' : '')} onClick={() => go(id)} aria-current={section === id ? 'page' : undefined}>
          <Icon size={19} strokeWidth={1.8} /><span>{label}</span>
          {id === 'library' && savedProjects.length > 0 && <span className="nav-count">{savedProjects.length}</span>}
        </button>)}
        <button className={'nav-item ' + (section === 'account' || section === 'profile' ? 'nav-active' : '')} onClick={() => go('account')} aria-current={section === 'account' || section === 'profile' ? 'page' : undefined}><UserRound size={19} strokeWidth={1.8} /><span>My account</span></button>
      </nav>
      <div className="nav-divider" />
      <div className="nav-caption">FOR BUILDERS</div>
      <button className={'nav-item ' + (section === 'studio' ? 'nav-active' : '')} onClick={() => go('studio')}><Terminal size={19} /><span>Builder Studio</span><ArrowUpRight size={14} /></button>
      {sessionStatus === 'ready' && session.isAdmin && <button className={'nav-item ' + (section === 'review' ? 'nav-active' : '')} onClick={() => go('review')}><ShieldCheck size={19} /><span>Review queue</span></button>}
      <div className="sidebar-bottom">
        <div className="ecosystem-card"><span className="ecosystem-orbit">r</span><div><span>EXPLORING</span><strong>Robinhood ecosystem</strong></div><span className="status-dot" /></div>
        <button className="install-nav" onClick={install}><ArrowDownToLine size={17} /> Add RMT to your phone</button>
        <div className="sidebar-foot"><span>Independent. Community built.</span><span>v0.5</span></div>
      </div>
    </aside>
    {mobileMenu && <button className="sidebar-scrim" aria-label="Close menu" onClick={() => setMobileMenu(false)} />}
    <div className="workspace">
      <header className="topbar">
        <div className="mobile-brand"><button className="icon-button" onClick={() => setMobileMenu(!mobileMenu)} aria-label="Open navigation"><Menu size={21} /></button><button className="mobile-rmt-home" onClick={() => go('discover')} aria-label="RMT home"><img src="/icons/rmt-mark-v5.png" alt="" width="29" height="29" /><span className="mobile-rmt-word">RMT<span>.</span></span></button></div>
        <div className="search-box" role="search"><Search size={18} aria-hidden="true" /><label htmlFor="project-search" className="sr-only">Search projects and experiences</label><input id="project-search" type="search" ref={searchRef} value={query} autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false} enterKeyHint="search" onChange={event => { const value = event.target.value; if (!isDirectory) go('discover'); setQuery(value); }} placeholder="Search projects, games, tools…" /><kbd>/</kbd>{query && <button type="button" className="search-clear" aria-label="Clear search" onClick={() => { setQuery(''); searchRef.current?.focus(); }}><X size={15} /></button>}</div>
        <div className="topbar-actions"><button className="button button-small button-outline submit-project-topbar" onClick={() => go('studio')} aria-label="Submit a project"><Plus size={16} /><span className="submit-label">Submit a project</span></button>{sessionStatus === 'loading' ? <span className="topbar-account-loading" role="status" aria-label="Checking your account"><LoaderCircle className="rmt-spin" size={17} /></span> : session.authenticated || sessionStatus === 'error' ? <button className="topbar-account" onClick={() => go('account')} aria-label="Open your RMT account" title={session.displayName || 'My account'}><span className="topbar-account-avatar"><UserRound size={14} /></span><span>{session.displayName?.split(' ')[0] || 'Account'}</span></button> : <a className="topbar-signin" href={signInHref(returnTo)} target="_top"><UserRound size={15} /> Sign in</a>}</div>
      </header>
      <FirebaseSessionBridge onChange={() => void refreshSession()} /><main id="main-content" tabIndex={-1} className={'main-content' + (isDirectory ? ' discovery-main' : '') + (hasSearch ? ' search-mode' : '')}>
        {framedOrigin && <aside className={'embedded-view-notice' + (hasSearch ? ' embedded-view-compact' : '')} aria-label="Embedded preview navigation">
          <span className="embedded-view-icon" aria-hidden="true"><ArrowUpRight size={18} /></span>
          <div><strong>{hasSearch ? 'Preview' : 'A little more room to explore.'}</strong>{!hasSearch && <><p>Some previews block links. Open RMT directly, or copy a destination into your browser.</p><small>{domain(framedOrigin)}</small></>}</div>
          <div className="embedded-view-actions"><a href={framedOrigin + returnTo} target="_top" className="button button-outline">Open RMT <ArrowUpRight size={14} /></a><button type="button" onClick={() => void copyLink(framedOrigin + returnTo, 'RMT link copied.')} aria-label="Copy direct RMT link"><Copy size={13} /> {hasSearch ? 'Copy' : 'Copy link'}</button></div>
        </aside>}
        {isDirectory ? <>
          {!hasSearch && <div className="page-heading"><div><div className="eyebrow">{heading.eyebrow}</div><h1>{heading.title}</h1><p>{heading.description}</p></div><button className="directory-jump" onClick={focusDirectory}>Browse projects <span>{page.total}</span><ArrowRight size={15} /></button></div>}
          {section === 'discover' && !hasSearch && category === 'All projects' && feature && <section className="feature-layout discovery-feature" aria-label="Featured project and recent additions">
            <div className="hero-card">
              <Cover project={feature} className="hero-art" />
              <div className="hero-shade" />
              <div className="hero-content"><span className="feature-tag"><Sparkles size={13} /> FROM THE DIRECTORY</span><div className="hero-brand">VAMPS<span>AFTER HOURS</span></div><h2>Enter the<br />after hours.</h2><p>Games. Creative tools. A whole community to discover.</p><div className="hero-buttons"><button type="button" className="button button-lime hero-project-trigger" onClick={() => openProject(feature)} aria-haspopup="dialog">Explore VAMPS <ArrowUpRight size={17} /></button><button className={'button hero-save ' + (saved.includes(feature.id) ? 'is-saved' : '')} disabled={!library.canSave} onClick={() => void toggleSave(feature)} aria-label={saved.includes(feature.id) ? 'Remove VAMPS from library' : 'Save VAMPS to library'}>{saved.includes(feature.id) ? <Check size={19} /> : <Plus size={19} />}</button></div></div>
              <div className="hero-bottom"><span><span className="tiny-square" /> Games & creative tools</span><span>CURATED PICK · NOT SPONSORED</span></div>
            </div>
            <aside className="feature-side discovery-arrivals" aria-label="Recently added projects">
              <div className="arrivals-heading"><div><span className="card-overline">FRESH FINDS</span><h3>New to RMT<span className="new-dot" /></h3></div><Compass size={20} /></div>
              <div className="arrivals-list">{latest.map(project => <button type="button" className="arrival-card" key={project.id} onClick={() => openProject(project)} aria-label={'Explore ' + project.name} aria-haspopup="dialog"><span className="arrival-art"><Cover project={project} /></span><span className="arrival-copy"><strong>{project.name}</strong><small>{project.category}</small></span><ArrowUpRight size={16} /></button>)}</div>
              <button className="arrivals-more" onClick={browseNewest}>Browse newest additions <ArrowRight size={14} /></button>
            </aside>
          </section>}
          {section === 'discover' && !hasSearch && category === 'All projects' && <section className="quick-return" aria-label="Your saved projects"><span className="quick-return-label"><Bookmark size={16} />Your shortcuts</span><div className="quick-return-projects">{savedProjects.slice(0, 4).map(project => <button key={project.id} onClick={() => openProject(project)} aria-haspopup="dialog">{project.name}<ArrowUpRight size={12} /></button>)}{!savedProjects.length && <span>Save a project to keep it one tap away.</span>}</div><button className="quick-return-library" onClick={() => go('library')}>My library <ArrowRight size={14} /></button></section>}
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
          <section ref={directoryRef} className="directory-section discovery-directory" aria-labelledby="directory-heading">
            <div className="section-heading"><div><DirectoryHeading id="directory-heading" className="directory-heading" tabIndex={-1}>{hasSearch ? 'Search results' : section === 'library' ? 'Saved by you' : section === 'discover' ? 'Explore the ecosystem' : section === 'games' ? 'Find your next game' : section === 'music' ? 'Music experiences' : 'Tools & creative apps'}<span className="count-pill">{page.total}</span></DirectoryHeading>{!hasSearch && <p>{section === 'library' ? (library.status !== 'ready' ? 'Your library will appear when the connection is checked.' : library.isCloud ? 'Your favorites are connected to your RMT account.' : library.storageAvailable ? 'Favorites saved while signed out stay on this device.' : 'Browser storage is unavailable. Favorites last for this visit.') : 'Find your people. Open something new.'}</p>}</div></div>
            <div className="browse-toolbar">
              {['discover', 'library'].includes(section) && <div className="category-tabs browse-categories" aria-label="Filter by category">{categories.map(item => <button key={item} className={category === item ? 'tab-active' : ''} onClick={() => setCategory(item)} aria-pressed={category === item}>{item === 'Games' && <Gamepad2 size={14} />}{item === 'Music' && <Music2 size={14} />}{item === 'Tools' && <Wrench size={14} />}{item}</button>)}</div>}
              <div className="browse-controls"><span className="browse-result-range" aria-live="polite" aria-atomic="true">{page.total ? `${page.start}–${page.end} of ${page.total} projects` : 'No projects in this view'}</span><div className="browse-options"><label className="browse-sort"><ListFilter size={14} /><span className="sr-only">Sort projects</span><select aria-label="Sort projects" value={directorySort} onChange={event => setDirectorySort(event.target.value as DirectorySort)}><option value="name">Name A–Z</option><option value="recent">Newest on RMT</option></select><ChevronDown size={13} /></label><div className="view-switch" role="group" aria-label="Project layout"><button type="button" className={directoryView === 'grid' ? 'view-active' : ''} aria-label="Grid view" aria-pressed={directoryView === 'grid'} onClick={() => changeDirectoryView('grid')}><Grid2X2 size={17} /></button><button type="button" className={directoryView === 'list' ? 'view-active' : ''} aria-label="List view" aria-pressed={directoryView === 'list'} onClick={() => changeDirectoryView('list')}><List size={18} /></button></div></div></div>
            </div>
            {hasSearch && (section !== 'library' || library.status === 'ready') && <div className="search-feedback"><div role="status" aria-live="polite" aria-atomic="true"><p><strong>{page.total} {page.total === 1 ? 'result' : 'results'}</strong> for “{query.trim()}” in <strong>{searchScope}</strong>.</p>{matchesOutsideScope > 0 && <span>{matchesOutsideScope} more {matchesOutsideScope === 1 ? 'match is' : 'matches are'} outside this view.</span>}</div>{isSearchScoped && page.total > 0 && <button type="button" onClick={searchAllProjects}>Search all projects <ArrowRight size={14} /></button>}</div>}
            {catalogError && <p className="inline-notice" role="status">Community submissions are temporarily unavailable. You can still explore the curated directory.</p>}
            {section === 'library' && library.status !== 'ready' ? null : page.total ? <><div className={'project-grid browse-grid' + (directoryView === 'list' ? ' browse-list' : '')} data-view={directoryView}>{page.items.map(project => <article className="project-card browse-card" key={project.id}>
              <div className="project-image-button"><Cover project={project} className="directory-art" thumbnail={directoryView === 'list'} /></div>
              <div className="project-card-body"><div className="browse-card-kicker"><span>{project.category}</span>{project.stage && project.stage !== 'live' && <span>{stageLabel(project.stage)}</span>}</div><div className="project-card-heading"><div className="project-name-button"><h3><button type="button" className="project-card-trigger" onClick={() => openProject(project)} aria-label={'Explore ' + project.name} aria-haspopup="dialog">{project.name}</button></h3></div></div><p>{project.tagline}</p><div className="project-card-footer"><span className="project-card-explore" aria-hidden="true">Explore <ArrowUpRight size={13} /></span><span className="browse-destinations">{destinationCount(project)} links</span><button type="button" className={'save-button ' + (saved.includes(project.id) ? 'saved' : '')} aria-label={(saved.includes(project.id) ? 'Remove ' : 'Save ') + project.name + (saved.includes(project.id) ? ' from library' : ' to library')} aria-pressed={saved.includes(project.id)} disabled={!library.canSave} onClick={() => void toggleSave(project)}><Bookmark size={17} fill={saved.includes(project.id) ? 'currentColor' : 'none'} /></button></div></div>
            </article>)}</div><div className="browse-pagination"><p>{page.total > 8 ? 'A little at a time. There’s more to discover.' : 'You’re all caught up in this view.'}</p>{page.pageCount > 1 && <nav className="pagination-controls" aria-label="Project pages"><button className="pagination-direction" disabled={page.page === 1} onClick={() => changePage(page.page - 1)} aria-label="Previous project page"><ChevronLeft size={17} /><span>Previous</span></button><span className="mobile-page-summary">{page.page} / {page.pageCount}</span><div className="page-numbers">{pageNumbers.map((number, index) => <span className="page-slot" key={number}>{index > 0 && number - pageNumbers[index - 1] > 1 && <span className="page-ellipsis" aria-hidden="true">…</span>}<button className={number === page.page ? 'page-active' : ''} aria-current={number === page.page ? 'page' : undefined} aria-label={'Project page ' + number} onClick={() => changePage(number)}>{number}</button></span>)}</div><button className="pagination-direction" disabled={page.page === page.pageCount} onClick={() => changePage(page.page + 1)} aria-label="Next project page"><span>Next</span><ChevronRight size={17} /></button></nav>}</div></> : <div className="empty-state"><div className="empty-state-icon">{section === 'library' ? <Library size={29} /> : section === 'music' ? <Music2 size={29} /> : <Search size={29} />}</div><h3>{hasSearch ? (matchesOutsideScope > 0 ? 'There’s more beyond this view.' : 'No projects found.') : section === 'library' ? 'Your next favorite belongs here.' : 'The first spot could be yours.'}</h3><p>{hasSearch ? (matchesOutsideScope > 0 ? 'Your search matches projects elsewhere in the directory. Open all projects to see them without changing your search.' : isSearchScoped ? 'Try a shorter name, or search all projects to look beyond your current filters.' : 'Try a project name, part of a name, a game, or a website.') : section === 'library' ? (library.isCloud ? 'Tap the bookmark on any project to save it to your account. Your favorites will be ready here on any device.' : 'Tap the bookmark on any project to keep it here. Sign in to take your library to another device.') : 'We’re opening this part of the directory to builders. Have an experience people should discover?'}</p><button className="button button-lime" onClick={() => hasSearch ? (isSearchScoped ? searchAllProjects() : setQuery('')) : go(section === 'library' ? 'discover' : 'studio')}>{hasSearch ? (isSearchScoped ? 'Search all projects' : 'Clear search') : section === 'library' ? 'Find a project' : 'Submit your project'}<ArrowRight size={16} /></button></div>}
          </section>
          {section === 'discover' && <section className="community-banner"><div className="community-banner-icon"><LayoutGrid size={26} /></div><div><h3>Your community built it. Let people find it.</h3><p>Games, creative tools, and projects deserve more than a buried link.</p></div><button className="button button-outline" onClick={() => go('studio')}>Join the directory <ArrowUpRight size={16} /></button></section>}
          <footer className="content-footer"><span>RMT is an independent directory. Listings don’t imply a partnership.</span><button onClick={() => go('studio')}>Built something? Let’s see it. <ArrowUpRight size={12} /></button></footer>
        </> : section === 'activity' ? <ActivityFeed onProject={openActivityProject} onBuilder={openProjectManagement} onProfile={() => go('profile')} />
        : section === 'member' && memberHandle ? <PublicProfilePage key={memberHandle} handle={memberHandle} initialProfile={profileSeed} onHome={() => go('discover')} onCopy={copyLink} />
        : section === 'account' ? <Account session={sessionStatus === 'ready' ? session : emptySession} sessionStatus={sessionStatus} library={library} onRetrySession={() => void refreshSession()} onToast={notify} onLibrary={() => go('library')} onStudio={() => go('studio')} onReview={() => go('review')} onProfile={() => go('profile')} /> : <>
          {sessionStatus !== 'ready' && <div className={'library-load-state ' + (sessionStatus === 'error' ? 'library-load-error' : '')} role="status">{sessionStatus === 'loading' ? <LoaderCircle className="rmt-spin" size={18} /> : <AlertCircle size={18} />}<div><strong>{sessionStatus === 'loading' ? 'Checking your account…' : 'Your account needs a reconnect.'}</strong><p>Your private workspace opens after your account is checked.</p></div>{sessionStatus === 'error' && <button className="button button-outline" onClick={() => void refreshSession()}><RefreshCw size={14} /> Try again</button>}</div>}
          <div className="private-workspace" key={session.userId || 'guest'} hidden={sessionStatus !== 'ready'} inert={sessionStatus !== 'ready'}>{section === 'profile' ? <ProfileEditor session={session} onToast={notify} onRetrySession={() => void refreshSession()} /> : section === 'studio' ? <Studio session={session} onToast={notify} /> : section === 'claim' && claimProject ? <ClaimProject key={claimProject.id} project={claimProject} session={session} onToast={notify} onClose={() => { go('discover'); openProject(claimProject); }} /> : <ReviewQueue session={session} onToast={notify} />}</div>
        </>}

      </main>
    </div>
    <nav className="mobile-bottom" aria-label="Mobile navigation">
      {[navItems[0], navItems[1], navItems[2], { id: 'studio' as Section, label: 'Build', icon: Terminal }, {id: 'account' as Section, label: 'Account', icon: UserRound}].map(({ id, label, icon: Icon }) => <button key={id} className={section === id || (id === 'account' && section === 'profile') ? 'active' : ''} onClick={() => go(id)}><Icon size={20} /><span>{label}</span></button>)}
    </nav>
    <dialog ref={dialogRef} className="project-dialog showcase-dialog" aria-labelledby="project-title" onCancel={closeProject} onClick={event => { if (event.target === event.currentTarget) closeProject(); }}>
      {selected && <div className="detail-inner" style={{ '--project-accent': selected.accent } as React.CSSProperties}>
        <div className="detail-cover showcase-cover">
          <Cover project={selected} />
          <div className="detail-cover-shade" />
          <div className="showcase-toolbar"><button onClick={closeProject} className="showcase-back"><ArrowLeft size={15} /> Back to RMT</button><span>PROJECT HOME</span></div>
          <button className="dialog-close" onClick={closeProject} aria-label="Close project"><X size={20} /></button>
          <div className="showcase-title">
            <div className="showcase-badges"><span className="showcase-category">{selected.category === 'Games' ? <Gamepad2 size={13} /> : selected.category === 'Tools' ? <Wrench size={13} /> : selected.category === 'Music' ? <Music2 size={13} /> : <Compass size={13} />}{selected.category}</span>{selected.stage && <span>{stageLabel(selected.stage)}</span>}</div>
            <h2 id="project-title" tabIndex={-1}><ProjectLogo project={selected} />{selected.name}</h2>
            <p>{selected.tagline}</p>
          </div>
        </div>
        <div className="detail-body showcase-body">
          <div className="showcase-actionbar">
            <a className="button button-lime showcase-launch" href={selected.launchUrl} target="_top" rel="noopener noreferrer">{selected.launchLabel} <ArrowUpRight size={18} /></a>
            <button className={'button button-outline detail-save ' + (saved.includes(selected.id) ? 'is-saved' : '')} disabled={!library.canSave} onClick={() => void toggleSave(selected)} aria-pressed={saved.includes(selected.id)}>{saved.includes(selected.id) ? <Check size={16} /> : <Bookmark size={16} />}{saved.includes(selected.id) ? 'In your library' : 'Save project'}</button>
            <button className="button button-outline showcase-share" onClick={() => void shareProject(selected)}><Share2 size={16} /><span>Share</span></button>
          </div>
          <div className="launch-hint"><span>Opens {domain(selected.launchUrl)}.</span><LinkOptions href={selected.launchUrl} label={selected.name + ' launch destination'} onCopy={copyLink} /></div>
          <div className="showcase-columns">
            <div className="showcase-main">
              <div className="showcase-tabs" role="tablist" aria-label="Project sections" onKeyDown={event => {
                if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
                event.preventDefault();
                const next = event.key === 'Home' ? 'overview' : event.key === 'End' ? 'updates' : showcaseTab === 'overview' ? 'updates' : 'overview';
                chooseShowcaseTab(next);
                event.currentTarget.querySelector<HTMLButtonElement>('#project-tab-' + next)?.focus();
              }}><button type="button" role="tab" id="project-tab-overview" aria-selected={showcaseTab === 'overview'} aria-controls="project-panel-overview" tabIndex={showcaseTab === 'overview' ? 0 : -1} onClick={() => chooseShowcaseTab('overview')}><Compass size={15} /> Overview</button><button type="button" role="tab" id="project-tab-updates" aria-selected={showcaseTab === 'updates'} aria-controls="project-panel-updates" tabIndex={showcaseTab === 'updates' ? 0 : -1} onClick={() => chooseShowcaseTab('updates')}><Megaphone size={15} /> Updates</button></div>
              <div className="showcase-panel" id="project-panel-overview" role="tabpanel" aria-labelledby="project-tab-overview" hidden={showcaseTab !== 'overview'}>
              <section className="showcase-about" aria-labelledby="project-about"><div className="showcase-section-heading"><h3 id="project-about">Inside {selected.name}</h3><span className="showcase-listing">{selected.claimed ? <><Check size={12} /> Builder claimed</> : selected.source === 'curated' ? 'Curated by RMT' : 'Community listing'}</span></div><p className="detail-description">{selected.description}</p></section>
              {selectedExperiences.length > 0 && <section className="showcase-destinations" aria-labelledby="experience-heading"><div className="showcase-section-heading"><h3 id="experience-heading">Things to try</h3><span>{selectedExperiences.length} {selectedExperiences.length === 1 ? 'experience' : 'experiences'}</span></div><div className="destination-list">{selectedExperiences.map((link, index) => <div className="destination-entry experience-entry" key={link.url}><a href={link.url} target="_top" rel="noopener noreferrer" className="destination"><span className="destination-symbol">{/game/i.test(link.type || '') ? <Gamepad2 size={21} /> : /music|audio/i.test(link.type || '') ? <Music2 size={21} /> : <Wrench size={21} />}</span><span><span className="experience-index">EXPERIENCE {String(index + 1).padStart(2, '0')}</span><strong>{link.label}</strong><small>{link.type || domain(link.url)}</small></span><ArrowUpRight size={18} /></a><LinkOptions href={link.url} label={link.label} onCopy={copyLink} /></div>)}</div></section>}
              {selectedCommunity.length > 0 && <section className="showcase-destinations" aria-labelledby="destination-heading"><div className="showcase-section-heading"><h3 id="destination-heading">{selectedExperiences.length ? 'Find the community' : 'Explore the project'}</h3><span>{selectedCommunity.length} {selectedCommunity.length === 1 ? 'destination' : 'destinations'}</span></div><div className="destination-list">{selectedCommunity.map(link => <div className="destination-entry" key={link.url}><a href={link.url} target="_top" rel="noopener noreferrer" className="destination"><span className="destination-symbol">{/social/i.test(link.type || '') ? <span className="destination-x">𝕏</span> : /collection|explore/i.test(link.type || '') ? <Layers3 size={19} /> : <Compass size={19} />}</span><span><strong>{link.label}</strong><small>{domain(link.url)}{link.type && <span> · {link.type}</span>}</small></span><ArrowUpRight size={18} /></a><LinkOptions href={link.url} label={link.label} onCopy={copyLink} /></div>)}</div></section>}
              {!!selected.collections?.length && <section className="collections-section" aria-labelledby="collection-heading"><div className="showcase-section-heading"><h3 id="collection-heading">The collections</h3><span><Layers3 size={13} /> {selected.collections.length}</span></div><div className="collection-list">{selected.collections.map((collection, index) => <div className="collection-entry" key={collection.url}><a className="collection-link" href={collection.url} target="_top" rel="noopener noreferrer"><span className="collection-index">{String(index + 1).padStart(2, '0')}</span><span><strong>{collection.name}</strong><small>{domain(collection.url)} · {collection.chain || 'Collection'} · {index === 0 ? 'Primary collection' : 'Related collection'}</small></span><ArrowUpRight size={16} /></a><LinkOptions href={collection.url} label={collection.name} onCopy={copyLink} /></div>)}</div><p className="collection-footnote">Grouped using links published by the project or its creator.</p></section>}
              </div>
              <div className="showcase-panel" id="project-panel-updates" role="tabpanel" aria-labelledby="project-tab-updates" hidden={showcaseTab !== 'updates'}>
                {showcaseTab === 'updates' && <ProjectUpdates key={selected.id} project={selected} onBuilder={() => selected.claimed ? openProjectManagement() : startClaim(selected)} />}
              </div>
            </div>
            <aside className="showcase-sidebar" aria-label="Share this project">
              <ProjectBuilders key={selected.id} projectId={selected.id} />
              <section className="showcase-share-card">
                <div className="share-card-heading"><span>PASS IT ON</span><Share2 size={15} /></div>
                <h3>A find worth sharing.</h3>
                <p>One link to this project’s home on RMT.</p>
                <span className="share-preview-caption">Card preview</span><div className="project-share-preview"><img src={projectSocialImagePath(selected)} alt={selected.name + ' share card preview'} loading="lazy" /><div><small>RMTLAUNCH.FUN</small><strong>{selected.name} on RMT</strong></div></div>
                <div className="showcase-share-actions"><button className="button button-outline" onClick={() => void copyLink(projectShareUrl(selected), 'Project link copied. Ready to share.')}><Copy size={14} /> Copy link</button><a className="button button-outline" href={projectXIntentUrl(selected)} target="_blank" rel="noopener noreferrer" aria-label={'Share ' + selected.name + ' on X'}><span className="share-x">𝕏</span> Post</a></div>
                <button className="showcase-device-share" onClick={() => void shareProject(selected)}><Share2 size={13} /> More sharing options <ArrowUpRight size={13} /></button>
              </section>
              <div className="showcase-library-tip"><Bookmark size={17} /><p>Make it a regular stop.<br /><span>Save this project to keep it in your library.</span></p></div>
            </aside>
          </div>
          <div className="detail-note"><ArrowUpRight size={15} /><p>Experiences open on their creators’ sites. Access requirements vary. {selected.claimed ? 'Project ownership has been reviewed by RMT.' : 'This listing uses public project pages and is waiting for its builder to claim it.'}</p></div>
          <div className="detail-claim-row"><div className="showcase-builder-icon"><Terminal size={21} /></div><div><strong>{selected.claimed ? 'Keep your project moving.' : 'Built by you? Make yourself at home.'}</strong><p>{selected.claimed ? 'Manage your listing and share project updates in Builder Studio.' : 'Claim this page for free. Bring your links, collections, and experiences together.'}</p></div><button className="button button-outline" onClick={() => selected.claimed ? openProjectManagement() : startClaim(selected)}>{selected.claimed ? 'Builder Studio' : 'Claim this project'} <ArrowUpRight size={15} /></button></div>
          {relatedProjects.length > 0 && <section className="showcase-related" aria-labelledby="related-heading"><div className="showcase-section-heading"><h3 id="related-heading">Keep exploring</h3><Compass size={15} /></div><div className="related-projects">{relatedProjects.map(project => <button className="related-project" key={project.id} onClick={() => openProject(project)}><span className="related-project-art"><Cover project={project} /></span><span><strong>{project.name}</strong><small>{project.category}</small></span><ArrowUpRight size={15} /></button>)}</div></section>}
        </div>
        {toastNode}
      </div>}
    </dialog>
    <dialog ref={installRef} className="install-dialog" onCancel={() => setInstallOpen(false)} onClick={event => { if (event.target === event.currentTarget) setInstallOpen(false); }}><button className="dialog-close" onClick={() => setInstallOpen(false)} aria-label="Close install instructions"><X size={20} /></button><div className="install-app-icon install-app-image"><img src="/icons/rmt-mark-v5.png" alt="RMT" width="78" height="78" /></div><h2>One tap from home.</h2><p>Add RMT to your phone’s home screen for quick access to your library.</p><div className="install-step"><span>1</span><div><strong>On iPhone</strong><p>Open RMT in Safari. Tap Share, then “Add to Home Screen.”</p></div></div><div className="install-step"><span>2</span><div><strong>On Android</strong><p>Open RMT in Chrome. Open the browser menu and choose “Install app” or “Add to Home screen.”</p></div></div><p className="small-note">Sign in to keep your library across devices. Guest favorites stay in this browser. Games and tools open on their creators’ websites.</p><button className="button button-lime" onClick={() => setInstallOpen(false)}>Got it <Check size={16} /></button></dialog>
    <ManualCopyDialog value={copyFallback} onClose={() => setCopyFallback(null)} />
    {!selected && toastNode}
  </div>;
}
