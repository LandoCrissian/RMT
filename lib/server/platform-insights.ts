import {DAILY_EVENT_LIMIT} from './engagement';
import {DAILY_CLAIM_CHECK_LIMIT} from './claim-budget';
import {catalog} from './repository';
import {InputError} from '@/lib/submission-validation';

const DAY=86_400_000;
const utc=(time:number)=>new Date(time).toISOString().slice(0,10);
export type InsightPeriod='7'|'30'|'90'|'all';
export function insightPeriod(value:string|null):InsightPeriod{
  if(value===null)return '7';
  if(value==='7'||value==='30'||value==='90'||value==='all')return value;
  throw new InputError('Choose an available reporting period.');
}
export async function platformInsights(db:D1Database,period:InsightPeriod,now=Date.now()){
  const today=utc(now),midnight=Date.parse(today+'T00:00:00Z');
  const windowStart=period==='all'?0:midnight-(Number(period)-1)*DAY;
  const start=utc(Math.max(windowStart,midnight-364*DAY));
  const [catalogue,metadata,traffic,sources,engagement,operational]=await Promise.all([
    catalog(db),
    db.prepare('SELECT start_ms,active_day,accepted FROM analytics_meta WHERE id=1').first<{start_ms:number;active_day:string;accepted:number}>(),
    db.prepare(`SELECT day,SUM(CASE WHEN kind='visit' THEN total ELSE 0 END) AS visits,
      SUM(CASE WHEN kind='returning' THEN total ELSE 0 END) AS returningVisits
      FROM analytics_daily WHERE day BETWEEN ? AND ? AND project_id='' AND kind IN ('visit','returning') GROUP BY day ORDER BY day`)
      .bind(start,today).all<{day:string;visits:number;returningVisits:number}>(),
    db.prepare(`SELECT dimension AS label,SUM(total) AS total FROM analytics_daily WHERE day BETWEEN ? AND ?
      AND kind='visit' AND project_id='' GROUP BY dimension ORDER BY total DESC, dimension`).bind(start,today).all<{label:string;total:number}>(),
    db.prepare(`SELECT project_id AS id,SUM(CASE WHEN kind='project_view' THEN total ELSE 0 END) AS views,
      SUM(CASE WHEN kind='outbound' THEN total ELSE 0 END) AS outbound,
      SUM(CASE WHEN kind='announcement' THEN total ELSE 0 END) AS announcements
      FROM analytics_daily WHERE day BETWEEN ? AND ? AND project_id<>'' AND kind IN ('project_view','outbound','announcement')
      GROUP BY project_id ORDER BY views DESC,outbound DESC,project_id LIMIT 100`).bind(start,today).all<{id:string;views:number;outbound:number;announcements:number}>(),
    db.prepare(`SELECT (SELECT COUNT(*) FROM control_members m WHERE m.firebase_created_at BETWEEN ? AND ?
        AND NOT EXISTS(SELECT 1 FROM account_links l WHERE 'firebase:'||l.firebase_uid=m.user_id AND l.legacy_user_id<>m.user_id)) AS registrations,
      (SELECT COUNT(*) FROM (SELECT user_id FROM project_edits WHERE created_at BETWEEN ? AND ?
        UNION SELECT actor_id FROM project_update_events WHERE action='submit' AND created_at BETWEEN ? AND ?)) AS activeBuilders,
      (SELECT COUNT(*) FROM discovery_members WHERE onboarding='completed') AS completed,
      (SELECT COUNT(*) FROM discovery_members WHERE onboarding='skipped') AS skipped,
      (SELECT COUNT(*) FROM claim_rpc_usage WHERE created_at>=?) AS rpcSlots,
      (SELECT COALESCE(SUM(byte_size),0) FROM project_artwork WHERE status='ready')+
      (SELECT COALESCE(SUM(byte_size),0) FROM profile_artwork WHERE status='ready')+
      (SELECT COALESCE(SUM(byte_size),0) FROM control_project_artwork WHERE status='ready') AS artworkBytes`)
      .bind(windowStart,now,windowStart,now,windowStart,now,now-DAY).first<{registrations:number;activeBuilders:number;completed:number;skipped:number;rpcSlots:number;artworkBytes:number}>()
  ]);
  if(!operational)throw new Error('Unable to retrieve platform totals');
  const first=metadata?utc(metadata.start_ms):null;
  const since=first&&first>start?first:start;
  const byDay=new Map(traffic.results.map(row=>[row.day,row]));
  const daily=[];if(first)for(let t=Date.parse(since+'T00:00:00Z');t<=midnight;t+=DAY){
    const day=utc(t);daily.push(byDay.get(day)??{day,visits:0,returningVisits:0});
  }
  const projects=new Map(catalogue.projects.map(p=>[p.id,p]));
  const claimed=catalogue.projects.filter(p=>p.claimed).length;
  return {period,since:first?since:null,today,visits:daily.reduce((a,r)=>a+r.visits,0),
    returningVisits:daily.reduce((a,r)=>a+r.returningVisits,0),daily,sources:sources.results,
    outsideX:sources.results.filter(r=>['Search','Other social','Other referral'].includes(r.label)).reduce((n,r)=>n+r.total,0),
    engagement:engagement.results.filter(r=>projects.has(r.id)).map(r=>({...r,name:projects.get(r.id)!.name})),
    claimed,unclaimed:catalogue.projects.length-claimed,...operational,
    eventLimit:DAILY_EVENT_LIMIT,rpcLimit:DAILY_CLAIM_CHECK_LIMIT,admitted:metadata?.active_day===today?metadata.accepted:0,
    dbBytes:typeof traffic.meta?.size_after==='number'&&traffic.meta.size_after>0?traffic.meta.size_after:null};
}
export type PlatformInsights=Awaited<ReturnType<typeof platformInsights>>;
