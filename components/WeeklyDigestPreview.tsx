'use client';

import {useEffect,useState} from 'react';
import WeeklyDigestTemplate from './WeeklyDigestTemplate';
import type {WeeklyDigest} from '@/lib/weekly-digest';

export default function WeeklyDigestPreview({account}: {account:string}) {
  const [open,setOpen]=useState(false);
  const [digest,setDigest]=useState<WeeklyDigest|null>(null);
  const [error,setError]=useState(false);
  const [attempt,setAttempt]=useState(0);
  useEffect(()=>{
    setDigest(null);setError(false);
    if(!open)return;
    const controller=new AbortController();
    const hide=()=>{controller.abort();setOpen(false);setDigest(null);};
    window.addEventListener('pagehide',hide);
    fetch('/api/discovery/weekly-digest',{cache:'no-store',credentials:'same-origin',signal:controller.signal,headers:{'X-RMT-Account':account}})
      .then(async response=>{if(!response.ok)throw Error();const next=await response.json() as WeeklyDigest;if(!controller.signal.aborted)setDigest(next);})
      .catch(()=>{if(!controller.signal.aborted)setError(true);});
    return ()=>{controller.abort();window.removeEventListener('pagehide',hide);};
  },[open,account,attempt]);
  return <section className="weekly-digest-preview">
    <button type="button" aria-expanded={open} className="text-link" onClick={()=>setOpen(value=>!value)}>{open?'Close weekly digest':'Preview weekly digest'}</button>
    {open&&<div style={{marginTop:'12px'}}>{error?<p role="alert">Your digest could not load. <button type="button" onClick={()=>setAttempt(value=>value+1)}>Try again</button></p>
      :digest?<WeeklyDigestTemplate digest={digest}/>:<p role="status">Loading your digest…</p>}</div>}
  </section>;
}
