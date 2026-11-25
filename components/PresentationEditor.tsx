'use client';
import {useEffect,useRef,useState} from 'react';
import {ArrowLeft,Upload} from 'lucide-react';
import type {ControlProject,ControlProjectArtwork} from '@/lib/control-projects';
import {approvedPresentationImages,controlImageId,type ProjectPresentation} from '@/lib/project-presentation';
import {enrichProject} from '@/lib/project-enrichment';
import {projectSocialImagePath} from '@/lib/project-sharing';
import {artworkListResponse,artworkResponse,controlProjectResponse} from '@/lib/client/control';
import {prepareArtworkUpload} from '@/lib/client/project-artwork';
import {useControlMutation,useControlResource,type ControlApi} from '@/lib/client/use-control';
import {PrivateArtwork} from './control-artwork';
import {ConfirmDialog,Field,SaveNotice,controlDate} from './control-primitives';

type Props={api:ControlApi;item:ControlProject;onDirty:(dirty:boolean)=>void;onClose:()=>void;onReload:()=>Promise<void>;onToast:(text:string)=>void};
export default function PresentationEditor({api,item,onDirty,onClose,onReload,onToast}:Props){
  const project=item.project, initial=project.presentation??{};
  const [draft,setDraft]=useState<ProjectPresentation>(initial);
  const [confirm,setConfirm]=useState(false);
  const [recent,setRecent]=useState<ControlProjectArtwork[]>([]);
  const [uploadKind,setUploadKind]=useState<'banner'|'logo'>('banner');
  const [preparing,setPreparing]=useState(false),[uploadError,setUploadError]=useState('');
  const work=useRef<AbortController|null>(null);
  const path='/api/control/artwork?projectId='+encodeURIComponent(project.id);
  const list=useControlResource(api,path,artworkListResponse,'artwork:'+project.id);
  const upload=useControlMutation(api,'artwork:'+project.id),save=useControlMutation(api,'project:'+project.id);
  const busy=preparing||upload.busy||save.busy;
  const dirty=JSON.stringify(initial)!==JSON.stringify(draft);
  useEffect(()=>{onDirty(dirty||busy);},[dirty,busy,onDirty]);
  useEffect(()=>()=>{work.current?.abort();onDirty(false);},[onDirty]);
  const auto=enrichProject({...project,presentation:undefined});
  const available=[...new Map([...recent,...list.data??[]].map(asset=>[asset.id,asset])).values()];
  const choices=new Map(approvedPresentationImages(project).map(image=>[image.url,image.label]));
  for(const a of available)choices.set('/media/control-project-artwork/'+a.id,a.kind+' · '+controlDate(a.createdAt,true)+' · '+a.id.slice(0,8));
  function update<K extends keyof ProjectPresentation>(key:K,value:ProjectPresentation[K]){
    setDraft(old=>{const next={...old};if(value)next[key]=value;else delete next[key];return next;});
  }
  function changeLink(key:'labels'|'supporting',url:string,value:string){
    const entries={...draft[key]};if(value)entries[url]=value;else delete entries[url];
    update(key,Object.keys(entries).length?entries:undefined);
  }
  function artSelect(title:string,value:string|undefined,change:(url:string)=>void,automatic?:string){
    const url=value||automatic;
    const asset=url&&available.find(a=>a.id===controlImageId(url));
    return <div><Field label={title}><select value={value??''} onChange={e=>change(e.target.value)}>
      <option value="">Automatic</option>
      {value&&!choices.has(value)&&<option value={value}>Selected project artwork</option>}
      {[...choices].map(([src,label])=><option key={src} value={src}>{label}</option>)}
    </select></Field>{asset?<PrivateArtwork api={api} asset={asset} kind={asset.kind}/>:url?.startsWith('/')&&<img className="cc-presentation-image" src={url} alt={title+' preview'}/>}</div>;
  }
  async function stage(file?:File){
    if(!file||busy||work.current)return;
    const controller=new AbortController();work.current=controller;setPreparing(true);setUploadError('');
    try{
      const png=await prepareArtworkUpload(file,uploadKind,controller.signal);
      if(controller.signal.aborted)return;
      const asset=await upload.run(path+'&kind='+uploadKind,'POST',undefined,artworkResponse,{rawBody:png,signal:controller.signal});
      if(asset&&!controller.signal.aborted){setRecent(old=>[asset,...old]);onToast('Artwork ready to select.');}
    }catch(error){if(!controller.signal.aborted)setUploadError(error instanceof Error?error.message:'Could not prepare image.');}
    finally{work.current=null;if(!controller.signal.aborted)setPreparing(false);}
  }
  async function publish(reason:string){
    const result=await save.run('/api/control/projects/'+encodeURIComponent(project.id),'PATCH',{
      action:'presentation',presentation:draft,expectedRevision:item.revision,expectedListingRevision:item.listingRevision,reason,
    },controlProjectResponse);
    if(result){setConfirm(false);await onReload();onClose();onToast('Showcase presentation saved.');}
  }
  return <section className="cc-detail">
    <button className="cc-text-button" disabled={busy} onClick={onClose}><ArrowLeft size={16}/>{dirty?'Discard edits':'Back to project'}</button>
    <h3>{project.name} presentation</h3>
    <form className="cc-project-form" onSubmit={event=>{event.preventDefault();setConfirm(true);}}>
      <fieldset className="spot-fields" disabled={busy||save.needsRefresh}>
        <Field label="Short description" hint={'Automatic · '+auto.shortDescription}><textarea maxLength={280} value={draft.shortDescription??''} placeholder="Use automatic description" onChange={e=>update('shortDescription',e.target.value)}/></Field>
        {artSelect('Hero artwork',draft.hero,value=>update('hero',value),project.cover)}
        <Field label="Upload shape" hint={uploadKind==='banner'?'Landscape, at least 600 × 300 pixels, between 1.5:1 and 4:1.':'Square, at least 128 × 128 pixels.'}><select value={uploadKind} onChange={e=>setUploadKind(e.target.value==='logo'?'logo':'banner')}><option value="banner">Landscape</option><option value="logo">Square</option></select></Field>
        <label className="cc-button cc-upload-button"><Upload size={16}/>{preparing?'Preparing…':'Upload project artwork'}<input type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>{const file=e.target.files?.[0];e.target.value='';void stage(file);}}/></label>
        {(uploadError||upload.error||list.error)&&<p role="alert">{uploadError||upload.error||list.error}</p>}
        <h4>Destination labels and artwork</h4>
        {auto.destinations.map(link=><details key={link.url} className="cc-presentation-link"><summary>{draft.labels?.[link.url]||link.label}</summary>
          <Field label="Destination label" hint={link.url}><input maxLength={80} value={draft.labels?.[link.url]??''} placeholder={link.label} onChange={e=>changeLink('labels',link.url,e.target.value)}/></Field>
          {link.copy&&<p className="cc-muted">{link.copy}</p>}
          {artSelect('Supporting artwork',draft.supporting?.[link.url],value=>changeLink('supporting',link.url,value),link.image)}
        </details>)}
        <h4>Share card</h4>
        {item.publiclyAvailable&&<a href={projectSocialImagePath(project)} target="_blank" rel="noreferrer">View published card</a>}
        <Field label="Card selection"><select value={draft.cardMode??'auto'} onChange={e=>update('cardMode',e.target.value==='auto'?undefined:e.target.value as ProjectPresentation['cardMode'])}>
          <option value="auto">Automatic</option><option value="project">Project-specific with approved artwork</option><option value="fallback">RMT fallback</option></select></Field>
        <Field label="Card style"><select value={draft.cardStyle??''} onChange={e=>update('cardStyle',e.target.value as ProjectPresentation['cardStyle'])}><option value="">Automatic</option><option value="panorama">Panorama</option><option value="portrait">Portrait</option><option value="editorial">Editorial</option></select></Field>
        <Field label="Project and card accent"><input type="color" value={draft.accent??auto.accent} onChange={e=>update('accent',e.target.value)}/></Field>
        {draft.accent&&<button className="cc-text-button" type="button" onClick={()=>update('accent',undefined)}>Use automatic accent</button>}
        <details className="cc-presentation-link"><summary>Automatic field sources</summary><dl>{Object.entries(auto.sources).map(([field,source])=><div key={field}><dt>{field}</dt><dd>{source.kind}{source.url&&<> · <a href={source.url} target="_blank" rel="noreferrer">Source</a></>}</dd></div>)}</dl></details>
        {Object.keys(draft).length>0&&<button className="cc-text-button" type="button" onClick={()=>setDraft({})}>Reset all to automatic</button>}
        <button className="cc-button cc-primary" disabled={!dirty} type="submit">Review presentation changes</button>
      </fieldset>
    </form>
    <SaveNotice error={save.error} needsRefresh={save.needsRefresh} onReload={async()=>{await onReload();onClose();}} busy={busy}/>
    {confirm&&<ConfirmDialog title="Publish presentation changes?" description={'Apply the selected copy, artwork and card settings to '+project.name+'.'} confirmLabel="Save presentation" busy={save.busy} error={save.error} needsRefresh={save.needsRefresh} onReload={async()=>{await onReload();onClose();}} onConfirm={publish} onCancel={()=>setConfirm(false)}/>}
  </section>;
}
