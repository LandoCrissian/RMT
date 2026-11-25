'use client';
import {useEffect,useRef,useState} from 'react';
import {ArrowLeft,CalendarDays,Plus} from 'lucide-react';
import {readApiResponse} from './studio-shared';
import {EventForm,type ManagedEvent,type EventFields,type EventType} from './EventForm';
import './calendar-management.css';

type Workspace={events:ManagedEvent[];types:EventType[];artworkChoices:string[]};
export default function BuilderEvents({project,account,onBack}:{project:{id:string;name:string};account:string;onBack:()=>void}){
  const [data,setData]=useState<Workspace|null>(null),[editing,setEditing]=useState<ManagedEvent|'new'|null>(null),[cancel,setCancel]=useState<ManagedEvent|null>(null);
  const [refresh,reload]=useState(0),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),lock=useRef(false);
  const path='/api/calendar/manage?projectId='+encodeURIComponent(project.id);
  useEffect(()=>{
    const controller=new AbortController();setData(null);setError('');
    fetch(path,{cache:'no-store',signal:controller.signal,headers:{'X-RMT-Account':account}}).then(readApiResponse).then(value=>{
      if(!Array.isArray(value.events)||!Array.isArray(value.types)||!Array.isArray(value.artworkChoices))throw Error('The event workspace could not be verified.');
      if(!controller.signal.aborted)setData(value as Workspace);
    }).catch(cause=>{if(!controller.signal.aborted)setError(cause instanceof Error?cause.message:'Your events could not be loaded.');});
    return ()=>controller.abort();
  },[path,account,refresh]);
  async function change(action:'draft'|'submit'|'cancel',entry:ManagedEvent|null,fields?:EventFields){
    if(lock.current)return;lock.current=true;setBusy(true);setError('');setNotice('');
    try{
      await readApiResponse(await fetch(path,{method:'POST',headers:{'X-RMT-Account':account,'Content-Type':'application/json'},
        body:JSON.stringify({projectId:project.id,...(entry?{id:entry.id}:{}),action,expectedRevision:entry?.revision??0,...(fields?{fields}:{})})}));
      setEditing(null);setCancel(null);setNotice(action==='draft'?'Draft saved.':action==='cancel'?'Event cancelled.':'Event submitted for review.');reload(n=>n+1);
    }catch(cause){setError(cause instanceof Error?cause.message:'The change could not be confirmed. Refresh to check its status.');}
    finally{lock.current=false;setBusy(false);}
  }
  return <section className="st-workspace calendar-management"><button type="button" className="st-text-button" onClick={onBack} disabled={busy}><ArrowLeft size={15}/> My projects</button>
    <header><h2>{project.name} events</h2></header>
    {error&&<p role="alert" className="st-error">{error} <button className="st-text-button" disabled={busy} onClick={()=>{setEditing(null);setCancel(null);reload(n=>n+1);}}>Reload events</button></p>}
    {notice&&<p role="status">{notice}</p>}{busy&&<p role="status">Saving…</p>}
    {!data?!error&&<p role="status">Loading events…</p>:editing?<><h3>{editing==='new'?'Create event':'Edit event'}</h3><EventForm types={data.types} artworkChoices={data.artworkChoices} initial={editing==='new'?undefined:editing} busy={busy} onClose={()=>setEditing(null)} onSave={(fields,submit)=>change(submit?'submit':'draft',editing==='new'?null:editing,fields)}/></>:<>
    <button type="button" className="st-button st-primary" onClick={()=>{setEditing('new');setNotice('');}}><Plus size={15}/> Create event</button>
    {!data.events.length&&<p>No events yet. Submit an event for review to add it to the public calendar.</p>}
    {data.events.map(event=><article className="st-panel" key={event.id}><span className="st-kicker">{event.status}</span><h3>{event.title}</h3><p><CalendarDays size={16}/> {new Date(event.startsAt).toLocaleString()}</p>
      {event.hasPublished&&['pending','draft','rejected'].includes(event.status)&&<p>The last approved version remains public.</p>}
      {!['cancelled','removed'].includes(event.status)&&<div className="up-owned-actions"><button type="button" className="st-button st-secondary" disabled={busy} onClick={()=>{setEditing(event);setNotice('');}}>Edit event</button><button type="button" className="st-text-button" disabled={busy} onClick={()=>setCancel(event)}>Cancel event</button></div>}
      {cancel?.id===event.id&&<div><p>Mark {event.title} as cancelled?</p><button type="button" disabled={busy} className="st-button st-secondary" onClick={()=>void change('cancel',event)}>Confirm cancellation</button> <button type="button" disabled={busy} className="st-text-button" onClick={()=>setCancel(null)}>Keep event</button></div>}
    </article>)}</>}</section>;
}
