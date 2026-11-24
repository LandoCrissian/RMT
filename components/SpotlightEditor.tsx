'use client';

import {useEffect, useRef, useState} from 'react';
import {ArrowLeft, Save, Upload} from 'lucide-react';
import type {ControlProject, ControlProjectArtwork} from '@/lib/control-projects';
import {artworkListResponse, artworkResponse, controlProjectResponse, safeControlImage} from '@/lib/client/control';
import {prepareArtworkUpload} from '@/lib/client/project-artwork';
import {useControlMutation, useControlResource, type ControlApi} from '@/lib/client/use-control';
import {isSpotlight, spotlightFor, spotlightImage, type Spotlight} from '@/lib/spotlight';
import {PrivateArtwork} from './control-artwork';
import {ConfirmDialog, Field, SaveNotice, controlDate} from './control-primitives';

type Props = {api:ControlApi; item:ControlProject; onDirty:(dirty:boolean)=>void; onClose:()=>void; onReload:()=>Promise<void>; onToast:(text:string)=>void};

export default function SpotlightEditor({api,item,onDirty,onClose,onReload,onToast}:Props) {
  const project = item.project;
  const initial = spotlightFor(project);
  const [draft,setDraft] = useState(initial);
  const [enabled,setEnabled] = useState(isSpotlight(project));
  const [confirm,setConfirm] = useState(false);
  const [recent,setRecent] = useState<ControlProjectArtwork | null>(null);
  const [preparing,setPreparing] = useState(false);
  const [uploadError,setUploadError] = useState('');
  const work = useRef<AbortController | null>(null);
  const artPath = '/api/control/artwork?projectId=' + encodeURIComponent(project.id);
  const assets = useControlResource(api, artPath, artworkListResponse, 'artwork:'+project.id);
  const upload = useControlMutation(api,'artwork:'+project.id);
  const save = useControlMutation(api,'project:'+project.id);
  const busy = preparing || upload.busy || save.busy;
  const dirty = enabled !== isSpotlight(project) || JSON.stringify(draft) !== JSON.stringify(initial);
  useEffect(() => {onDirty(dirty || busy);},[dirty,busy,onDirty]);
  useEffect(() => () => {work.current?.abort(); onDirty(false);},[onDirty]);
  const banners = [...new Map([...(recent ? [recent] : []), ...(assets.data || [])].filter(a => a.kind==='banner').map(a => [a.id,a])).values()];
  const selected = banners.find(a => a.id === draft.artwork);
  const image = safeControlImage(spotlightImage(project,draft.artwork));
  function edit<K extends keyof Spotlight>(key:K, value:Spotlight[K]) {setDraft(current=>({...current,[key]:value}));}

  async function stage(file?:File) {
    if (!file || work.current || busy) return;
    const controller = new AbortController();
    work.current=controller; setPreparing(true); setUploadError('');
    try {
      const png=await prepareArtworkUpload(file,'banner',controller.signal);
      if (controller.signal.aborted) return;
      const asset=await upload.run(artPath+'&kind=banner','POST',undefined,artworkResponse,{rawBody:png,signal:controller.signal});
      if (asset && !controller.signal.aborted) {setRecent(asset); edit('artwork',asset.id);}
    } catch(error) {
      if (!controller.signal.aborted) setUploadError(error instanceof Error ? error.message : 'Could not prepare this banner.');
    } finally {work.current=null; if (!controller.signal.aborted) setPreparing(false);}
  }
  async function publish(reason:string) {
    const result=await save.run('/api/control/projects/'+encodeURIComponent(project.id),'PATCH',{
      action:'spotlight',featured:enabled,spotlight:draft,expectedRevision:item.revision,expectedListingRevision:item.listingRevision,reason,
    },controlProjectResponse);
    if (result) {setConfirm(false); await onReload(); onClose(); onToast('Homepage spotlight saved.');}
  }
  return <section className="cc-detail">
    <button type="button" className="cc-text-button" disabled={busy} onClick={onClose}><ArrowLeft size={16}/>{dirty ? 'Discard spotlight edits' : 'Back to project'}</button>
    <h3>{project.name} spotlight</h3>
    <form className="cc-project-form" onSubmit={event=>{event.preventDefault();setConfirm(true);}}>
      <fieldset disabled={busy || save.needsRefresh} className="spot-fields">
        <label className="cc-switch-row"><span><strong>Show in homepage spotlight</strong></span><input role="switch" type="checkbox" checked={enabled} onChange={e=>setEnabled(e.target.checked)}/></label>
        <div className="cc-fields-two">
          <Field label="Spotlight order" hint="Lower numbers appear first. Equal numbers sort by project ID."><input type="number" required min={1} max={9999} value={draft.position || ''} onChange={e=>edit('position',Number(e.target.value))}/></Field>
          <Field label="Accent border"><input type="color" value={draft.accent} onChange={e=>edit('accent',e.target.value)}/></Field>
        </div>
        <Field label="Headline"><input required maxLength={100} value={draft.headline} onChange={e=>edit('headline',e.target.value)}/></Field>
        <Field label="Description"><textarea required maxLength={280} value={draft.description} onChange={e=>edit('description',e.target.value)}/></Field>
        <Field label="Button label"><input required maxLength={90} value={draft.cta} onChange={e=>edit('cta',e.target.value)}/></Field>
        <Field label="Spotlight artwork"><select value={draft.artwork} onChange={e=>edit('artwork',e.target.value)}>
          <option value="cover">Current project cover</option>
          {(project.artwork?.logo || project.logo || draft.artwork==='logo') && <option value="logo">Project logo</option>}
          {project.id==='lammbs' && <option value="flock">Official LAMMBs skyline and Genesis portrait</option>}
          {banners.map(asset=><option key={asset.id} value={asset.id}>Banner · {controlDate(asset.createdAt,true)} · {asset.width} × {asset.height}</option>)}
          {!selected && !['cover','logo','flock'].includes(draft.artwork) && <option value={draft.artwork}>Saved spotlight banner</option>}
        </select></Field>
        {selected ? <PrivateArtwork api={api} asset={selected} kind="banner"/> : image && <div className="spot-art-preview" style={{borderColor:draft.accent}}><img src={image} alt="Selected spotlight artwork"/>{draft.artwork==='flock'&&<img className="spot-character" src="/projects/lammb-character.webp" alt="Genesis portrait"/>}</div>}
        <label className="cc-button cc-upload-button"><Upload size={16}/> {preparing ? 'Preparing banner…' : 'Upload spotlight banner'}<input type="file" accept="image/png,image/jpeg,image/webp" disabled={upload.needsRefresh} onChange={e=>{const file=e.target.files?.[0];e.target.value='';void stage(file);}}/></label>
        {(assets.error || uploadError || upload.error) && <div role="alert">{assets.error || uploadError || upload.error} <button className="cc-text-button" type="button" onClick={async()=>{if(await assets.reload()){upload.clear();setUploadError('');}}}>Reload artwork</button></div>}
        <button type="submit" className="cc-button cc-primary" disabled={!dirty}><Save size={16}/> Save spotlight</button>
      </fieldset>
    </form>
    <SaveNotice error={save.error} needsRefresh={save.needsRefresh} onReload={async()=>{await onReload();onClose();}} busy={busy}/>
    {confirm && <ConfirmDialog title="Save homepage spotlight?" description={'Apply these spotlight settings for '+project.name+'.'} confirmLabel="Save spotlight" busy={save.busy}
      error={save.error} needsRefresh={save.needsRefresh} onReload={async()=>{await onReload();onClose();}} onCancel={()=>setConfirm(false)} onConfirm={publish}/>}
  </section>;
}
