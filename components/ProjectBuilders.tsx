'use client';

import {useEffect, useState} from 'react';
import {ArrowUpRight, UserRound} from 'lucide-react';
import {PROFILE_HANDLE_PATTERN} from '@/lib/profiles';
import './community-profiles.css';

type Builder = {handle: string; displayName: string; href: string; avatar: {url: string} | null};
function buildersResponse(value: unknown): Builder[] {
  if (!value || typeof value !== 'object' || !('builders' in value) || !Array.isArray(value.builders) || value.builders.length > 8) throw new Error('Invalid builders');
  const handles = new Set<string>();
  return value.builders.map((item: unknown) => {
    if (!item || typeof item !== 'object') throw new Error('Invalid builder');
    const builder = item as Record<string, unknown>;
    if (typeof builder.handle !== 'string' || !PROFILE_HANDLE_PATTERN.test(builder.handle) || handles.has(builder.handle) ||
        typeof builder.displayName !== 'string' || builder.displayName.length < 2 || builder.displayName.length > 48 ||
        builder.href !== '/u/' + builder.handle) throw new Error('Invalid builder');
    const avatar = builder.avatar as {url?: unknown} | null;
    if (avatar !== null && (!avatar || typeof avatar.url !== 'string' || !/^\/media\/profile-artwork\/[a-zA-Z0-9-]+$/.test(avatar.url))) throw new Error('Invalid builder artwork');
    handles.add(builder.handle);
    return {handle: builder.handle, displayName: builder.displayName, href: builder.href as string, avatar: avatar ? {url: avatar.url as string} : null};
  });
}

export default function ProjectBuilders({projectId}: {projectId: string}) {
  const [builders, setBuilders] = useState<Builder[]>([]);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const controller = new AbortController(); setBuilders([]);
    void fetch('/api/projects/' + encodeURIComponent(projectId) + '/builders', {credentials: 'omit', cache: 'no-store', signal: controller.signal}).then(async response => {
      if (!response.ok) throw new Error('Unavailable');
      const next = buildersResponse(await response.json());
      if (!controller.signal.aborted) setBuilders(next);
    }).catch(() => {if (!controller.signal.aborted) setBuilders([]);});
    return () => controller.abort();
  }, [projectId, refresh]);
  useEffect(() => {
    const recheck = () => {if (document.visibilityState === 'visible') {setBuilders([]); setRefresh(value => value + 1);}};
    const hide = () => setBuilders([]);
    const restore = (event: PageTransitionEvent) => {if (event.persisted) recheck();};
    window.addEventListener('focus', recheck); document.addEventListener('visibilitychange', recheck);
    window.addEventListener('pagehide', hide); window.addEventListener('pageshow', restore);
    return () => {window.removeEventListener('focus', recheck); document.removeEventListener('visibilitychange', recheck); window.removeEventListener('pagehide', hide); window.removeEventListener('pageshow', restore);};
  }, []);
  if (!builders.length) return null;
  return <section className="project-builders" aria-label="Meet the builders"><h3>Meet the builders</h3><p>RMT members with an approved claim to this project.</p><div>{builders.map(builder => <a key={builder.handle} href={builder.href}><span className="project-builder-avatar">{builder.avatar ? <img src={builder.avatar.url} alt="" loading="lazy" /> : <UserRound size={18} />}</span><span><strong>{builder.displayName}</strong><small>@{builder.handle}</small></span><ArrowUpRight size={15} /></a>)}</div></section>;
}
