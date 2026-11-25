'use client';
import {useState} from 'react';
import {useControlResource,type ControlApi} from '@/lib/client/use-control';
import type {TaxonomyCategory,Classification} from '@/lib/taxonomy';
import {Loading,ErrorPanel} from './control-primitives';
import CategoryFields from './CategoryFields';
import type {Suggestion} from '@/lib/category-suggestions.mjs';
const path='/api/control/taxonomy';
type Entry={id:string;name:string;classification?:Classification;suggestions:Suggestion[];sourceUrls:string[]};
type Workspace={revision:number;categories:(TaxonomyCategory&{total:number})[];projects:Entry[]};
function parse(value:unknown){const data=value as Workspace;if(!Array.isArray(data?.projects)||!Array.isArray(data?.categories)||!Number.isInteger(data.revision))throw Error('Invalid category data.');return data;}
export default function ControlTaxonomy({api}:{api:ControlApi}){
 const state=useControlResource(api,path,parse);
 const [notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
 async function save(fields:object){if(busy||!state.data)return;setBusy(true);setNotice('');try{
 await api.request(path,v=>{if(!(v as {saved:boolean}).saved)throw Error();return true;},'PATCH',{...fields,revision:state.data.revision});
 await state.reload();setNotice('Categories saved.');
 }catch(e){setNotice(e instanceof Error?e.message:'Could not save.');}finally{setBusy(false);}}
 return <section className="cc-section"><h2>Project categories</h2>{state.error?<ErrorPanel message={state.error} onRetry={()=>void state.reload()}/>:!state.data?<Loading label="Loading categories…"/>:
 <fieldset disabled={busy}><Editors key={state.data.revision} data={state.data} save={save}/></fieldset>}<p role="status">{notice}</p></section>;
}
function Editors({data,save}:{data:Workspace;save:(fields:object)=>Promise<void>}){
 const [key,setKey]=useState(''),[project,setProject]=useState(data.projects[0]?.id??'');
 const row=data.categories.find(c=>c.id===key),p=data.projects.find(p=>p.id===project);
 return <div className="cc-settings-form"><section><h3>Category settings</h3><label>Category<select value={key} onChange={e=>setKey(e.target.value)}><option value="">New category</option>{data.categories.map(c=><option key={c.id} value={c.id}>{c.name} ({c.total}){c.archived?' · archived':''}</option>)}</select></label>
 <form key={key} onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget),name=String(f.get('name')).trim();void save({action:row?'edit':'create',id:row?.id??('cat-'+crypto.randomUUID()),name,position:Number(f.get('position')),archived:f.has('archived')});}}>
 <label>Name<input required maxLength={60} defaultValue={row?.name} name="name"/></label><label>Sort position<input required type="number" min={0} max={10000} defaultValue={row?.position??data.categories.length} name="position"/></label>
 <label><input type="checkbox" name="archived" defaultChecked={!!row?.archived}/>Archive category</label><button className="cc-button cc-primary">Save category</button></form></section>
 <section><h3>Review project classification</h3><label>Project<select value={project} onChange={e=>setProject(e.target.value)}>{data.projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
 {p&&<Assignment key={p.id} project={p} choices={data.categories} save={save}/>}</section></div>;
}
function Assignment({project:p,choices,save}:{project:Entry;choices:TaxonomyCategory[];save:(fields:object)=>Promise<void>}){
 const [ids,setIds]=useState(p.classification?[p.classification.primary,...p.classification.secondary]:[]);
 const [imported,setImported]=useState<Suggestion[]>([]),[error,setError]=useState('');
 return <><CategoryFields ids={ids} choices={choices} onChange={setIds}/>
 <details><summary>Review source suggestions</summary><label>Enrichment review file<input type="file" accept=".json" onChange={async e=>{setImported([]);setError('');try{const f=e.target.files?.[0];if(!f)return;if(f.size>2000000)throw Error();const entries=JSON.parse(await f.text())[p.id];if(!Array.isArray(entries))throw Error();
 const {suggestCategories}=await import('@/lib/category-suggestions.mjs');
 setImported(suggestCategories(entries.filter(r=>p.sourceUrls.includes(r?.url))));}catch{setError('Choose an enrichment file containing this project.');}}}/></label>{error&&<p role="alert">{error}</p>}
 {[...new Map([...p.suggestions,...imported].map(s=>[s.id,s])).values()].map(s=><p key={s.id}><strong>{choices.find(c=>c.id===s.id)?.name}</strong> — {s.evidence} <a href={s.source} target="_blank" rel="noreferrer">Official source</a></p>)}
 {!p.suggestions.length&&!imported.length&&<p>No verified source suggestions available.</p>}</details>
 <button className="cc-button cc-primary" disabled={!ids.length} onClick={()=>void save({action:'assign',id:p.id,ids})}>Approve classification</button></>;
}
