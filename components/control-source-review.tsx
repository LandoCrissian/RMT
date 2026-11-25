'use client';
import {useState} from 'react';
import {useControlResource,useControlMutation,type ControlApi} from '@/lib/client/use-control';
import {ConfirmDialog,ErrorPanel} from './control-primitives';

type Entry={id:string;projectName:string;sourceUrl:string;evidence:string;revision:number};
const path='/api/control/source-review';
function parse(value:unknown){const rows=(value as {suggestions:Entry[]})?.suggestions;if(!Array.isArray(rows))throw Error('Cannot read evidence.');return rows;}
export function SourceReview({api}:{api:ControlApi}){
 const resource=useControlResource(api,path,parse,'source-review'),mutation=useControlMutation(api,'source-review');
 const [decision,setDecision]=useState<{row:Entry;action:'reviewed'|'dismissed'}|null>(null);
 async function reload(){setDecision(null);mutation.clear();await resource.reload();}
 async function confirm(reason:string){if(!decision)return;
  const ok=await mutation.run(path,'PATCH',{id:decision.row.id,expectedRevision:decision.row.revision,action:decision.action,reason},v=>(v as {ok:boolean}).ok);
  if(ok)await reload();
 }
 return <details className="cc-panel"><summary>Project enrichment suggestions</summary>
 {resource.error?<ErrorPanel message={resource.error} onRetry={()=>void reload()}/>:!resource.data?<p>Loading source evidence…</p>:resource.data.length===0?<p>No pending source evidence.</p>:<>
 <p>Compare the evidence with the listing. Apply approved changes in Projects or Categories, then mark the evidence reviewed.</p>
 {resource.data.map(row=><article key={row.id} style={{overflowWrap:'anywhere'}}><h4>{row.projectName}</h4><a href={row.sourceUrl} target="_blank" rel="noreferrer">Official source</a><p style={{whiteSpace:'pre-line'}}>{row.evidence}</p>
 <button className="cc-button" onClick={()=>setDecision({row,action:'reviewed'})}>Mark reviewed</button> <button className="cc-button" onClick={()=>setDecision({row,action:'dismissed'})}>Dismiss</button></article>)}</>}
 {decision&&<ConfirmDialog title={decision.action==='reviewed'?'Mark evidence reviewed':'Dismiss evidence'} description={decision.row.projectName} busy={mutation.busy} error={mutation.error} needsRefresh={mutation.needsRefresh} onReload={()=>void reload()} onCancel={()=>{setDecision(null);mutation.clear();}} onConfirm={reason=>void confirm(reason)}/>}</details>;
}
