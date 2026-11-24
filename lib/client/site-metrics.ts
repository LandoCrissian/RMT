let tabId:string|null=null;
const counted=new Set<string>();
function permitted(){return typeof window!=='undefined'&&navigator.doNotTrack!=='1'&&!(navigator as Navigator&{globalPrivacyControl?:boolean}).globalPrivacyControl;}
/** Optional aggregate usage only. A failure must never interfere with opening a project. */
export function recordSiteMetric(kind:'visit'|'project_view'|'outbound',projectId=''){
  if(!permitted())return;
  const key=[new Date().toISOString().slice(0,10),kind,projectId].join('|');if(counted.has(key))return;
  try{
    if(!tabId){tabId=window.sessionStorage.getItem('rmt-usage-session');if(!tabId){tabId=crypto.randomUUID();window.sessionStorage.setItem('rmt-usage-session',tabId);}}
  }catch{try{tabId??=crypto.randomUUID();}catch{return;}}
  counted.add(key);
  void fetch('/api/metrics',{method:'POST',credentials:'omit',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind,projectId,sessionId:tabId}),keepalive:true}).catch(()=>{});
}
