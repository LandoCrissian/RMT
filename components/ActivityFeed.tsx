'use client';

import {useEffect, useRef, useState} from 'react';
import {ArrowLeft, ArrowRight, ArrowUpRight, ChevronDown, ChevronUp, Bell, CalendarDays, CircleAlert, Compass, Hammer, Megaphone, Radio, RefreshCw, Rocket, Terminal, UserRound} from 'lucide-react';
import type {ActivityItem} from '@/lib/activity';
import {readDiscovery,saveDiscovery,type DiscoveryPage} from '@/lib/client/discovery';
import './activity.css';

type Filter = 'all' | 'listing' | 'announcement' | 'progress' | 'release' | 'event';
const filters: {id: Filter; label: string}[] = [
  {id: 'all', label: 'Everything'}, {id: 'listing', label: 'New projects'},
  {id: 'announcement', label: 'Announcements'}, {id: 'progress', label: 'In progress'}, {id: 'release', label: 'Releases'}, {id:'event',label:'Events'},
];
const labels = {listing: 'New to RMT', announcement: 'Announcement', progress: 'In progress', release: 'Release', event:'Event'};
const icons = {listing: Compass, announcement: Megaphone, progress: Hammer, release: Rocket,event:CalendarDays};

function Artwork({project, banner = false}: {project: ActivityItem['project']; banner?: boolean}) {
  const [failed, setFailed] = useState(false);
  const source = banner ? project.cover : project.artwork?.logo?.url || project.logo || project.cover;
  useEffect(() => setFailed(false), [source]);
  const custom = source.startsWith('/media/project-artwork/') || source.startsWith('/media/control-project-artwork/');
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

type View = 'for-you' | 'following' | 'all' | 'notifications';
const tabs = [{id:'for-you', label:'For You'}, {id:'following', label:'Following'}, {id:'all', label:'All Activity'}] as const;
const criteria: Record<View,string> = {
  'for-you':'Updates from projects you follow, projects matching your interests, and RMT’s editorial picks. Newest first.',
  following:'Reviewed updates from the projects you follow, newest first.',
  all:'Every public listing and reviewed project update, newest first.',
  notifications:'Reviewed updates published after you followed a project, newest first.',
};

function InterestPicker({page,busy,onSave}:{page:DiscoveryPage;busy:boolean;onSave:(values:string[])=>Promise<boolean>}) {
  const [open,setOpen]=useState(false);
  const [selected,setSelected]=useState(page.interests);
  useEffect(()=>{setSelected(page.interests);},[page.interests]);
  async function save(values:string[]) {
    if(await onSave(values))setOpen(false);
  }
  return <section className="activity-profile-card interest-picker">
    <h2>Your interests</h2>
    {open?<><fieldset disabled={busy}><legend>Choose the topics you want to follow.</legend>
      {page.categories.map(category=><label key={category}><input type="checkbox" checked={selected.includes(category)} onChange={event=>setSelected(current=>event.target.checked?[...current,category]:current.filter(value=>value!==category))}/>{category}</label>)}</fieldset>
      <div className="preference-actions"><button type="button" disabled={busy} onClick={()=>void save(selected)}>Save interests</button>
      <button type="button" disabled={busy} onClick={()=>{setSelected(page.interests);setOpen(false);}}>Cancel</button></div>
      {(page.interests.length>0)&&<button type="button" disabled={busy} onClick={()=>void save([])}>Reset interests</button>}</>
    :<><p>{page.interests.length?page.interests.join(' · '):'Choose topics for your For You feed. Your selections are private.'}</p><button type="button" onClick={()=>setOpen(true)}>Edit interests <ArrowRight size={15}/></button></>}
  </section>;
}

export default function ActivityFeed({account,signIn,onProject,onBuilder,onProfile}:{
  account:string|null;signIn:string;onProject:(id:string,updates:boolean)=>boolean;onBuilder:()=>void;onProfile:()=>void
}) {
  const [view,setView]=useState<View>(account?'for-you':'all');
  const [filter,setFilter]=useState<Filter>('all');
  const [cursors,setCursors]=useState<(string|null)[]>([null]);
  const [page,setPage]=useState<DiscoveryPage|null>(null);
  const [error,setError]=useState('');
  const [feedback,setFeedback]=useState('');
  const [saving,setSaving]=useState(false);
  const lock=useRef(false);
  const [refresh,setRefresh]=useState(0);
  const heading=useRef<HTMLHeadingElement>(null);
  const cursor=cursors[cursors.length-1];
  const memberView=view==='notifications'||view==='following';
  const mustSignIn=!account&&memberView;

  useEffect(()=>{
    const controller=new AbortController();
    setError('');setPage(null);
    if(mustSignIn)return ()=>controller.abort();
    const query=new URLSearchParams({view,kind:view==='all'?filter:'all',limit:'6'});
    if(cursor)query.set('cursor',cursor);
    readDiscovery(query,account,controller.signal).then(next=>{if(!controller.signal.aborted)setPage(next);})
      .catch(cause=>{if(!controller.signal.aborted)setError(cause instanceof Error?cause.message:'Please refresh and try again.');});
    return ()=>controller.abort();
  },[view,filter,cursor,account,refresh,mustSignIn]);
  useEffect(()=>{
    const recheck=()=>{if(document.visibilityState==='visible')setRefresh(value=>value+1);};
    const restore=(event:PageTransitionEvent)=>{if(event.persisted)recheck();};
    const hide=()=>setPage(null);
    window.addEventListener('pageshow',restore);window.addEventListener('pagehide',hide);
    window.addEventListener('rmt-follow-changed',recheck);
    document.addEventListener('visibilitychange',recheck);
    return ()=>{window.removeEventListener('pageshow',restore);window.removeEventListener('pagehide',hide);window.removeEventListener('rmt-follow-changed',recheck);document.removeEventListener('visibilitychange',recheck);};
  },[]);
  function choose(next:View){if(view===next)return;setView(next);setCursors([null]);setPage(null);setFeedback('');setError('');}
  function move(next:(string|null)[]){setPage(null);setCursors(next);heading.current?.focus({preventScroll:true});heading.current?.scrollIntoView({block:'start'});}
  async function change(action:Parameters<typeof saveDiscovery>[1],confirmation:string) {
    if(!account||lock.current)return false;
    lock.current=true;setSaving(true);setFeedback('');
    try {await saveDiscovery(account,action);setFeedback(confirmation);setRefresh(value=>value+1);return true;}
    catch(cause){setFeedback(cause instanceof Error?cause.message:'Your change could not be saved.');return false;}
    finally{lock.current=false;setSaving(false);}
  }
  return <div className="activity-page">
    <header className="activity-heading"><div><h1 ref={heading} tabIndex={-1}>Activity</h1><p>Announcements, releases and events from the projects on RMT.</p></div>
      <button type="button" className="inbox-toggle" aria-pressed={view==='notifications'} onClick={()=>choose(view==='notifications'?(account?'for-you':'all'):'notifications')}><Bell size={18}/> Notifications{Boolean(page?.unreadCount)&&<span aria-label={page!.unreadCount+' unread'}>{page!.unreadCount}</span>}</button></header>
    <div className="activity-layout"><section className="activity-main" aria-label="Ecosystem activity">
      <div className="discovery-tabs" role="group" aria-label="Activity views">{tabs.map(tab=><button type="button" key={tab.id} aria-pressed={view===tab.id} onClick={()=>choose(tab.id)}>{tab.label}</button>)}</div>
      {view==='notifications'&&<h2 className="inbox-title">Notifications</h2>}
      <p className="feed-criteria">{view==='for-you'&&!account?'RMT’s editorial picks, newest first. Sign in to personalize this feed.':criteria[view]}</p>
      {view==='all'&&<div className="activity-filterbar"><div className="activity-filters" role="group" aria-label="Filter activity">{filters.map(item=><button key={item.id} type="button" aria-pressed={filter===item.id} onClick={()=>{setPage(null);setCursors([null]);setFilter(item.id);setRefresh(v=>v+1);}}>{item.label}</button>)}</div></div>}
      {view==='notifications'&&page?.member&&<label className="inbox-preference"><input type="checkbox" role="switch" checked={page.notificationsEnabled} disabled={saving} onChange={event=>void change({action:'notifications',enabled:event.target.checked},'Notification preference saved.')}/> Followed-project notifications</label>}
      <div className="feed-messages"><p role="status">{saving?'Saving…':feedback}</p>{!mustSignIn&&<button className="activity-refresh" type="button" aria-label="Refresh activity" onClick={()=>setRefresh(value=>value+1)} disabled={!page&&!error}><RefreshCw size={16}/></button>}</div>
      {mustSignIn?<div className="activity-feedback"><h2>{view==='following'?'Follow your first project':'Your notification center'}</h2><p>Sign in with Google or email to see updates from the projects you follow. You can browse All Activity without an account.</p><a className="button button-outline" href={signIn} target="_top">Sign in</a><button type="button" className="text-link" onClick={()=>choose('all')}>Browse All Activity</button></div>
      :error?<div className="activity-feedback" role="alert"><CircleAlert size={26}/><h2>Activity is unavailable</h2><p>{error}</p><button className="button button-outline" type="button" onClick={()=>setRefresh(value=>value+1)}>Try again</button></div>
      :!page?<div className="activity-loading" role="status"><span className="sr-only">Loading activity…</span><div className="activity-skeleton" aria-hidden="true"><span/><strong/><p/><p/></div></div>
      :page.items.length?<div className="activity-list">{page.items.map(item=><div key={item.id}>
        {view==='notifications'&&item.updateId&&<div className="notification-state"><span>{page.readIds.includes(item.updateId)?'Read':'Unread'}</span>{!page.readIds.includes(item.updateId)&&<button type="button" disabled={saving} aria-label={'Mark '+item.title+' as read'} onClick={()=>void change({action:'read',id:item.updateId!},'Notification marked as read.')}>Mark as read</button>}</div>}
        <ActivityCard item={item} onProject={onProject}/></div>)}</div>
      :<div className="activity-feedback"><Radio size={27}/><h2>{view==='notifications'?(page.notificationsEnabled?'No notifications yet':'Notifications are off'):view==='following'?'No updates from followed projects yet':view==='for-you'?'No matching updates yet':'No activity in this view yet'}</h2>
        <p>{view==='notifications'?'Enable followed-project notifications to see new, reviewed updates here.':view==='following'?'Follow a project from its page. Its reviewed updates appear here.':view==='for-you'?'Browse All Activity to see what projects have shared.':'Updates appear when a builder publishes through RMT’s review process.'}</p>
        {view!=='all'&&<button className="button button-outline" type="button" onClick={()=>choose('all')}>Browse All Activity</button>}</div>}
      {page&&(cursors.length>1||page.nextCursor)&&<nav className="activity-pagination" aria-label="Activity pages"><button type="button" className="button button-outline" disabled={cursors.length<=1} onClick={()=>move(cursors.slice(0,-1))}><ArrowLeft size={15}/> Newer</button><span>Page {cursors.length}</span><button type="button" className="button button-outline" disabled={!page.nextCursor} onClick={()=>{if(page.nextCursor)move([...cursors,page.nextCursor]);}}>Older <ArrowRight size={15}/></button></nav>}
    </section>
    <aside className="activity-sidebar" aria-label="Discovery preferences and projects">
      {page?.member&&<InterestPicker page={page} busy={saving} onSave={interests=>change({action:'interests',interests},interests.length?'Interests saved.':'Interests reset.')}/>}
      {view==='for-you'&&!!page?.recommendedProjects.length&&<section className="activity-profile-card discovery-projects"><h2>Projects to explore</h2><p>From your interests and RMT’s editorial picks.</p>{page.recommendedProjects.map(project=><button key={project.id} type="button" onClick={()=>onProject(project.id,false)}>{project.name}<ArrowUpRight size={15}/></button>)}</section>}
      <section className="activity-builder-card"><Terminal size={22}/><h2>Share a project update</h2><p>Confirmed builders can submit an announcement, release, event or progress update for review.</p><button type="button" className="button button-lime" onClick={onBuilder}>Open Builder Studio <ArrowUpRight size={16}/></button></section>
      <section className="activity-profile-card"><UserRound size={20}/><h2>Your RMT profile</h2><button type="button" onClick={onProfile}>Open profile <ArrowRight size={15}/></button></section>
    </aside></div>
  </div>;
}
