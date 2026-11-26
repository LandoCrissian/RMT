'use client';

import {useEffect,useLayoutEffect,useId,useRef,useState,type ReactNode} from 'react';
import {ArrowLeft,ArrowRight,BookOpen,X} from 'lucide-react';
import {followPublicLink} from './public-link';

type Progress={index:number;status:'reading'|'dismissed'|'skipped'|'completed'};
const beginning:Progress={index:0,status:'reading'};

function readProgress(key:string):Progress{
  try{
    const saved=JSON.parse(localStorage.getItem(key)??'null');
    if(saved&&Number.isSafeInteger(saved.index)&&saved.index>=0&&
      ['reading','dismissed','skipped','completed'].includes(saved.status))return saved;
  }catch{/* Browsing works with storage disabled. */}
  return beginning;
}

type Props={
  account:string|null;items:{title:string;body:string}[];error:string;
  onOpen:()=>void;onOutcome:(result:'completed'|'skipped')=>void;
  completion?:ReactNode;
};
export default function DiscoveryGuide({account,items,error,onOpen,onOutcome,completion}:Props){
  const key='rmt.guide.v1.'+(account?'member.'+account:'guest');
  const [progress,setProgress]=useState<Progress>(beginning);
  const [opened,setOpened]=useState(false),[finished,setFinished]=useState(false);
  const trigger=useRef<HTMLAnchorElement>(null),dialog=useRef<HTMLDialogElement>(null);
  const heading=useRef<HTMLHeadingElement>(null),position=useRef({x:0,y:0});
  const titleId=useId(),dialogId=useId();
  const index=Math.min(progress.index,Math.max(0,items.length-1)),lesson=items[index];
  useEffect(()=>{setProgress(readProgress(key));},[key]);
  function remember(next:Progress){
    setProgress(next);
    try{localStorage.setItem(key,JSON.stringify(next));}catch{/* Keep in-memory progress. */}
  }
  function open(){
    position.current={x:window.scrollX,y:window.scrollY};
    if(progress.status==='completed')remember(beginning);
    setFinished(false);setOpened(true);onOpen();
  }
  useLayoutEffect(()=>{
    if(!opened)return;
    const panel=dialog.current!,root=document.documentElement,body=document.body;
    const previousRoot=root.style.overflow,previousBody=body.style.overflow;
    const {x,y}=position.current;
    panel.showModal();
    root.style.overflow='hidden';body.style.overflow='hidden';
    return ()=>{
      panel.close();root.style.overflow=previousRoot;body.style.overflow=previousBody;
      trigger.current?.focus({preventScroll:true});
      window.scrollTo({left:x,top:y,behavior:'instant'});
    };
  },[opened]);
  useEffect(()=>{
    if(opened){heading.current?.focus({preventScroll:true});dialog.current?.querySelector('.guide-content')?.scrollTo(0,0);}
  },[opened,index,lesson?.title,finished]);
  function close(){
    if(!finished)remember({index:lesson?index:progress.index,status:'dismissed'});
    setOpened(false);
  }
  function skip(){
    remember({index:lesson?index:progress.index,status:'skipped'});onOutcome('skipped');setOpened(false);
  }
  function next(){
    if(index+1<items.length){remember({index:index+1,status:'reading'});return;}
    remember({index,status:'completed'});onOutcome('completed');
    if(completion)setFinished(true);else setOpened(false);
  }
  return <section className="discovery-guide" aria-label="Beginner guide">
    <a className="guide-entry-button" href="/guide" ref={trigger} onClick={event => followPublicLink(event, open)}
      aria-haspopup="dialog" aria-controls={dialogId} aria-expanded={opened}>
      <BookOpen size={18} aria-hidden="true"/><span>Beginner guide</span>
      {progress.status==='completed'?<span className="sr-only">Review completed guide</span>:progress.index>0?<span className="sr-only">Resume lesson {progress.index+1}</span>:null}
      <ArrowRight size={15} aria-hidden="true"/>
    </a>
    {opened&&<dialog className="guide-dialog" id={dialogId} ref={dialog} aria-labelledby={titleId}
      onCancel={event=>{event.preventDefault();close();}}>
      <div className="guide-shell"><header><span><BookOpen size={18}/> Beginner guide</span>
        <button type="button" aria-label="Close beginner guide" onClick={close}><X size={20}/>Close</button></header>
      <div className="guide-content">
        {finished?<><h2 id={titleId} ref={heading} tabIndex={-1}>Guide complete</h2>{completion}</>:
        error?<><h2 id={titleId} ref={heading} tabIndex={-1}>Guide unavailable</h2><p role="alert">{error}</p><button className="button button-outline" onClick={onOpen}>Retry</button></>:
        lesson?<><p className="guide-progress">Lesson {index+1} of {items.length}</p><progress aria-label="Lesson progress" value={index+1} max={items.length}/>
        <h2 id={titleId} tabIndex={-1} ref={heading}>{lesson.title}</h2><p>{lesson.body}</p></>:
        <h2 id={titleId} ref={heading} tabIndex={-1} role="status">Loading guide…</h2>}
      </div>
      {!finished&&<footer><button className="text-link" type="button" onClick={skip}>Skip guide</button>
        {lesson&&!error&&<><button className="button button-outline" type="button" disabled={index===0} onClick={()=>remember({index:index-1,status:'reading'})}><ArrowLeft size={15}/> Back</button>
        <button className="button button-lime" type="button" onClick={next}>{index+1===items.length?'Finish guide':'Next'} <ArrowRight size={15}/></button></>}</footer>}
      </div>
    </dialog>}
  </section>;
}
