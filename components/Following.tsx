'use client';
import {useEffect,useRef,useState} from 'react';
import {ArrowUpRight,Check,Radio} from 'lucide-react';
import type {Project} from '@/lib/catalog';

async function request(path:string,account:string|null,method='GET',signal?:AbortSignal){
  const response=await fetch(path,{method,signal,credentials:'same-origin',cache:'no-store',
    headers:{...(account?{'X-RMT-Account':account}:{}),...(method==='GET'?{}:{'Content-Type':'application/json'})},
    ...(method==='GET'?{}:{body:'{}'})});
  const data:unknown=await response.json();
  if(!data||typeof data!=="object"||Array.isArray(data))throw Error("Invalid following response.");
  const body=data as Record<string,unknown>;
  if(!response.ok)throw Error(typeof body.error==='string'?body.error:'Following is unavailable. Try again.');
  return body;
}
function message(error:unknown){return error instanceof Error?error.message:'Check your connection and try again.';}
type FollowState={count:number;following:boolean};
function stateOf(body:Record<string,unknown>,account:string|null):FollowState{
  if(typeof body.count!=='number'||!Number.isSafeInteger(body.count)||body.count<0||(account&&typeof body.following!=='boolean'))throw Error('Could not verify the follower count.');
  return {count:body.count,following:body.following===true};
}
export function ProjectFollow({id,account,signIn,canSignIn}:{id:string;account:string|null;signIn:string;canSignIn:boolean}){
  const path='/api/following/'+encodeURIComponent(id);
  const [state,setState]=useState<FollowState|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[attempt,retry]=useState(0);
  const lock=useRef(false);
  useEffect(()=>{
    const controller=new AbortController();setError('');setState(null);
    request(path,account,'GET',controller.signal).then(body=>{if(!controller.signal.aborted)setState(stateOf(body,account));})
      .catch(e=>{if(!controller.signal.aborted)setError(message(e));});return()=>controller.abort();
  },[path,account,attempt]);
  async function toggle(){
    if(!state||!account||lock.current)return;
    lock.current=true;setBusy(true);setError('');
    try{const next=stateOf(await request(path,account,state.following?'DELETE':'PUT'),account);setState(next);window.dispatchEvent(new Event('rmt-follow-changed'));}
    catch(e){setState(null);setError(message(e));}finally{lock.current=false;setBusy(false);}
  }
  return <section className="project-follow" aria-label="Project following">
    <div><Radio size={18} aria-hidden="true"/><strong aria-live="polite">{state?state.count.toLocaleString()+' '+(state.count===1?'follower':'followers'):error?'Count unavailable':'Checking followersâ€¦'}</strong></div>
    {error?<><span role="alert">{error}</span><button type="button" className="button button-outline" onClick={()=>retry(n=>n+1)}>Refresh</button></>
    :account?<button type="button" className="button button-outline" aria-pressed={state?.following??false} disabled={!state||busy} onClick={()=>void toggle()}>{state?.following&&<Check size={15}/>}
    {busy?(state?.following?'Unfollowingâ€¦':'Followingâ€¦'):state?.following?'Following':'Follow project'}</button>
    :canSignIn?<a className="button button-outline" href={signIn} target="_top">Sign in to follow</a>:null}
  </section>;
}
export function FollowingLibrary({account,projects,onOpen}:{account:string;projects:Project[];onOpen:(p:Project)=>void}){
  const [ids,setIds]=useState<string[]|null>(null),[error,setError]=useState(''),[version,refresh]=useState(0);
  useEffect(()=>{const update=()=>refresh(v=>v+1);window.addEventListener('rmt-follow-changed',update);window.addEventListener('focus',update);
    return()=>{window.removeEventListener('rmt-follow-changed',update);window.removeEventListener('focus',update);};},[]);
  useEffect(()=>{const controller=new AbortController();setError('');
    request('/api/following',account,'GET',controller.signal).then(body=>{
      if(!Array.isArray(body.projectIds)||!body.projectIds.every((id:unknown)=>typeof id==='string'))throw Error('Could not verify your following list.');
      if(!controller.signal.aborted)setIds(body.projectIds);}).catch(e=>{if(!controller.signal.aborted){setIds(null);setError(message(e));}});
    return()=>controller.abort();},[account,version]);
  const byId=new Map(projects.map(p=>[p.id,p]));
  return <section className="library-home following-library" aria-label="Following"><h2><Radio size={21}/> Following</h2>
    {error?<p role="alert">{error} <button className="text-link" onClick={()=>refresh(v=>v+1)}>Retry</button></p>:ids===null?<p role="status">Loading followed projectsâ€¦</p>:ids.length===0?<p>Follow a project from its page to find it here. Save projects for quick launch.</p>:
    <ul>{ids.map(id=>{const p=byId.get(id);return p?<li key={id}><button onClick={()=>onOpen(p)}>{p.name}<ArrowUpRight size={16}/></button></li>:null;})}</ul>}
  </section>;
}
