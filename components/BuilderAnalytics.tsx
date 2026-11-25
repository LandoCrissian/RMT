'use client';
import {useEffect,useState} from 'react';
import {ArrowLeft,RefreshCw} from 'lucide-react';
import {periods,type BuilderReport,type AnalyticsPeriod,type ProjectMetrics} from '@/lib/builder-analytics';
import {readApiResponse} from './studio-shared';
import './builder-analytics.css';

const integers=new Intl.NumberFormat('en');
const number=(n:number)=>integers.format(n);
const formatDay=(day:string)=>new Date(day+'T00:00:00Z').toLocaleDateString('en',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'});
function diff(value:number,previous:number){const d=value-previous;return (d>0?'+':'')+number(d)+' vs previous period';}
function Metric({title,value,detail,delta}:{title:string;value:string;detail?:string;delta?:string}){
  return <div className="ba-metric"><h3>{title}</h3><strong>{value}</strong>{delta&&<small>{delta}</small>}{detail&&<span>{detail}</span>}</div>;
}
function Breakdown({title,values,empty}:{title:string;values:BuilderReport['sources'];empty:string}){
  const max=values[0]?.count||1;
  return <section className="st-panel ba-breakdown"><h3>{title}</h3>{values.length?<ol>{values.map(({label,count})=>
    <li key={label}><div><span>{label}</span><b>{number(count)}</b></div><i aria-hidden="true" style={{width:100*count/max+'%'}}/></li>)}</ol>:<p>{empty}</p>}</section>;
}
function TrafficChart({report}:{report:BuilderReport}){
  const [series,setSeries]=useState<'views'|'clicks'>('views');
  const groupSize=Math.max(1,Math.ceil(report.trend.length/30));
  const bins:{start:string;end:string;value:number}[]=[];
  report.trend.forEach((d,i)=>{if(i%groupSize===0)bins.push({start:d.day,end:d.day,value:0});const bin=bins[bins.length-1];bin.end=d.day;bin.value+=d[series];});
  const max=Math.max(1,...bins.map(b=>b.value));
  return <section className="st-panel ba-trend"><header><h3>Traffic trend</h3><div className="ba-segments" role="group" aria-label="Chart measure">
    {(['views','clicks'] as const).map(s=><button type="button" key={s} aria-pressed={series===s} onClick={()=>setSeries(s)}>{s==='views'?'Page views':'Destination clicks'}</button>)}</div></header>
    {!bins.some(b=>b.value)?<p>No {series==='views'?'page views':'destination clicks'} measured in this period.</p>:<>
      <div className="ba-plot" aria-hidden="true"><div className="ba-scale"><span>{number(max)}</span><span>0</span></div>
        <div className="ba-bars">{bins.map(b=><div key={b.start} title={b.start+' – '+b.end+' · '+number(b.value)} style={{height:(100*b.value/max)+'%'}}/>)}</div></div>
      <div className="ba-axis"><span>{bins[0].start}</span><span>{groupSize===1?'Daily':'Up to '+groupSize+' days per bar'}</span><span>{bins[bins.length-1].end}</span></div>
      <details><summary>View chart values</summary><table><thead><tr><th>UTC dates</th><th>{series==='views'?'Views':'Clicks'}</th></tr></thead><tbody>{bins.map(b=><tr key={b.start}><td>{b.start}{b.end!==b.start?' – '+b.end:''}</td><td>{number(b.value)}</td></tr>)}</tbody></table></details></>}
  </section>;
}
export default function BuilderAnalytics({project,account,onBack}:{project:{id:string;name:string};account:string;onBack:()=>void}){
  const [period,setPeriod]=useState<AnalyticsPeriod>('7'),[sequence,reload]=useState(0);
  const [report,setReport]=useState<BuilderReport|null>(null),[error,setError]=useState('');
  useEffect(()=>{
    const controller=new AbortController();setReport(null);setError('');
    const params=new URLSearchParams({period});
    fetch('/api/projects/'+encodeURIComponent(project.id)+'/analytics?'+params,{signal:controller.signal,cache:'no-store',credentials:'same-origin',headers:{'X-RMT-Account':account}})
      .then(readApiResponse).then(value=>{
        if(value.projectId!==project.id||value.period!==period||!Array.isArray(value.trend))throw Error('The analytics response was incomplete.');
        if(!controller.signal.aborted)setReport(value as BuilderReport);
      }).catch(cause=>{if(!controller.signal.aborted)setError(cause instanceof Error?cause.message:'Analytics could not be loaded.');});
    return ()=>controller.abort();
  },[project.id,account,period,sequence]);
  useEffect(()=>{
    function conceal(){setReport(null);}
    function refresh(){if(document.visibilityState==='visible')reload(value=>value+1);else conceal();}
    window.addEventListener('pagehide',conceal);window.addEventListener('pageshow',refresh);
    document.addEventListener('visibilitychange',refresh);
    return ()=>{window.removeEventListener('pagehide',conceal);window.removeEventListener('pageshow',refresh);document.removeEventListener('visibilitychange',refresh);};
  },[]);
  const curr=report?.current;
  const delta=(key:keyof ProjectMetrics)=>report?.previous?diff(report.current[key],report.previous[key]):undefined;
  const net=curr?curr.followersAdded-curr.followersLost:0;
  return <section className="ba-dashboard"><button type="button" className="st-text-button st-back-link" onClick={onBack}><ArrowLeft size={15}/> My projects</button>
    <header className="ba-heading"><div><span className="st-kicker">Builder analytics</span><h2>{project.name}</h2></div><button type="button" className="st-text-button" aria-label="Refresh analytics" onClick={()=>reload(v=>v+1)}><RefreshCw size={16}/> Refresh</button></header>
    <div className="ba-segments ba-periods" role="group" aria-label="Analytics period">{periods.map(value=><button type="button" key={value} aria-pressed={value===period} onClick={()=>setPeriod(value)}>{value==='all'?'All time':value+' days'}</button>)}</div>
    {error?<p className="st-error" role="alert">{error} <button type="button" className="st-text-button" onClick={()=>reload(v=>v+1)}>Try again</button></p>:!report||!curr?<p role="status">Loading project analytics…</p>:<>
      <p className="ba-coverage">{report.start?'Measured '+formatDay(report.start)+' – '+formatDay(report.end)+' UTC. Today is in progress.':'No Release 28 activity has been measured yet.'}
        {report.truncated?' Only the latest 365 days of aggregates are retained.':''}
        {report.start&&!report.previous&&period!=='all'?' A comparison appears after a full preceding period is available.':''}</p>
      <div className="ba-grid"><Metric title="Project page views" value={number(curr.views)} delta={delta('views')}/>
      <Metric title="Estimated unique visitors" value={report.unique===null?'—':number(report.unique)} detail={report.unique===null?'Requires visitor data for the whole period.':'Distinct anonymous browser identifiers.'}/>
      <Metric title="Followers now" value={number(report.followers)} detail={(net>0?'+':'')+number(net)+' net this period · '+number(curr.followersAdded)+' followed, '+number(curr.followersLost)+' unfollowed'}/>
      <Metric title="Saves this period" value={number(curr.saves)} detail={number(report.savedBy)+' currently saved'} delta={delta('saves')}/></div>
      <TrafficChart report={report}/>
      <div className="ba-grid"><Metric title="Destination clicks" value={number(curr.clicks)} delta={delta('clicks')}/>
      <Metric title="Share initiations" value={number(curr.shares)} detail="Share actions started, including opening X." delta={delta('shares')}/>
      <Metric title="Announcement engagement" value={number(curr.announcements)} detail="Deduplicated update opens and link interactions." delta={delta('announcements')}/>
      <Metric title="Discovery click-through" value={curr.impressions?(100*curr.discoveryClicks/curr.impressions).toLocaleString('en',{maximumFractionDigits:1})+'%':'—'} detail={number(curr.discoveryClicks)+' matched clicks / '+number(curr.impressions)+' impressions'}/></div>
      <div className="ba-lists"><Breakdown title="Top destination sites" values={report.destinations} empty="No destination clicks recorded."/><Breakdown title="Page-view referral sources" values={report.sources} empty="No referral sources recorded."/></div>
      <details className="ba-notes"><summary>How RMT measures activity</summary><p>A page view counts once per browser tab, project and UTC day. Discovery click-through divides directory card clicks by impressions from that same directory. Each counts once per tab, project and day. An impression requires a card to be at least half visible or opened. Referral categories use the available landing referrer. Sources without one appear as direct or unknown.</p><p>Visitor estimates use project-specific, rotating anonymous identifiers. Shared devices, cleared storage and identifier rotation affect accuracy. Detailed visitor data lasts 90 days and aggregate totals 365 days. Privacy settings, bot filtering and collection limits affect coverage. Current followers and saves count active members. Share initiation records an action such as opening the X composer. Completed social posts are unmeasured.</p>
      {report.legacy.start&&<p>Earlier tracking recorded {number(report.legacy.views)} project views and {number(report.legacy.clicks)} outbound clicks between {formatDay(report.legacy.start)} and {formatDay(report.legacy.end!)}. These older counts used one event per session, project and UTC day and are shown separately.</p>}</details>
    </>}
  </section>;
}
