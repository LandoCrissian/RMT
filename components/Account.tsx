'use client';

import { ArrowRight, ArrowUpRight, Check, Cloud, Copy, Database, KeyRound, Library, LoaderCircle, RefreshCw, ShieldCheck, Smartphone, Terminal, UserRound } from 'lucide-react';
import type { StudioSession } from './studio-shared';
import type { ProjectLibrary, SessionStatus } from './use-project-library';
import './account.css';
import FirebaseAccount from './FirebaseAccount';

export function signInHref(_returnTo = '/#account') { return '/#account'; }

export function LibrarySyncStatus({ library }: { library: ProjectLibrary }) {
  const Icon = library.status === 'loading' || library.busy ? LoaderCircle : library.isCloud ? Cloud : Smartphone;
  const label = library.status === 'loading' ? 'Opening your library' : library.busy ? 'Saving to your account' : library.status === 'error' ? 'Connection needs attention' : library.isCloud ? 'Saved to your account' : library.storageAvailable ? 'Saved on this device' : 'Available for this visit';
  return <span className={'library-sync ' + (library.status === 'error' ? 'sync-error' : '')} role="status"><Icon size={14} className={library.status === 'loading' || library.busy ? 'rmt-spin' : ''} />{label}</span>;
}

type Props = {
  session: StudioSession; sessionStatus: SessionStatus; library: ProjectLibrary;
  onRetrySession: () => void; onToast: (message: string) => void;
  onLibrary: () => void; onStudio: () => void; onReview: () => void;
};

export default function Account({ session, sessionStatus, library, onRetrySession, onToast, onLibrary, onStudio, onReview }: Props) {
  const initials = (session.displayName || 'RMT').split(/\s+/).map(part => part[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
  async function copyReference() {
    if (!session.userId) return;
    try { await navigator.clipboard.writeText(session.userId); onToast('Your RMT account reference was copied.'); }
    catch { onToast('Copy the account reference shown on this page.'); }
  }
  return <div className="account-page">
    <div className="page-heading"><div><div className="eyebrow">YOUR RMT ACCOUNT</div><h1>A little more you.</h1><p>Your projects, your library, and a clear view of what’s saved.</p></div></div>
    <section className="account-identity" aria-labelledby="account-heading">
      <div className="account-identity-main"><span className="account-avatar" aria-hidden="true">{session.authenticated ? initials : <UserRound size={30} />}</span><div><span className="account-kicker">{session.authenticated ? 'SIGNED IN TO RMT' : 'ONE ACCOUNT. YOUR RMT.'}</span><h2 id="account-heading">{sessionStatus === 'loading' ? 'Checking your account…' : session.authenticated ? session.displayName || 'Welcome back.' : 'Take your favorites with you.'}</h2><p>{session.authenticated ? 'Your RMT account connects your saved projects and Builder Studio.' : 'Sign in with Google or email to save projects across devices and build your home on RMT.'}</p></div></div>
      <div className="account-identity-actions">{sessionStatus === 'loading' ? <span className="account-pending"><LoaderCircle className="rmt-spin" size={16} /> Connecting</span> : sessionStatus === 'error' ? <button className="button button-outline" onClick={onRetrySession}><RefreshCw size={16} /> Check again</button> : session.authenticated ? <><span className="account-role"><Check size={13} /> {session.isAdmin ? 'RMT reviewer' : 'RMT member'}</span></> : <a className="button button-lime" href={signInHref()} target="_top">Sign in to RMT <ArrowRight size={16} /></a>}</div>
    </section>
    <FirebaseAccount authenticated={session.authenticated && session.provider === 'firebase'} emailVerified={session.emailVerified} onChange={onRetrySession} />
    {sessionStatus === 'error' && <p className="inline-notice" role="alert">Your account connection could not be checked. Your saved information has not been changed.</p>}
    <div className="account-workspaces">
      <section className="account-workspace-card"><span className="account-tile-icon"><Library size={24} /></span><span className="account-kicker">YOUR PERSONAL LAUNCHPAD</span><h2>My library</h2><p>Keep the communities you follow together. Open their sites, games, and collections from one place.</p><LibrarySyncStatus library={library} /><button className="text-link" onClick={onLibrary}>Open my library <ArrowRight size={15} /></button></section>
      <section className="account-workspace-card"><span className="account-tile-icon"><Terminal size={24} /></span><span className="account-kicker">FOR WHATEVER YOU’RE BUILDING</span><h2>Builder Studio</h2><p>Submit a new project, claim a curated listing, or follow your review status. Early ideas are welcome.</p><span className="account-free"><Check size={14} /> Free to list. Free to claim.</span><button className="text-link" onClick={onStudio}>Open Builder Studio <ArrowRight size={15} /></button></section>
    </div>
    <section className="account-storage" aria-labelledby="storage-heading"><div className="account-section-heading"><div><span className="eyebrow">NO GUESSWORK</span><h2 id="storage-heading">Where does everything go?</h2></div><Database size={23} /></div><div className="storage-list">
      <div><span className="storage-icon"><Cloud size={20} /></span><div><h3>With your RMT account</h3><p>When you’re signed in, your library, project submissions, ownership claims, and review history are saved in RMT’s hosted database. Use the same RMT account to return to them on another device.</p></div><span className="storage-label">ACROSS DEVICES</span></div>
      <div><span className="storage-icon"><Smartphone size={20} /></span><div><h3>On this device</h3><p>Favorites saved while signed out stay in this browser. You can choose to bring them into your account after signing in. Clearing browser data can remove these device favorites.</p></div><span className="storage-label">GUEST FAVORITES</span></div>
      <div><span className="storage-icon"><ShieldCheck size={20} /></span><div><h3>Private until reviewed</h3><p>Your sign-in identity, pending applications, contact details, and ownership evidence are available to you and RMT’s authorized reviewers. Approved listing details appear in the directory.</p></div><span className="storage-label">REVIEWED BY RMT</span></div>
      <div><span className="storage-icon"><ArrowUpRight size={20} /></span><div><h3>At each project’s home</h3><p>Games, music, and tools open on their creators’ websites. Those services handle their own accounts, files, and progress.</p></div><span className="storage-label">EXTERNAL EXPERIENCES</span></div>
    </div></section>
    <div className="account-access-note"><KeyRound size={18} /><p><strong>Your choice of sign-in.</strong> Use Google or an email and password. You don’t need a wallet or an NFT to save projects or submit your work.</p></div>
    {session.authenticated && session.userId && <section className="account-reference"><div><h3>Your account reference</h3><p>This identifies your account within RMT. Share it with RMT if you need help with account access.</p><code>{session.userId}</code></div><button className="button button-outline" onClick={copyReference}><Copy size={14} /> Copy reference</button></section>}
    {session.isAdmin && <button className="account-review-link" onClick={onReview}><ShieldCheck size={19} /><span><strong>Your reviewer workspace</strong><small>Review new projects, ownership claims, and listing updates.</small></span><ArrowRight size={18} /></button>}
  </div>;
}
