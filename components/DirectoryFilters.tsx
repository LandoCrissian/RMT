'use client';

import {useId, useLayoutEffect, useRef, useState} from 'react';
import {ChevronDown, SlidersHorizontal, X} from 'lucide-react';
import {matchesDirectoryCategory, searchProjects} from '@/lib/project-search';
import type {Project} from '@/lib/catalog';
import type {TaxonomyCategory} from '@/lib/taxonomy';
import './directory-filters.css';

type Props = {
  categories: TaxonomyCategory[];
  selected: string[];
  onApply: (ids: string[]) => void;
  projects: Project[];
  query: string;
  savedIds?: readonly string[];
};

export default function DirectoryFilters({categories,selected,onApply,projects,query,savedIds}: Props) {
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDialogElement>(null);
  const [open,setOpen] = useState(false);
  const [draft,setDraft] = useState<string[]>([]);
  const title = useId();
  const dialogId = useId();
  const applied = categories.filter(category => selected.includes(category.id));
  const pending = categories.filter(category => draft.includes(category.id)).map(category => category.id);
  const scope = open ? searchProjects(projects,{query,savedIds}) : [];
  const matches = scope.filter(project => !pending.length || pending.some(id => matchesDirectoryCategory(project,id))).length;
  useLayoutEffect(() => {
    if (!open) return;
    const dialog = panel.current!;
    const anchor = trigger.current!;
    const previousOverflow = document.documentElement.style.overflow;
    function position() {
      const rect = anchor.getBoundingClientRect();
      const availableHeight = Math.min(innerHeight-24,530);
      dialog.style.setProperty('--filter-x',Math.max(12,Math.min(rect.left,innerWidth-400))+'px');
      dialog.style.setProperty('--filter-y',Math.max(12,Math.min(rect.bottom+6,innerHeight-availableHeight-12))+'px');
    }
    position();
    dialog.showModal();
    document.documentElement.style.overflow='hidden';
    window.addEventListener('resize',position);
    return () => {
      window.removeEventListener('resize',position);
      dialog.close();
      document.documentElement.style.overflow=previousOverflow;
      anchor.focus({preventScroll:true});
    };
  },[open]);
  function begin() {setDraft(selected);setOpen(true);}
  return <div className="directory-filter">
    <button ref={trigger} className="filter-trigger" type="button" aria-haspopup="dialog" aria-expanded={open} aria-controls={dialogId} onClick={begin}>
      <SlidersHorizontal size={15}/>Filters{applied.length>0&&<span>{applied.length}</span>}<ChevronDown size={13}/>
    </button>
    {applied.length>0&&<div className="applied-categories" role="group" aria-label="Applied categories">
      {applied.slice(0,2).map(category => <button key={category.id} type="button" aria-label={'Remove '+category.name+' filter'} onClick={()=>onApply(selected.filter(id=>id!==category.id))}>{category.name}<X size={13}/></button>)}
      {applied.length>2&&<button type="button" aria-label={'View all '+applied.length+' applied categories'} onClick={begin}>+{applied.length-2}</button>}
    </div>}
    {open&&<dialog className="category-panel" ref={panel} id={dialogId} aria-labelledby={title} onCancel={event=>{event.preventDefault();setOpen(false);}} onClick={event=>{if(event.target===event.currentTarget){const box=event.currentTarget.getBoundingClientRect();if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom)setOpen(false);}}}>
      <header><div><h2 id={title}>Categories</h2><p>Show projects in any selected category.</p></div><button type="button" className="filter-close" aria-label="Close filters" onClick={()=>setOpen(false)}><X size={19}/></button></header>
      <div className="category-choices">
        {categories.map(category => {
          const count=scope.filter(project=>matchesDirectoryCategory(project,category.id)).length;
          return <label key={category.id}>
            <input type="checkbox" checked={pending.includes(category.id)} onChange={event=>setDraft(event.target.checked?[...pending,category.id]:pending.filter(id=>id!==category.id))}/>
            <span>{category.name}</span><small aria-label={count+' matching projects'}>{count}</small>
          </label>;
        })}
      </div>
      <footer><button type="button" className="filter-clear" disabled={!pending.length} onClick={()=>setDraft([])}>Clear</button><button type="button" className="button button-lime" onClick={()=>{onApply(pending);setOpen(false);}}>Apply <span>({matches})</span></button></footer>
    </dialog>}
  </div>;
}
