'use client';
import {useEffect,useState} from 'react';
import {CalendarDays,ArrowLeft,ArrowUpRight,Bookmark,Bell,Share2,Download} from 'lucide-react';
import type {CalendarEvent,CalendarType} from '@/lib/calendar';
import './ecosystem-calendar.css';

type Option={id:string;name:string};
export function EventTime({ms}:{ms:number}){
  const [local,setLocal]=useState(false);useEffect(()=>setLocal(true),[]);
  return <time dateTime={new Date(ms).toISOString()}>{new Intl.DateTimeFormat(local?undefined:'en-US',{day:'numeric',month:'short',year:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short',...(local?{}:{timeZone:'UTC'})}).format(ms)}</time>;
}
function Header(){return <header className="ec-top"><a href="/"><img src="/icons/rmt-mark-v5.png" width="32" height="32" alt=""/> RMT<span>.</span></a><a href="/"><ArrowLeft size={15}/> Directory</a></header>;}
type MemberRow={id:string;reminder:number};
function useCalendarAccount(){
  const [user,setUser]=useState(''),[rows,setRows]=useState<MemberRow[]>([]),[error,setError]=useState(''),[ready,setReady]=useState(false);
  useEffect(()=>{let alive=true;async function load(){try{
    const resp=await fetch('/api/session',{cache:'no-store'});if(!resp.ok)throw Error();
    const session=await resp.json() as {authenticated:boolean;emailVerified:boolean;suspended:boolean;userId:string};if(!alive)return;
    if(session.authenticated&&session.emailVerified&&!session.suspended){
      const r=await fetch('/api/calendar/member',{headers:{'x-rmt-account':session.userId},cache:'no-store'});if(!r.ok)throw Error();const values=await r.json() as MemberRow[];
      if(alive){setRows(values);setUser(session.userId);}
    }if(alive)setReady(true);
  }catch{if(alive)setError('Your saved events could not be loaded. Refresh to reconnect.');}}void load();return()=>{alive=false;};},[]);
  return {user,rows,setRows,error,ready};
}
export function Calendar({events,projects,categories,types,initialNow}:{initialNow:number;events:CalendarEvent[];projects:Option[];categories:Option[];types:CalendarType[]}){
  const [view,setView]=useState('Upcoming'),[project,setProject]=useState(''),[category,setCategory]=useState(''),[type,setType]=useState(''),[now,setNow]=useState(initialNow);
  const member=useCalendarAccount();useEffect(()=>{setNow(Date.now());const timer=setInterval(()=>setNow(Date.now()),60000);return()=>clearInterval(timer);},[]);
  const list=events.filter(e=>(!project||e.projectId===project)&&(!category||e.categories.includes(category))&&(!type||e.typeId===type)&&
    (view==='Saved'?member.rows.some(r=>r.id===e.id):view==='Agenda'?true:now!==null&&(view==='Past'?(e.endsAt??e.startsAt)<now:e.status!=='cancelled'&&(e.endsAt??e.startsAt)>=now)));
  if(view==='Past')list.reverse();
  return <main className="ec"><Header/><header className="ec-intro"><CalendarDays/><h1>Ecosystem calendar</h1><p>Find launches, community sessions and events across Robinhood Chain.</p></header>
    <nav className="ec-tabs" aria-label="Calendar views">{['Upcoming','Past','Agenda',...(member.user?['Saved']:[])].map(v=><button key={v} aria-pressed={v===view} onClick={()=>setView(v)}>{v}</button>)}</nav>
    <details className="ec-filter"><summary>Filter events{[project,category,type].filter(Boolean).length?' · '+[project,category,type].filter(Boolean).length:''}</summary><div>{([['Project',projects,project,setProject],['Category',categories,category,setCategory],['Event type',types,type,setType]] as const).map(([label,options,val,set])=><label key={label}>{label}<select value={val} onChange={e=>set(e.target.value)}><option value="">All</option>{options.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</select></label>)}</div></details>
    {member.error&&<p role="alert">{member.error}</p>}{list.length?<ol className="ec-list">{list.map(e=><li key={e.id}><a href={'/events/'+e.id}>{e.artwork&&<img src={e.artwork} alt=""/>}<div><small>{e.projectName}{e.featured?' · Editorial pick':''}</small><h2>{e.title}</h2><EventTime ms={e.startsAt}/>{e.status==='cancelled'&&<em>Cancelled</em>}</div><ArrowUpRight size={18}/></a></li>)}</ol>:
    <section className="ec-empty"><CalendarDays/><h2>{now===null?'Loading agenda…':view==='Saved'?'No saved events':project||category||type?'No matching events':view==='Upcoming'?'No upcoming events published':view==='Past'?'No past events published':'No events published'}</h2><a href="/">Explore projects →</a></section>}</main>;
}
export function EventDetail({event:e}:{event:CalendarEvent}){
 const member=useCalendarAccount(),row=member.rows.find(r=>r.id===e.id),[busy,setBusy]=useState(false),[msg,setMsg]=useState('');
 async function save(saved:boolean,reminder:boolean){setBusy(true);try{
  const r=await fetch('/api/calendar/member',{method:'POST',headers:{'content-type':'application/json','x-rmt-account':member.user},body:JSON.stringify({id:e.id,saved,reminder})});if(!r.ok)throw Error(((await r.json()) as {error:string}).error);
  member.setRows(values=>[...values.filter(v=>v.id!==e.id),...(saved?[{id:e.id,reminder:+reminder}]:[])]);setMsg(reminder?'Reminder enabled for the 24 hours before the event.':saved?'Event saved.':'Event removed from Saved.');
 }catch(err){setMsg(err instanceof Error?err.message:'Could not save. Try again.');}finally{setBusy(false);}}
 async function share(){try{const url='https://rmtlaunch.fun/events/'+encodeURIComponent(e.id);if(navigator.share)await navigator.share({title:e.title,url});else{await navigator.clipboard.writeText(url);setMsg('Event link copied.');}}catch(err){if(!(err instanceof DOMException&&err.name==='AbortError'))setMsg('Copy the event URL from your address bar to share.');}}
 return <main className="ec"><Header/><a className="ec-back" href="/calendar"><ArrowLeft size={16}/> Ecosystem calendar</a><article className="ec-detail">{e.artwork&&<img className="ec-art" src={e.artwork} alt={e.projectName+' artwork'}/>}<div><a href={'/projects/'+e.projectSlug}>{e.projectName}</a><h1>{e.title}</h1>{e.status==='cancelled'&&<strong>Cancelled</strong>}<p><EventTime ms={e.startsAt}/>{e.endsAt&&<> – <EventTime ms={e.endsAt}/></>}</p><p>{e.description}</p>{e.access&&<p><b>Access</b> {e.access}</p>}
 <div className="ec-actions">{e.status!=='cancelled'&&<a href={e.destination} rel="noopener noreferrer" target="_blank">Official event <ArrowUpRight size={15}/></a>}<a href={'/events/'+e.id+'/calendar.ics'} download><Download size={16}/> Add to calendar (.ics)</a><button onClick={share}><Share2 size={16}/> Share</button></div>
 {member.user&&e.status!=='cancelled'?<div className="ec-actions"><button disabled={busy} aria-pressed={!!row} onClick={()=>save(!row,false)}><Bookmark size={16}/>{row?'Unsave event':'Save event'}</button><button disabled={busy} aria-pressed={!!row?.reminder} onClick={()=>save(true,!row?.reminder)}><Bell size={16}/>{row?.reminder?'Disable reminder':'Remind me in RMT'}</button></div>:member.ready&&!member.user?<a href="/#account">Sign in to save events and set reminders</a>:null}<p role="status">{member.error||msg}</p></div></article></main>;
}
