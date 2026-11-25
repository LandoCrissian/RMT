'use client';
import {useState,type FormEvent} from 'react';

import type {CalendarType as EventType,CalendarEvent as ManagedEvent,EventFields} from '@/lib/calendar';
export type {EventType,ManagedEvent,EventFields};
export function localTime(value:number|null|undefined){
  if(!Number.isFinite(value)||value==null)return '';
  const d=new Date(value);
  return new Date(d.getTime()-d.getTimezoneOffset()*60_000).toISOString().slice(0,19);
}
export function EventForm({types,artworkChoices,initial,busy,onSave,onClose,reviewOnly=false}:{
  types:EventType[];artworkChoices:string[];initial?:Partial<EventFields>;busy:boolean;
  onSave:(fields:EventFields,submit:boolean)=>Promise<void>;onClose:()=>void;reviewOnly?:boolean;
}){
  const [error,setError]=useState('');
  async function save(e:FormEvent<HTMLFormElement>){
    e.preventDefault();const form=new FormData(e.currentTarget),text=(key:string)=>String(form.get(key)??'').trim();
    const startsAt=new Date(text('start')).getTime(),endsAt=text('end')?new Date(text('end')).getTime():null;
    if(!Number.isFinite(startsAt)||(endsAt!==null&&(!Number.isFinite(endsAt)||endsAt<=startsAt))){setError('Choose an end time later than the start time.');return;}
    setError('');
    const fields={title:text('title'),description:text('description'),destination:text('destination'),access:text('access'),typeId:text('typeId'),artwork:text('artwork'),startsAt,endsAt};
    await onSave(fields,(e.nativeEvent as SubmitEvent).submitter?.getAttribute('value')==='submit');
  }
  return <form onSubmit={save} className="st-panel"><fieldset disabled={busy} className="calendar-fields">
    <label className="st-field">Event title<input name="title" required defaultValue={initial?.title} maxLength={100}/></label>
    <label className="st-field">Event type<select name="typeId" required defaultValue={initial?.typeId??(types.some(t=>t.id==='community'&&!t.archived)?'community':'')}><option value="" disabled>Choose an event type</option>{types.filter(t=>!t.archived).map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
    <label className="st-field">Description<textarea name="description" required maxLength={2000} rows={4} defaultValue={initial?.description}/></label>
    <p>Times shown in {Intl.DateTimeFormat().resolvedOptions().timeZone}.</p>
    <div className="st-fields-two"><label className="st-field">Starts<input type="datetime-local" name="start" required step="1" defaultValue={localTime(initial?.startsAt)}/></label>
    <label className="st-field">Ends (optional)<input type="datetime-local" name="end" step="1" defaultValue={localTime(initial?.endsAt)}/></label></div>
    <label className="st-field">Event destination<input type="url" name="destination" required placeholder="https://" defaultValue={initial?.destination}/></label>
    <label className="st-field">Access details<input name="access" maxLength={300} defaultValue={initial?.access}/></label>
    <label className="st-field">Project artwork<select name="artwork" defaultValue={initial?.artwork??''}><option value="">Default project artwork</option>{artworkChoices.map((url,i)=><option key={url} value={url}>{i+1} · {url.split('/').pop()}</option>)}</select></label>
    {error&&<p role="alert" className="st-error">{error}</p>}
    <div className="up-owned-actions">{!reviewOnly&&<button className="st-button st-secondary" type="submit" value="draft">Save draft</button>}<button className="st-button st-primary" type="submit" value="submit">{reviewOnly?'Send suggestion to review':'Submit for review'}</button><button type="button" className="st-text-button" onClick={onClose}>Close editor</button></div>
    </fieldset></form>;
}

