'use client';

import {useEffect, useRef, useState} from 'react';
import {ArrowLeft, Copy, LoaderCircle, RefreshCw, UserRound} from 'lucide-react';
import type {PublicProfile as Profile} from '@/lib/profiles';
import {publicProfileResponse} from '@/lib/client/profiles';
import PublicProfile from './PublicProfile';
import './community-profiles.css';

export default function PublicProfilePage({handle, initialProfile, onHome, onCopy}: {handle: string; initialProfile?: Profile; onHome: () => void; onCopy: (value: string, message: string) => Promise<void>}) {
  const [state, setState] = useState<{handle: string; profile: Profile | null}>({handle, profile: initialProfile?.handle === handle ? initialProfile : null});
  const [error, setError] = useState('');
  const [unavailable, setUnavailable] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const initial = useRef(true);
  const profile = state.handle === handle ? state.profile : null;
  useEffect(() => {
    const controller = new AbortController();
    if (!initial.current) setState({handle, profile: null});
    initial.current = false; setError(''); setUnavailable(false);
    void fetch('/api/profiles/' + encodeURIComponent(handle), {credentials: 'omit', cache: 'no-store', signal: controller.signal}).then(async response => {
      if (response.status === 404) {if (!controller.signal.aborted) {setState({handle, profile: null}); setUnavailable(true);} return;}
      if (!response.ok) throw new Error('This profile could not be loaded. Please try again.');
      const next = publicProfileResponse(await response.json(), handle);
      if (!controller.signal.aborted) setState({handle, profile: next});
    }).catch(cause => {if (!controller.signal.aborted) {setState({handle, profile: null}); setError(cause instanceof Error ? cause.message : 'This profile could not be loaded.');}});
    return () => controller.abort();
  }, [handle, refresh]);
  useEffect(() => {
    const recheck = () => {if (document.visibilityState === 'visible') {setState({handle, profile: null}); setRefresh(value => value + 1);}};
    const restore = (event: PageTransitionEvent) => {if (event.persisted) recheck();};
    const hide = () => setState({handle, profile: null});
    window.addEventListener('focus', recheck); document.addEventListener('visibilitychange', recheck);
    window.addEventListener('pageshow', restore); window.addEventListener('pagehide', hide);
    return () => {window.removeEventListener('focus', recheck); document.removeEventListener('visibilitychange', recheck); window.removeEventListener('pageshow', restore); window.removeEventListener('pagehide', hide);};
  }, [handle]);
  useEffect(() => {document.title = profile ? profile.displayName + ' (@' + profile.handle + ') | RMT' : unavailable ? 'Profile unavailable | RMT' : 'Member profile | RMT';}, [profile, unavailable]);
  return <div className="member-page"><div className="member-toolbar"><button type="button" onClick={onHome}><ArrowLeft size={15} /> Back to RMT</button>{profile && <button type="button" onClick={() => void onCopy('https://rmtlaunch.fun/u/' + encodeURIComponent(profile.handle), 'Profile link copied. Ready to share.')}><Copy size={14} /> Copy profile link</button>}</div>
    {unavailable ? <section className="member-state"><UserRound size={30} /><h1>This profile isn’t available.</h1><p>The member may have made it private, or this link may be out of date.</p><button type="button" className="button button-outline" onClick={onHome}>Explore RMT <ArrowLeft size={15} /></button></section>
      : error ? <section className="member-state" role="alert"><UserRound size={30} /><h1>We couldn’t load this profile.</h1><p>{error}</p><button type="button" className="button button-outline" onClick={() => setRefresh(value => value + 1)}><RefreshCw size={15} /> Try again</button></section>
      : profile ? <PublicProfile profile={profile} /> : <div className="member-state" role="status"><LoaderCircle size={27} className="rmt-spin" /><p>Opening this RMT profile…</p></div>}
  </div>;
}
