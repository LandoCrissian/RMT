'use client';
import {useEffect,useState} from 'react';
import {ArrowRight} from 'lucide-react';
import type {DiscoveryPage} from '@/lib/client/discovery';

export default function InterestPicker({page,busy,onSave}:{page:Pick<DiscoveryPage,'interests'|'categories'|'categoryLabels'>;busy:boolean;onSave:(values:string[])=>Promise<boolean>}) {
  const [open,setOpen]=useState(false);
  const [selected,setSelected]=useState(page.interests);
  useEffect(()=>{setSelected(page.interests);},[page.interests]);
  async function save(values:string[]) {
    if(await onSave(values))setOpen(false);
  }
  return <section className="activity-profile-card interest-picker">
    <h2>Your interests</h2>
    {open?<><fieldset disabled={busy}><legend>Choose the topics you want to follow.</legend>
      {page.categories.map(category=><label key={category}><input type="checkbox" checked={selected.includes(category)} onChange={event=>setSelected(current=>event.target.checked?[...current,category]:current.filter(value=>value!==category))}/>{page.categoryLabels[category]}</label>)}</fieldset>
      <div className="preference-actions"><button type="button" disabled={busy} onClick={()=>void save(selected)}>Save interests</button>
      <button type="button" disabled={busy} onClick={()=>{setSelected(page.interests);setOpen(false);}}>Cancel</button></div>
      {(page.interests.length>0)&&<button type="button" disabled={busy} onClick={()=>void save([])}>Reset interests</button>}</>
    :<><p>{page.interests.length?page.interests.map(id=>page.categoryLabels[id]).join(' · '):'Choose topics for your For You feed. Your selections are private.'}</p><button type="button" onClick={()=>setOpen(true)}>Edit interests <ArrowRight size={15}/></button></>}
  </section>;

}
