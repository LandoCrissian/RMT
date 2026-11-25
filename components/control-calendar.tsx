'use client';
import {useState} from 'react';
import {useControlResource,useControlMutation,type ControlApi} from '@/lib/client/use-control';
import {reviewSuggestions,type CalendarSuggestion} from '@/lib/client/calendar-suggestions';
import {ConfirmDialog,ErrorPanel,Loading,PanelHeading,SaveNotice} from './control-primitives';
import {EventForm,type EventType,type ManagedEvent} from './EventForm';
import './calendar-management.css';

type Workspace={events:ManagedEvent[];types:EventType[];history:{eventId:string;action:string;reason:string;createdAt:number}[];
  stats:{published:number;saved:number;reminders:number};projects:{id:string;name:string;artworkChoices:string[]}[]};
function parse(v:unknown){
  const d=v as Workspace;
  if(![d?.events,d?.types,d?.history,d?.projects].every(Array.isArray)||![d?.stats?.published,d?.stats?.saved,d?.stats?.reminders].every(Number.isSafeInteger))throw Error('Calendar workspace is incomplete.');
  return d;
}
type Decision={label:string;detail:string;body:Record<string,unknown>};
const path='/api/control/calendar';
export default function ControlCalendar({api}:{api:ControlApi}){
  const resource=useControlResource(api,path,parse,'calendar'),mutation=useControlMutation(api,'calendar');
  const [decision,setDecision]=useState<Decision|null>(null),[notice,setNotice]=useState(''),[filter,setFilter]=useState('pending');
  const [typeId,setTypeId]=useState(''),[suggestions,setSuggestions]=useState<CalendarSuggestion[]>([]),[suggestion,setSuggestion]=useState<CalendarSuggestion|null>(null);
  const [importError,setImportError]=useState('');
  const data=resource.data;
  async function reload(){setDecision(null);mutation.clear();await resource.reload();}
  async function confirm(reason:string){
    if(!decision)return;
    const result=await mutation.run(path,'PATCH',{...decision.body,reason},v=>{if(!v||typeof v!=='object')throw Error('Incomplete calendar response.');return true;});
    if(result){setDecision(null);setNotice('Calendar change saved.');if(decision.body.action==='suggest'){setSuggestions(rows=>rows.filter(r=>r!==suggestion));setSuggestion(null);}await resource.reload();}
  }
  if(resource.error)return <ErrorPanel message={resource.error} onRetry={()=>void reload()}/>;
  if(!data)return <Loading label="Loading calendar workspace…"/>;
  const types=data.types,editingType=types.find(t=>t.id===typeId);
  const rows=data.events.filter(e=>filter==='all'||e.status===filter);
  const selectedProject=data.projects.find(p=>p.id===suggestion?.projectId);
  function review(event:ManagedEvent,action:string,label:string){setDecision({label,detail:event.projectName+' · '+event.title,body:{action,id:event.id,expectedRevision:event.revision}});}
  return <section className="cc-section calendar-management"><PanelHeading title="Calendar" description="Review events, schedule editorial picks and manage event types."/>
    <dl className="calendar-stats">{Object.entries(data.stats).map(([key,value])=><div key={key}><dt>{key==='saved'?'Saves':key==='published'?'Published':'Reminders'}</dt><dd>{value}</dd></div>)}</dl>
    <section className="cc-panel"><h3>Event moderation</h3><label>Status <select aria-label="Event status" value={filter} onChange={e=>setFilter(e.target.value)}>{['pending','published','rejected','cancelled','removed','all'].map(s=><option key={s} value={s}>{s==='all'?'All events':s[0].toUpperCase()+s.slice(1)}</option>)}</select></label>
    {!rows.length&&<p>No events in this view.</p>}
    {rows.map(e=><article key={e.id}><p>{e.projectName} · {types.find(t=>t.id===e.typeId)?.name??e.typeId} · {e.status}{e.featured?' · Featured':''}</p><h4>{e.title}</h4><p>{e.description}</p><p>{new Date(e.startsAt).toLocaleString()}{e.endsAt?' – '+new Date(e.endsAt).toLocaleString():''}</p>
      {e.destination&&<a href={e.destination} target="_blank" rel="noreferrer">Event destination</a>}{e.access&&<p>{e.access}</p>}{e.artwork&&<p>Artwork: {e.artwork}</p>}
      <div className="calendar-actions">{e.status==='pending'&&<><button className="cc-button cc-primary" onClick={()=>review(e,'approve','Approve event')}>Approve</button><button className="cc-button" onClick={()=>review(e,'reject','Reject event')}>Reject</button></>}
      {e.hasPublished&&!['cancelled','removed'].includes(e.status)&&<button className="cc-button" onClick={()=>review(e,e.featured?'unfeature':'feature',e.featured?'Remove editorial pick':'Feature event')}>{e.featured?'Unfeature':'Feature event'}</button>}{e.status!=='removed'&&<button className="cc-button" onClick={()=>review(e,'remove','Remove event')}>Remove event</button>}</div></article>)}
    </section>
    <details className="cc-panel"><summary>Event types</summary><label>Event type<select value={typeId} onChange={e=>setTypeId(e.target.value)}><option value="">New event type</option>{types.map(t=><option key={t.id} value={t.id}>{t.name}{t.archived?' · archived':''}</option>)}</select></label>
    <form className="calendar-fields" key={typeId+'-'+(editingType?.revision??0)} onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);const name=String(f.get('name')).trim();setDecision({label:'Save event type',detail:name,body:{action:'type',id:editingType?.id??String(f.get('id')).trim(),name,archived:f.has('archived'),expectedRevision:editingType?.revision??0}});}}>
    {!editingType&&<label>Type identifier<input name="id" required placeholder="community" pattern="[a-z][a-z0-9-]*"/></label>}<label>Type name<input required name="name" defaultValue={editingType?.name} maxLength={60}/></label><label><input type="checkbox" name="archived" defaultChecked={editingType?.archived}/> Archive event type</label><button className="cc-button">Save type</button></form></details>
    <details className="cc-panel"><summary>Official-source suggestions</summary><label>Calendar suggestions file<input type="file" accept=".json,application/json" onChange={async e=>{const file=e.target.files?.[0];setImportError('');setSuggestions([]);setSuggestion(null);if(!file)return;try{if(file.size>2_000_000)throw Error('Choose a file smaller than 2 MB.');const items=reviewSuggestions(JSON.parse(await file.text()),new Set(data.projects.map(p=>p.id)));setSuggestions(items);if(!items.length)setImportError('This collection contains no event suggestions.');}catch(cause){setImportError(cause instanceof Error?cause.message:'The file could not be read.');}}}/></label>
    {importError&&<p role="status">{importError}</p>}
    {suggestions.map((s,i)=><button key={i} className="cc-button" onClick={()=>setSuggestion(s)}>Review {data.projects.find(p=>p.id===s.projectId)?.name} · {s.title}</button>)}
    {suggestion&&selectedProject&&<article><h4>{selectedProject.name}</h4><a href={suggestion.sourceUrl} target="_blank" rel="noreferrer">Review official source</a>
      <EventForm key={suggestions.indexOf(suggestion)} types={types} initial={suggestion} artworkChoices={selectedProject.artworkChoices} busy={mutation.busy} reviewOnly onClose={()=>setSuggestion(null)}
      onSave={async fields=>setDecision({label:'Queue event suggestion',detail:fields.title,body:{action:'suggest',projectId:selectedProject.id,sourceKey:suggestion.sourceKey,sourceUrl:suggestion.sourceUrl,fields}})}/></article>}</details>
    <details className="cc-panel"><summary>Moderation history</summary>{data.history.length?<ol>{data.history.map((h,i)=><li key={i}><strong>{h.action}</strong> · {new Date(h.createdAt).toLocaleString()} · {data.events.find(e=>e.id===h.eventId)?.title??h.eventId}<p>{h.reason}</p></li>)}</ol>:<p>No moderation decisions yet.</p>}</details>
    {notice&&<p role="status">{notice}</p>}
    {decision?<ConfirmDialog title={decision.label} description={decision.detail} busy={mutation.busy} error={mutation.error} needsRefresh={mutation.needsRefresh} onReload={()=>void reload()} onCancel={()=>{setDecision(null);mutation.clear();}} onConfirm={reason=>void confirm(reason)}/>:<SaveNotice busy={mutation.busy} error={mutation.error} needsRefresh={mutation.needsRefresh} onReload={()=>void reload()}/>}
  </section>;
}
