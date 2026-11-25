import {periods,type BuilderReport,type AnalyticsPeriod,type ProjectMetrics} from '@/lib/builder-analytics';
import {InputError} from '@/lib/submission-validation';
import {activeControlMemberSql} from './control-sql';
import {publicProjectSql} from './control-visibility';

const DAY=86_400_000;
const day=(time:number)=>new Date(time).toISOString().slice(0,10);
const timestamp=(date:string)=>Date.parse(date+'T00:00:00Z');
const fields = {
  project_view:'views',outbound:'clicks',follow:'followersAdded',unfollow:'followersLost',
  save:'saves',share:'shares',announcement:'announcements',impression:'impressions',discovery_click:'discoveryClicks',
} as const;
const empty=():ProjectMetrics=>({views:0,clicks:0,followersAdded:0,followersLost:0,saves:0,shares:0,announcements:0,impressions:0,discoveryClicks:0});
export function readAnalyticsPeriod(raw:string|null):AnalyticsPeriod {
  if(raw===null)return '7';
  if(!periods.includes(raw as AnalyticsPeriod))throw new InputError('Choose 7, 30, 90 days or all time.');
  return raw as AnalyticsPeriod;
}
const ownership=`SELECT revision FROM project_owners o WHERE o.project_id=? AND o.user_id=? AND o.status='active'
  AND ${activeControlMemberSql('o.user_id')} AND ${publicProjectSql('o.project_id')}`;
const unavailable=()=>new InputError('This project is unavailable in your verified builder account.',404);
type Daily={day:string;kind:string;total:number};
type Breakdown={label:string;count:number};
function sum(rows:Daily[]) {
  const stats=empty();
  for(const r of rows)if(Object.hasOwn(fields,r.kind))stats[fields[r.kind as keyof typeof fields]]+=r.total;
  return stats;
}
export async function readBuilderAnalytics(db:D1Database,userId:string,projectId:string,period:AnalyticsPeriod,now=Date.now()):Promise<BuilderReport>{
  if(!/^[a-z0-9][a-z0-9_-]{0,127}$/i.test(projectId))throw unavailable();
  const owner=db.prepare(ownership).bind(projectId,userId);
  const owned=await owner.first<{revision:number}>();
  if(!owned)throw unavailable();
  const end=day(now),days=period==='all'?365:Number(period),floor=day(now-(days-1)*DAY);
  const prior=period==='all'?floor:day(now-(2*days-1)*DAY),uniqueFloor=day(now-89*DAY);
  const breakdown=(kind:string)=>db.prepare(`SELECT dimension AS label,SUM(total) AS count FROM analytics_daily
    WHERE project_id=? AND kind=? AND day BETWEEN ? AND ? GROUP BY dimension ORDER BY count DESC,label LIMIT 10`).bind(projectId,kind,floor,end);
  // All results, including the second ownership check, share one D1 read snapshot.
  const result=await db.batch([
    owner,db.prepare('SELECT start_ms FROM analytics_meta WHERE id=1'),
    db.prepare(`SELECT day,kind,SUM(total) AS total FROM analytics_daily WHERE project_id=? AND day BETWEEN ? AND ?
      GROUP BY day,kind ORDER BY day`).bind(projectId,prior,end),
    db.prepare(`SELECT COUNT(DISTINCT visitor) AS n FROM analytics_events WHERE project_id=? AND kind='project_view'
      AND day BETWEEN ? AND ? AND visitor<>''`).bind(projectId,floor<uniqueFloor?uniqueFloor:floor,end),
    db.prepare(`SELECT (SELECT COUNT(*) FROM project_follows f WHERE f.project_id=? AND ${activeControlMemberSql('f.user_id')}) AS follows,
      (SELECT COUNT(*) FROM saved_projects s WHERE s.project_id=? AND ${activeControlMemberSql('s.user_id')}) AS saves`).bind(projectId,projectId),
    breakdown('project_view'),breakdown('outbound'),
    db.prepare(`SELECT MIN(day) AS start,MAX(day) AS end,COUNT(CASE WHEN kind='project_view' THEN 1 END) AS views,
      COUNT(CASE WHEN kind='outbound' THEN 1 END) AS clicks FROM control_metric_events
      WHERE project_id=? AND day BETWEEN ? AND ? AND created_at<COALESCE((SELECT start_ms FROM analytics_meta WHERE id=1),?)`).bind(projectId,floor>day(now-29*DAY)?floor:day(now-29*DAY),end,now+1),
  ]);
  if((result[0].results[0] as {revision:number}|undefined)?.revision!==owned.revision)throw unavailable();
  const first=(result[1].results[0] as {start_ms:number}|undefined)?.start_ms;
  const measuredSince=first===undefined?null:day(first);
  const start=measuredSince===null?null:floor>measuredSince?floor:measuredSince;
  const rows=result[2].results as Daily[],currentRows=rows.filter(r=>r.day>=floor);
  const byDay=new Map<string,{day:string;views:number;clicks:number}>();
  if(start)for(let t=timestamp(start);t<=timestamp(end);t+=DAY){const d=day(t);byDay.set(d,{day:d,views:0,clicks:0});}
  for(const row of currentRows){const d=byDay.get(row.day);if(d&&row.kind==='project_view')d.views=row.total;if(d&&row.kind==='outbound')d.clicks=row.total;}
  const counts=result[4].results[0] as {saves:number;follows:number};
  return {projectId,period,start,end,measuredSince,truncated:period==='all'&&!!measuredSince&&measuredSince<floor,
    current:sum(currentRows),previous:period!=='all'&&first!==undefined&&first<=timestamp(prior)?sum(rows.filter(r=>r.day<floor)):null,
    unique:start&&start>=uniqueFloor?Number((result[3].results[0] as {n:number}).n):null,followers:Number(counts.follows),savedBy:Number(counts.saves),
    trend:[...byDay.values()],sources:result[5].results as Breakdown[],destinations:result[6].results as Breakdown[],
    legacy:result[7].results[0] as BuilderReport['legacy']};
}
