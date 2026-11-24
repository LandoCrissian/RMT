'use client';
import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {ControlRequestError,controlResponseData} from './control';

type Session={authenticated:boolean;isAdmin:boolean;userId:string|null;emailVerified?:boolean};
type Options={signal?:AbortSignal;scope?:string;responseFormat?:'csv'|'image';rawBody?:Blob};
export function useControlApi(session:Session){
  const key=session.authenticated&&session.isAdmin&&session.emailVerified!==false?session.userId:null;
  const current=useRef(key);current.current=key;
  const controllers=useRef(new Set<AbortController>());
  const unresolved=useRef(new Set<string>());
  const [denied,setDenied]=useState('');
  useEffect(()=>{setDenied('');unresolved.current.clear();return()=>{for(const controller of controllers.current)controller.abort();controllers.current.clear();};},[key]);
  const request=useCallback(async<T,>(path:string,parse:(value:unknown)=>T,method='GET',body?:unknown,options:Options={}):Promise<T>=>{
    if(!key||current.current!==key||denied)throw new ControlRequestError('Refresh your administrator account to continue.',false,true);
    const route=new URL(path,'https://rmt-control.invalid');
    if(route.origin!=='https://rmt-control.invalid'||!/^\/api\/control\/[a-z0-9_/%.-]+$/i.test(route.pathname))throw new ControlRequestError('This control request is not available.');
    const mutation=method!=='GET';const scope=options.scope??path.split('?')[0];
    if(mutation&&unresolved.current.has(scope))throw new ControlRequestError('Reload the saved version before making another change.',true);
    const controller=new AbortController();controllers.current.add(controller);
    const abort=()=>controller.abort();options.signal?.addEventListener('abort',abort,{once:true});if(options.signal?.aborted)controller.abort();
    try{
      const response=await fetch(path,{method,credentials:'same-origin',cache:'no-store',redirect:'error',signal:controller.signal,headers:{'X-RMT-Account':key,...(mutation?{'Content-Type':options.rawBody?.type||'application/json'}:{})},...(mutation?{body:options.rawBody??JSON.stringify(body)}:{})});
      let data:unknown;
      if(options.responseFormat==='csv'&&response.ok){if(!response.headers.get('content-type')?.startsWith('text/csv'))throw new ControlRequestError('The export could not be verified. Try again.');data={csv:await response.text(),nextCursor:response.headers.get('X-RMT-Next-Cursor')||null,hasMore:response.headers.get('X-RMT-Has-More')==='true'};}
      else if(options.responseFormat==='image'&&response.ok){if(response.headers.get('content-type')?.split(';')[0]!=='image/png')throw new ControlRequestError('The private image preview could not be verified.');data=await response.blob();}
      else data=await controlResponseData(response,mutation);
      let result:T;try{result=parse(data);}catch(cause){if(mutation)throw new ControlRequestError('We could not confirm the saved version. Reload it before making another change.',true);throw cause;}
      if(controller.signal.aborted||current.current!==key)throw new DOMException('The account changed.','AbortError');
      if(!mutation)unresolved.current.delete(scope);else window.dispatchEvent(new Event('rmt-control-changed'));return result;
    }catch(cause){
      if(controller.signal.aborted||current.current!==key)throw new DOMException('The request was cancelled.','AbortError');
      const error=cause instanceof ControlRequestError?cause:new ControlRequestError(mutation?'The connection was interrupted. Your change may have saved. Reload the saved version to check.':'This section could not be loaded. Check your connection and try again.',mutation);
      if(error.accountChanged){for(const pending of controllers.current)pending.abort();setDenied(error.message);}
      else if(error.needsRefresh&&mutation)unresolved.current.add(scope);
      throw error;
    }finally{controllers.current.delete(controller);options.signal?.removeEventListener('abort',abort);}
  },[key,denied]);
  return useMemo(()=>({key,denied,request}),[key,denied,request]);
}
export type ControlApi=ReturnType<typeof useControlApi>;
export function useControlResource<T>(api:ControlApi,path:string|null,parse:(value:unknown)=>T,scope?:string){
  const [state,setState]=useState<{key:string|null;path:string|null;data:T|null;loading:boolean;error:string}>({key:api.key,path,data:null,loading:Boolean(path),error:''});
  const generation=useRef(0),controller=useRef<AbortController|null>(null);
  const reload=useCallback(async()=>{
    if(!path||!api.key||api.denied)return null;
    controller.current?.abort();const pending=new AbortController();controller.current=pending;const sequence=++generation.current;
    setState(previous=>({key:api.key,path,data:previous.key===api.key&&previous.path===path?previous.data:null,loading:true,error:''}));
    try{const data=await api.request(path,parse,'GET',undefined,{signal:pending.signal,scope});if(pending.signal.aborted||sequence!==generation.current)return null;setState({key:api.key,path,data,loading:false,error:''});return data;}
    catch(cause){if(pending.signal.aborted||sequence!==generation.current)return null;setState({key:api.key,path,data:null,loading:false,error:cause instanceof Error?cause.message:'This section could not be loaded.'});return null;}
  },[api,path,parse,scope]);
  useEffect(()=>{void reload();return()=>{generation.current++;controller.current?.abort();};},[reload]);
  return {...(state.key===api.key&&state.path===path?state:{key:api.key,path,data:null,loading:Boolean(path),error:''}),reload};
}
export function useControlMutation(api:ControlApi,scope:string){
  const lock=useRef(false),mounted=useRef(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[needsRefresh,setNeedsRefresh]=useState(false);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  const run=async<T,>(path:string,method:string,body:unknown,parse:(value:unknown)=>T,options:Omit<Options,'scope'>={}):Promise<T|null>=>{
    if(lock.current||needsRefresh)return null;lock.current=true;setBusy(true);setError('');
    try{const value=await api.request(path,parse,method,body,{...options,scope});return mounted.current?value:null;}
    catch(cause){if(mounted.current&&!(cause instanceof DOMException&&cause.name==='AbortError')){setError(cause instanceof Error?cause.message:'The change could not be confirmed.');setNeedsRefresh(cause instanceof ControlRequestError&&cause.needsRefresh);}return null;}
    finally{lock.current=false;if(mounted.current)setBusy(false);}
  };
  return {busy,error,needsRefresh,run,clear:()=>{setError('');setNeedsRefresh(false);}};
}
