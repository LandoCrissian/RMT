'use client';
import {useEffect,useState} from 'react';
import {Activity,ArrowUpRight,BarChart3,Bell,CheckCircle2,ChevronRight,ClipboardCheck,Clock3,FolderKanban,History,LayoutDashboard,LockKeyhole,Radio,RefreshCw,Settings2,ShieldCheck,SlidersHorizontal,UserRoundCheck,Users} from 'lucide-react';
import {overviewResponse,type ControlCapability,type ControlOverview} from '@/lib/client/control';
import {useControlApi,useControlResource} from '@/lib/client/use-control';
import type {StudioSession} from './studio-shared';
import ControlMembers from './control-members';
import ControlProjects from './control-projects';
import {ControlContent,ControlHistory} from './control-content';
import {ControlAnalytics,ControlAppearance,ControlSystem} from './control-site';
import {ConfirmDialog,ErrorPanel,Loading,PanelHeading,RefreshButton,RoleBadge,StatCard,controlDate} from './control-primitives';
import './control-center.css';

type Section='overview'|'members'|'projects'|'content'|'analytics'|'settings'|'roles'|'audit'|'health';
type Props={spotlights:{id:string;name:string}[];session:StudioSession;onToast:(message:string)=>void;onRetrySession?:()=>void;onReview:()=>void;onProject?:(id:string)=>void};
const sections:{id:Section;label:string;capability:ControlCapability;icon:typeof Users}[]=[
  {id:'overview',label:'Overview',capability:'overview',icon:LayoutDashboard},
  {id:'members',label:'People',capability:'members',icon:Users},
  {id:'projects',label:'Projects',capability:'projects',icon:FolderKanban},
  {id:'content',label:'Content',capability:'content',icon:ClipboardCheck},
  {id:'analytics',label:'Insights',capability:'health',icon:BarChart3},
  {id:'settings',label:'Appearance',capability:'settings',icon:Settings2},
  {id:'roles',label:'Team access',capability:'roles',icon:ShieldCheck},
  {id:'audit',label:'History',capability:'audit',icon:History},
  {id:'health',label:'System',capability:'health',icon:Activity},
];
export default function ControlCenter(props:Props){
  if(!props.session.authenticated||!props.session.isAdmin||props.session.emailVerified===false)return <section className="cc-shell cc-access-gate"><span className="cc-gate-symbol"><LockKeyhole size={29}/></span><span className="cc-eyebrow">RMT CONTROL CENTER</span><h1>Your site, under your control.</h1><p>Sign in with an authorized RMT administrator account to manage the community, projects, and site settings.</p><a className="cc-button cc-primary" href="/?continue=%2F%23control#account">Open your account<ArrowUpRight size={16}/></a></section>;
  return <ControlWorkspace key={props.session.userId} {...props}/>;
}
function ControlWorkspace({spotlights,session,onToast,onRetrySession,onReview}:Props){
  const api=useControlApi(session),overview=useControlResource(api,'/api/control/overview',overviewResponse);
  const [section,setSection]=useState<Section>('overview'),[dirty,setDirty]=useState(false),[nextSection,setNextSection]=useState<Section|null>(null);
  const capabilities=overview.data?.capabilities.filter(capability=>!session.controlCapabilities||session.controlCapabilities.includes(capability))??[];
  const available=sections.filter(item=>capabilities.includes(item.capability));
  const pending=overview.data?overview.data.metrics.pendingSubmissions+overview.data.metrics.pendingClaims+overview.data.metrics.pendingEdits+overview.data.metrics.pendingUpdates:0;
  useEffect(()=>{const listener=(event:BeforeUnloadEvent)=>{if(dirty){event.preventDefault();event.returnValue='';}};window.addEventListener('beforeunload',listener);return()=>window.removeEventListener('beforeunload',listener);},[dirty]);
  useEffect(()=>{if(overview.data&&!available.some(item=>item.id===section)){setSection('overview');setDirty(false);}},[overview.data,session.controlCapabilities,section]);
  function navigate(next:Section){if(next===section)return;if(dirty)setNextSection(next);else setSection(next);}
  if(api.denied)return <section className="cc-shell cc-access-gate" role="alert"><span className="cc-gate-symbol"><LockKeyhole size={28}/></span><h1>Refresh your administrator access.</h1><p>{api.denied}</p><button type="button" className="cc-button cc-primary" onClick={()=>{onRetrySession?.();window.location.reload();}}><RefreshCw size={16}/>Refresh RMT</button></section>;
  return <section className="cc-shell" aria-labelledby="cc-heading"><header className="cc-heading"><div><span className="cc-eyebrow"><span className="cc-live-dot"/> RMT CONTROL CENTER</span><h1 id="cc-heading">Control Center</h1><p>The people, the projects, and the controls to keep RMT moving.</p></div><div className="cc-heading-side"><span className="cc-heading-mark" aria-hidden="true"><SlidersHorizontal size={34}/></span>{overview.data&&<RoleBadge role={overview.data.role}/>}<span className="cc-heading-time">{overview.data?'Snapshot · '+controlDate(overview.data.generatedAt,true):'Loading your workspace…'}</span></div></header>
    {overview.error?<ErrorPanel message={overview.error} onRetry={()=>void overview.reload()} busy={overview.loading}/>:!overview.data?<Loading label="Opening your Control Center…"/>:<>
      <div className="cc-workspace-nav"><nav className="cc-tabs" aria-label="Control Center sections">{available.map(item=><button className={section===item.id?'is-selected':''} key={item.id} type="button" aria-pressed={section===item.id} onClick={()=>navigate(item.id)}><item.icon size={16}/>{item.label}</button>)}</nav><label className="cc-mobile-section"><span>Workspace</span><select value={section} onChange={event=>navigate(event.target.value as Section)}>{available.map(item=><option value={item.id} key={item.id}>{item.label}</option>)}</select></label>{capabilities.includes('review')&&<button className="cc-review-shortcut" type="button" onClick={onReview}><ClipboardCheck size={16}/><span>Reviews</span>{pending>0&&<b>{pending}</b>}<ArrowUpRight size={14}/></button>}</div>
      <div className="cc-workspace-body">
        {section==='overview'&&<Overview data={overview.data} capabilities={capabilities} loading={overview.loading} onRefresh={()=>void overview.reload()} onNavigate={navigate} onReview={onReview}/>}
        {section==='members'&&capabilities.includes('members')&&<ControlMembers api={api} onToast={onToast} onReview={onReview}/>}
        {section==='projects'&&capabilities.includes('projects')&&<ControlProjects spotlights={spotlights} api={api} onToast={onToast} onReview={onReview} onDirty={setDirty}/>}
        {section==='content'&&capabilities.includes('content')&&<ControlContent api={api} onToast={onToast}/>}
        {section==='analytics'&&capabilities.includes('health')&&<ControlAnalytics api={api}/>}
        {section==='settings'&&capabilities.includes('settings')&&<ControlAppearance api={api} onToast={onToast} onDirty={setDirty}/>}
        {section==='roles'&&capabilities.includes('roles')&&<ControlMembers key="permissions" api={api} onToast={onToast} onReview={onReview} permissions/>}
        {section==='audit'&&capabilities.includes('audit')&&<ControlHistory api={api}/>}
        {section==='health'&&capabilities.includes('health')&&<ControlSystem api={api} session={session} onToast={onToast}/>}
      </div>
    </>}
    {nextSection&&<ConfirmDialog title="Leave these unsaved changes?" description="Your saved site is unchanged. Switching sections will discard the local edits in this form." confirmLabel="Discard and continue" requireReason={false} danger onCancel={()=>setNextSection(null)} onConfirm={()=>{setDirty(false);setSection(nextSection);setNextSection(null);}}/>}
  </section>;
}
function Overview({data,capabilities,loading,onRefresh,onNavigate,onReview}:{data:ControlOverview;capabilities:ControlCapability[];loading:boolean;onRefresh:()=>void;onNavigate:(section:Section)=>void;onReview:()=>void}){
  const metrics=data.metrics,total=metrics.pendingSubmissions+metrics.pendingClaims+metrics.pendingEdits+metrics.pendingUpdates;
  return <div className="cc-section"><PanelHeading title="A clear view of your community." description="Real platform records, with the next action close by." actions={<RefreshButton busy={loading} onClick={onRefresh}/>}/>
    <div className="cc-stats"><StatCard label="Members known to RMT" value={metrics.members} detail={metrics.observedMembers+' observed signing in'} icon={<Users size={21}/>} onClick={capabilities.includes('members')?()=>onNavigate('members'):undefined}/><StatCard label="Public projects" value={metrics.listedProjects} detail="Available in the directory" icon={<FolderKanban size={21}/>} onClick={capabilities.includes('projects')?()=>onNavigate('projects'):undefined}/><StatCard label="Waiting for review" value={total} detail="Applications, claims, edits, updates" icon={<ClipboardCheck size={21}/>} onClick={capabilities.includes('review')?onReview:undefined}/><StatCard label="Confirmed builders" value={metrics.confirmedBuilders} detail="Members with active ownership" icon={<UserRoundCheck size={21}/>} /><StatCard label="Active in the past 7 days" value={metrics.activeLast7Days} detail="Signed-in activity observed" icon={<Activity size={21}/>} /><StatCard label="Public profiles" value={metrics.publicProfiles} detail="Members choosing to be visible" icon={<Radio size={21}/>} /></div>
    <div className="cc-overview-grid"><section className="cc-review-card"><div className="cc-row-between"><span className="cc-eyebrow">YOUR NEXT DECISIONS</span><span className="cc-review-symbol"><ClipboardCheck size={25}/></span></div><h3>{total?'A few things need your eye.':'You’re caught up.'}</h3><p>{total?'Check the projects, ownership, and changes waiting for a decision.':'New applications and builder updates will land in your review workspace.'}</p><div className="cc-queue-counts">{[{label:'Project applications',count:metrics.pendingSubmissions},{label:'Ownership claims',count:metrics.pendingClaims},{label:'Listing edits',count:metrics.pendingEdits},{label:'Project updates',count:metrics.pendingUpdates}].map(item=><div key={item.label}><span>{item.label}</span><strong>{item.count}</strong></div>)}</div>{capabilities.includes('review')&&<button className="cc-button cc-primary" type="button" onClick={onReview}>Open review workspace<ArrowUpRight size={15}/></button>}</section>
      <div className="cc-quick-actions"><h3>Run it from here.</h3>{capabilities.includes('projects')&&<button type="button" onClick={()=>onNavigate('projects')}><span><FolderKanban size={20}/></span><div><strong>Shape the directory</strong><small>Add projects, update links, and choose features.</small></div><ChevronRight size={17}/></button>}{capabilities.includes('members')&&<button type="button" onClick={()=>onNavigate('members')}><span><Users size={20}/></span><div><strong>Meet your members</strong><small>See accounts and manage access.</small></div><ChevronRight size={17}/></button>}{capabilities.includes('settings')&&<button type="button" onClick={()=>onNavigate('settings')}><span><Settings2 size={20}/></span><div><strong>Set the public experience</strong><small>Site notices, applications, and availability.</small></div><ChevronRight size={17}/></button>}{capabilities.includes('content')&&<button type="button" onClick={()=>onNavigate('content')}><span><ShieldCheck size={20}/></span><div><strong>Look after public content</strong><small>Review profiles and project announcements.</small></div><ChevronRight size={17}/></button>}{capabilities.includes('health')&&<button type="button" onClick={()=>onNavigate('health')}><span><Bell size={20}/></span><div><strong>Check site operations</strong><small>Service checks, notifications, and exports.</small></div><ChevronRight size={17}/></button>}</div></div>
    <div className="cc-overview-footnote"><Clock3 size={17}/><p>Member activity is observed from {controlDate(data.observedSince)}. Earlier RMT records are included where available. A sign-in count is not a count of anonymous visitors.</p></div>{metrics.suspendedMembers>0&&capabilities.includes('members')&&<button className="cc-text-button" type="button" onClick={()=>onNavigate('members')}>{metrics.suspendedMembers} suspended {metrics.suspendedMembers===1?'member':'members'}<ArrowUpRight size={14}/></button>}
  </div>;
}
