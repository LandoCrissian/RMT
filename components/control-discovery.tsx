'use client';
import {useEffect,useState} from 'react';
import {BookOpen,CheckCheck,SkipForward} from 'lucide-react';
import {useControlResource,useControlMutation,type ControlApi} from '@/lib/client/use-control';
import {ConfirmDialog,ErrorPanel,Field,Loading,PanelHeading,SaveNotice,StatCard} from './control-primitives';

type Config={revision:number;categories:string[];lessons:{title:string;body:string}[];recommendedIds:string[]};
type Workspace={options:{id:string;name:string}[];config:Config;projects:{id:string;name:string}[];stats:{completed:number;skipped:number;reads:number}};
const path='/api/control/discovery';
const record=(v:unknown):v is Record<string,unknown>=>Boolean(v&&typeof v==='object'&&!Array.isArray(v));
const strings=(v:unknown):v is string[]=>Array.isArray(v)&&v.every(s=>typeof s==='string');
const count=(v:unknown)=>Number.isSafeInteger(v)&&Number(v)>=0;
function config(v:unknown):Config {
  if(!record(v)||!count(v.revision)||!strings(v.categories)||!strings(v.recommendedIds)||!Array.isArray(v.lessons)||
     !v.lessons.every(l=>record(l)&&typeof l.title==='string'&&typeof l.body==='string'))throw Error('Invalid discovery settings.');
  return v as Config;
}
function workspace(v:unknown):Workspace {
  if(!record(v)||!Array.isArray(v.options)||!v.options.every(o=>record(o)&&typeof o.id==='string'&&typeof o.name==='string')||!Array.isArray(v.projects)||!v.projects.every(p=>record(p)&&typeof p.id==='string'&&typeof p.name==='string')||
    !record(v.stats)||![v.stats.completed,v.stats.skipped,v.stats.reads].every(count))throw Error('Invalid discovery workspace.');
  config(v.config);
  return v as Workspace;
}
function toggle(values:string[],id:string){return values.includes(id)?values.filter(item=>item!==id):[...values,id];}

export default function ControlDiscovery({api,onDirty,onToast}:{api:ControlApi;onDirty:(dirty:boolean)=>void;onToast:(text:string)=>void}) {
  const saved=useControlResource(api,path,workspace,'discovery'),mutation=useControlMutation(api,'discovery');
  const [draft,setDraft]=useState<Config|null>(null),[review,setReview]=useState(false);
  const dirty=!!draft&&JSON.stringify(draft)!==JSON.stringify(saved.data?.config);
  useEffect(()=>{onDirty(dirty);return()=>onDirty(false);},[dirty,onDirty]);
  const data=saved.data,form=draft??data?.config;
  async function reload(){const next=await saved.reload();if(next){setDraft(null);mutation.clear();setReview(false);}}
  async function save(reason:string){
    if(!form)return;
    const {revision,...fields}=form;
    const next=await mutation.run(path,'PATCH',{...fields,expectedRevision:revision,reason},config);
    if(next){setDraft(null);setReview(false);onToast('Discovery settings saved.');await saved.reload();}
  }
  if(saved.error)return <ErrorPanel message={saved.error} onRetry={()=>void saved.reload()}/>;
  if(!data||!form)return <Loading label="Loading discovery settings…"/>;
  const locked=mutation.busy||mutation.needsRefresh||saved.loading;
  const updateLesson=(index:number,key:'title'|'body',value:string)=>setDraft({...form,lessons:form.lessons.map((lesson,i)=>i===index?{...lesson,[key]:value}:lesson)});
  return <section className="cc-section"><PanelHeading title="Discovery" description="Manage the beginner guide, available interests and editorial project picks."/>
    <div className="cc-stats cc-stats-three">
      <StatCard label="Guide completed" value={data.stats.completed} detail="Latest choice per member" icon={<BookOpen size={20}/>}/>
      <StatCard label="Guide skipped" value={data.stats.skipped} detail="Latest choice per member" icon={<SkipForward size={20}/>}/>
      <StatCard label="Notifications read" value={data.stats.reads} detail="Member and update pairs marked read" icon={<CheckCheck size={20}/>}/>
    </div>
    <form className="cc-settings-form" onSubmit={e=>{e.preventDefault();setReview(true);}}>
      <section className="cc-panel"><h3>Beginner guide</h3>
        {form.lessons.map((lesson,i)=><fieldset key={i} disabled={locked}><legend>Lesson {i+1}</legend>
          <Field label="Title"><input required maxLength={90} value={lesson.title} onChange={e=>updateLesson(i,'title',e.target.value)}/></Field>
          <Field label="Explanation"><textarea required rows={3} maxLength={1000} value={lesson.body} onChange={e=>updateLesson(i,'body',e.target.value)}/></Field>
          <button type="button" className="cc-button" disabled={form.lessons.length===1} onClick={()=>setDraft({...form,lessons:form.lessons.filter((_,j)=>j!==i)})}>Remove lesson {i+1}</button>
        </fieldset>)}
        <button type="button" className="cc-button" disabled={locked||form.lessons.length>=10} onClick={()=>setDraft({...form,lessons:[...form.lessons,{title:'',body:''}]})}>Add lesson</button>
      </section>
      <section className="cc-panel"><h3>Interest categories</h3><p>Choose which directory categories members can select for discovery.</p>
        {data.options.map(c=><label key={c.id} className="cc-switch-row"><span>{c.name}</span><input type="checkbox" checked={form.categories.includes(c.id)} disabled={locked} onChange={()=>setDraft({...form,categories:toggle(form.categories,c.id)})}/></label>)}
      </section>
      <section className="cc-panel"><h3>Editorial recommendations</h3><p>Choose up to 12 public projects. Picks are labeled in discovery.</p>
        <details><summary>Select projects ({form.recommendedIds.length} selected)</summary>
        {data.projects.map(p=><label className="cc-switch-row" key={p.id}><span>{p.name}</span><input type="checkbox" checked={form.recommendedIds.includes(p.id)} disabled={locked||(!form.recommendedIds.includes(p.id)&&form.recommendedIds.length>=12)} onChange={()=>setDraft({...form,recommendedIds:toggle(form.recommendedIds,p.id)})}/></label>)}
        {form.recommendedIds.filter(id=>!data.projects.some(p=>p.id===id)).map(id=><button className="cc-button" type="button" key={id} disabled={locked} onClick={()=>setDraft({...form,recommendedIds:toggle(form.recommendedIds,id)})}>Remove unavailable project {id}</button>)}
        </details>
      </section>
      <SaveNotice error={mutation.error} busy={mutation.busy} needsRefresh={mutation.needsRefresh} onReload={()=>void reload()}/>
      <button className="cc-button cc-primary" type="submit" disabled={!dirty||locked}>Review changes</button>
    </form>
    {review&&<ConfirmDialog title="Publish discovery settings?" description="The guide, interest options and editorial picks will update for visitors and members." confirmLabel="Save changes" busy={mutation.busy} error={mutation.error} needsRefresh={mutation.needsRefresh} onReload={()=>void reload()} onCancel={()=>setReview(false)} onConfirm={reason=>void save(reason)}/>}
  </section>;
}
