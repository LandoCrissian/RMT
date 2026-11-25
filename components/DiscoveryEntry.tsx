'use client';

import {useEffect,useRef,useState} from 'react';
import {ArrowRight, Radio} from 'lucide-react';
import InterestPicker from './InterestPicker';
import DiscoveryGuide from './DiscoveryGuide';
import {readDiscovery,saveDiscovery,type DiscoveryPage} from '@/lib/client/discovery';
import './personalized-discovery.css';

export default function DiscoveryEntry({account,onActivity}:{account:string|null;onActivity:()=>void}) {
  const [page,setPage]=useState<DiscoveryPage|null>(null);
  const [saving,setSaving]=useState(false);
  const pending=useRef(false);
  const [error,setError]=useState('');
  const [message,setMessage]=useState('');
  const active=useRef<AbortController|null>(null);
  useEffect(()=>()=>active.current?.abort(),[]);
  async function openGuide() {
    active.current?.abort();
    const controller=new AbortController(); active.current=controller;
    setError('');setMessage('');
    try {
      const page=await readDiscovery(new URLSearchParams({view:'guide'}),account,controller.signal);
      if(!controller.signal.aborted){setPage(page);if(!page.lessons.length)setError('There are no published lessons yet.');}
    } catch {
      if(!controller.signal.aborted)setError('The guide could not load.');
    }
  }
  async function finish(outcome:'skipped'|'completed') {
    active.current?.abort();setError('');setMessage('');
    if(!account)return;
    try{await saveDiscovery(account,{action:'onboarding',outcome});}
    catch{setMessage('Your guide progress could not be saved. You can reopen it at any time.');}
  }
  async function saveInterests(interests:string[]) {
    if(!account||pending.current)return false;
    pending.current=true;setSaving(true);setMessage('');
    try {
      await saveDiscovery(account,{action:'interests',interests});
      setPage(current=>current&&{...current,interests});setMessage('Interests saved.');return true;
    } catch(cause) {
      setMessage(cause instanceof Error?cause.message:'Your interests could not be saved.');return false;
    } finally {pending.current=false;setSaving(false);}
  }
  return <aside className="discovery-entry" aria-label="Explore RMT">
    <div className="discovery-entry-actions"><button type="button" onClick={onActivity}><Radio size={17}/> Project updates <ArrowRight size={15}/></button></div>
    <DiscoveryGuide account={account} items={page?.lessons??[]} error={error} onOpen={()=>void openGuide()} onOutcome={outcome=>void finish(outcome)}
      completion={page?.member&&account?<InterestPicker page={page} busy={saving} onSave={saveInterests}/>:null}/>
    {message&&<p role="status">{message}</p>}
  </aside>;
}
