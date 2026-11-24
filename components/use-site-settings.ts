'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {DEFAULT_SITE_SETTINGS,validateSiteSettings,type PublicSiteSettings} from '@/lib/control-settings';
export function useSiteSettings(initial?:PublicSiteSettings){
  const [settings,setSettings]=useState(initial??structuredClone(DEFAULT_SITE_SETTINGS));
  const [status,setStatus]=useState<'loading'|'ready'|'error'>(initial?'ready':'loading');
  const current=useRef<AbortController|null>(null);
  const refresh=useCallback(async()=>{
    current.current?.abort();const controller=new AbortController();current.current=controller;
    try{
      const response=await fetch('/api/site-settings',{cache:'no-store',credentials:'same-origin',signal:controller.signal});
      if(!response.ok)throw new Error();const body=await response.json() as {settings?:unknown};const next=validateSiteSettings(body.settings);
      if(!controller.signal.aborted){setSettings(next);setStatus('ready');}
    }catch{if(!controller.signal.aborted)setStatus('error');}
  },[]);
  useEffect(()=>{
    void refresh();const focus=()=>{if(document.visibilityState==='visible')void refresh();};
    window.addEventListener('focus',focus);window.addEventListener('rmt-control-changed',focus);
    const timer=window.setInterval(focus,60_000);
    return()=>{current.current?.abort();window.clearInterval(timer);window.removeEventListener('focus',focus);window.removeEventListener('rmt-control-changed',focus);};
  },[refresh]);
  return {settings,status,refresh};
}
