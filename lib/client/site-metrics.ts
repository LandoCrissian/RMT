import {referralBucket,type Signal,type EventKind} from '../engagement';
let tabId='',browserId='',epoch=-1,countedDay='';
const counted=new Set<string>(),pending:Signal[]=[];
let timer:ReturnType<typeof setTimeout>|undefined,listening=false;
function permitted(){return typeof window!=='undefined'&&navigator.doNotTrack!=='1'&&!(navigator as Navigator&{globalPrivacyControl?:boolean}).globalPrivacyControl;}
function ids(){
  const period=Math.floor(Date.now()/(90*86400000));
  if(!tabId){
    try{tabId=sessionStorage.getItem('rmt-usage-session')||crypto.randomUUID();sessionStorage.setItem('rmt-usage-session',tabId);}
    catch{tabId=crypto.randomUUID();}
  }
  if(period!==epoch){
    epoch=period;
    try{
      const [oldPeriod,id]=String(localStorage.getItem('rmt-anonymous-browser')||'').split(':');
      browserId=Number(oldPeriod)===period&&id?id:crypto.randomUUID();
      localStorage.setItem('rmt-anonymous-browser',period+':'+browserId);
    }catch{browserId=tabId;}
  }
}
function flush(){
  clearTimeout(timer);timer=undefined;
  const events=pending.splice(0,24);
  if(events.length&&permitted())void fetch('/api/engagement',{method:'POST',credentials:'omit',referrerPolicy:'origin',
    headers:{'Content-Type':'application/json'},body:JSON.stringify({events,session:tabId,browser:browserId}),keepalive:true}).catch(()=>{});
  if(pending.length)timer=setTimeout(flush,50);
}
/** Optional measurement must never interrupt navigation or a member action. */
export function recordSiteMetric(kind:EventKind,projectId='',detail=''){
  if(!permitted())return;
  try{
    ids();
    const day=new Date().toISOString().slice(0,10);
    if(day!==countedDay){counted.clear();countedDay=day;}
    const dimension=kind==='project_view'||kind==='visit'?referralBucket(document.referrer,location.origin):detail;
    const key=[kind,projectId,dimension].join('|');
    if(counted.has(key)||pending.length>=48)return;
    counted.add(key);pending.push({kind,projectId,dimension});
    if(!listening){
      listening=true;window.addEventListener('pagehide',flush);
      document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')flush();});
    }
    if(!timer)timer=setTimeout(flush,120);
  }catch{/* Storage or telemetry unavailable. */}
}
