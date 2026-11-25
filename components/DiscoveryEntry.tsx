'use client';

import {useEffect,useRef,useState} from 'react';
import {ArrowRight, Radio} from 'lucide-react';
import DiscoveryGuide from './DiscoveryGuide';
import {readDiscovery,saveDiscovery,type Lesson} from '@/lib/client/discovery';
import './personalized-discovery.css';

export default function DiscoveryEntry({account,onActivity}:{account:string|null;onActivity:()=>void}) {
  const [lessons,setLessons]=useState<Lesson[]>([]);
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
      if(!controller.signal.aborted)setLessons(page.lessons);
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
  return <aside className="discovery-entry" aria-label="Explore RMT">
    <div className="discovery-entry-actions"><button type="button" onClick={onActivity}><Radio size={17}/> Project updates <ArrowRight size={15}/></button></div>
    <DiscoveryGuide items={lessons} onOpen={()=>void openGuide()} onOutcome={outcome=>void finish(outcome)}/>
    {error&&<p role="alert">{error} <button type="button" className="text-link" onClick={()=>void openGuide()}>Retry</button></p>}
    {message&&<p role="status">{message}</p>}
  </aside>;
}
