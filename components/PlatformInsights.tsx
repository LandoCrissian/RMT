'use client';
import {useState} from 'react';
import {Compass,Globe2,Repeat2} from 'lucide-react';
import type {PlatformInsights as Insights,InsightPeriod} from '@/lib/server/platform-insights';
import {useControlResource,type ControlApi} from '@/lib/client/use-control';
import {ErrorPanel,Field,Loading,PanelHeading,RefreshButton,StatCard,numberLabel} from './control-primitives';
import './platform-insights.css';

const windows:Record<InsightPeriod,string>={'7':'7 days','30':'30 days','90':'90 days',all:'All available'};
function decode(value:unknown):Insights{
  const data=value as Insights;
  if(!data||!Object.hasOwn(windows,data.period)||![data.daily,data.engagement,data.sources].every(Array.isArray)||
    ![data.visits,data.returningVisits,data.registrations,data.activeBuilders,data.admitted,data.rpcSlots].every(n=>Number.isSafeInteger(n)&&n>=0))
    throw Error('Platform measurements could not be verified.');
  return data;
}
const size=(n:number)=>new Intl.NumberFormat(undefined,{maximumFractionDigits:1}).format(n/1048576)+' MiB';

function TrafficChart({days}:{days:Insights['daily']}){
  if(!days.length)return <p className="cc-muted">Traffic history starts with the first accepted measurement.</p>;
  const max=Math.max(1,...days.map(d=>Math.max(d.visits,d.returningVisits)));
  const points=(key:'visits'|'returningVisits')=>days.map((d,i)=>[12+(days.length>1?i/(days.length-1):0.5)*576,105-d[key]/max*90]);
  return <><svg className="platform-chart" viewBox="0 0 600 120" role="img" aria-label="Daily visits and estimated returning visits. Exact daily counts are available below.">
    {[15,60,105].map(y=><line key={y} x1="12" x2="588" y1={y} y2={y} stroke="currentColor" opacity=".13"/>)}
    {(['visits','returningVisits'] as const).map((key,i)=>{const p=points(key),color=i?'#9bc2dc':'#caff00';return <g key={key}>
      <polyline points={p.map(x=>x.join(',')).join(' ')} fill="none" stroke={color} strokeWidth="2.5" strokeDasharray={i?'5 4':undefined}/>
      {p.length===1&&<circle cx={p[0][0]} cy={p[0][1]} r={i?3:5} fill={color}/>}</g>;})}</svg>
    <div className="platform-axis"><span>{days[0].day}</span><span>{days.at(-1)?.day}</span></div>
    <details className="cc-data-details"><summary>Daily counts</summary><div className="cc-table-wrap"><table><thead><tr><th>UTC date</th><th>Visits</th><th>Returning, estimated</th></tr></thead><tbody>
      {days.map(d=><tr key={d.day}><th>{d.day}</th><td>{numberLabel(d.visits)}</td><td>{numberLabel(d.returningVisits)}</td></tr>)}</tbody></table></div></details></>;
}
export default function PlatformInsights({api}:{api:ControlApi}){
  const [period,setPeriod]=useState<InsightPeriod>('7');
  const resource=useControlResource(api,'/api/control/insights?period='+period,decode);
  const d=resource.data;
  return <section className="cc-section"><PanelHeading title="Platform insights" description="Traffic, member activity and operating limits across RMT."
    actions={<><Field label="Reporting period"><select value={period} onChange={e=>setPeriod(e.target.value as InsightPeriod)}>
      {(Object.keys(windows) as InsightPeriod[]).map(k=><option key={k} value={k}>{windows[k]}</option>)}</select></Field>
      <RefreshButton busy={resource.loading} onClick={()=>void resource.reload()}/></>}/>
    {resource.error?<ErrorPanel message={resource.error} onRetry={()=>void resource.reload()}/>:!d?<Loading/>:<>
    <div className="cc-stats cc-stats-three">
      <StatCard label="Recorded visits" value={d.visits} icon={<Globe2 size={20}/>} detail="Deduplicated browser sessions per UTC day"/>
      <StatCard label="Returning visits · estimate" value={d.returningVisits} icon={<Repeat2 size={20}/>} detail="Recognized browser with an earlier day of activity"/>
      <StatCard label="Known external visits outside X" value={d.outsideX} icon={<Compass size={20}/>} detail="Search, other social sites and other referrals"/>
    </div>
    <section className="cc-panel"><h3>Traffic over time</h3><p className="cc-muted">Lime shows recorded visits. The dashed line shows estimated returning visits. {d.since?'Available from '+d.since+' through '+d.today+' UTC.':''} Browser privacy settings, retention and collection limits affect coverage.</p><TrafficChart days={d.daily}/></section>
    <div className="platform-panels"><section className="cc-panel"><h3>Traffic sources</h3>{d.sources.length?<dl className="platform-counts">{d.sources.map(row=><div key={row.label}><dt>{row.label}</dt><dd>{numberLabel(row.total)}</dd></div>)}</dl>:<p className="cc-muted">No attributed visits in this period.</p>}<p className="cc-muted">Direct or unknown visits have no reliable external attribution.</p></section>
    <section className="cc-panel"><h3>Members and builders</h3><dl className="platform-counts">
      <div><dt>Observed Firebase registrations</dt><dd>{d.registrations}</dd></div><div><dt>Builders who submitted an update or edit</dt><dd>{d.activeBuilders}</dd></div>
      <div><dt>Claimed public projects now</dt><dd>{d.claimed}</dd></div><div><dt>Unclaimed public projects now</dt><dd>{d.unclaimed}</dd></div></dl>
      <p className="cc-muted">Registration dates come from Firebase when a member uses RMT. Accounts without a verified date are excluded.</p></section></div>
    <section className="cc-panel"><h3>Public project engagement</h3>{d.engagement.length?<div className="cc-table-wrap"><table><thead><tr><th>Project</th><th>Views</th><th>External clicks</th><th>Announcement engagements</th></tr></thead><tbody>
      {d.engagement.map(r=><tr key={r.id}><th>{r.name}</th><td>{r.views}</td><td>{r.outbound}</td><td>{r.announcements}</td></tr>)}</tbody></table></div>:<p className="cc-muted">Project activity will appear here as visitors interact.</p>}</section>
    <div className="platform-panels"><section className="cc-panel"><h3>Beginner guide</h3><dl className="platform-counts"><div><dt>Completed</dt><dd>{d.completed}</dd></div><div><dt>Skipped</dt><dd>{d.skipped}</dd></div></dl><p className="cc-muted">Latest saved choice per member, across all time. Guests can use the guide privately.</p></section>
    <section className="cc-panel"><h3>Infrastructure usage</h3><dl className="platform-counts">
      <div><dt>Public measurement slots left today</dt><dd>{numberLabel(Math.max(0,d.eventLimit-d.admitted))} / {numberLabel(d.eventLimit)}</dd></div>
      <div><dt>Wallet checks left in rolling 24 hours</dt><dd>{Math.max(0,d.rpcLimit-d.rpcSlots)} / {d.rpcLimit}</dd></div>
      <div><dt>Recorded ready artwork</dt><dd>{size(d.artworkBytes)}</dd></div><div><dt>D1 database size</dt><dd>{d.dbBytes===null?'Unavailable':size(d.dbBytes)}</dd></div>
      </dl><p className="cc-muted">Limits shown are enforced by RMT. Host CPU, account-wide quotas and provider headroom are unavailable to this dashboard.</p></section></div>
    </>}
  </section>;
}
