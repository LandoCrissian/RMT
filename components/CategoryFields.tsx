'use client';
import type {TaxonomyCategory} from '@/lib/taxonomy';
export default function CategoryFields({choices,ids,onChange}:{choices:TaxonomyCategory[];ids:string[];onChange:(ids:string[])=>void}){
 const active=choices.filter(c=>!c.archived);
 return <fieldset className="taxonomy-fields"><legend>Project categories</legend>
 <label className="st-field">Primary category<select required value={ids[0]??''} onChange={e=>onChange([e.target.value,...ids.slice(1).filter(id=>id!==e.target.value)])}>
 <option value="" disabled>Choose a category</option>{active.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
 <fieldset disabled={!ids[0]}><legend>Secondary categories</legend>{active.filter(c=>c.id!==ids[0]).map(c=><label key={c.id}><input type="checkbox" checked={ids.slice(1).includes(c.id)} onChange={e=>onChange(e.target.checked?[...ids,c.id]:ids.filter(id=>id!==c.id))}/>{c.name}</label>)}</fieldset></fieldset>;
}
