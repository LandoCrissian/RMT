import {getSeedProjects} from '@/lib/catalog';
import {InputError} from '@/lib/submission-validation';
import {catalog,findPublicProject} from './repository';
import {controlObject} from './control-access';

const DAY=86_400_000;
export type MetricKind='visit'|'project_view'|'outbound';
export type MetricInput={kind:MetricKind;sessionId:string;projectId:string};
export function validateMetric(value:unknown):MetricInput{
  const data=controlObject(value,['kind','sessionId','projectId']);
  if(!['visit','project_view','outbound'].includes(String(data.kind))||typeof data.sessionId!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(data.sessionId))throw new InputError('This measurement is not valid.');
  const projectId=data.projectId??'';
  if(typeof projectId!=='string'||projectId.length>128||(data.kind==='visit'?projectId!=='':!/^[a-z0-9][a-z0-9_-]{0,127}$/i.test(projectId)))throw new InputError('Choose a valid project.');
  return {kind:data.kind as MetricKind,sessionId:data.sessionId.toLowerCase(),projectId};
}
/** Only daily deduplicated hashes are retained: no IP, account, URL or browser fingerprint. */
export async function recordMetric(db:D1Database,input:MetricInput,now=Date.now()){
  if(input.projectId)await findPublicProject(db,input.projectId);
  const day=new Date(now).toISOString().slice(0,10),cutoff=new Date(now-29*DAY).toISOString().slice(0,10);
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode([day,input.sessionId,input.kind,input.projectId].join('|')));
  const id=Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('');
  await db.batch([
    db.prepare('DELETE FROM control_metric_events WHERE day<?').bind(cutoff),
    // A defensive daily ceiling bounds unauthenticated writes. These are usage
    // indicators, not audited visitor totals or a basis for paid placement.
    db.prepare(`INSERT OR IGNORE INTO control_metric_events(id,day,kind,project_id,created_at)
      SELECT ?,?,?,?,? WHERE (SELECT COUNT(*) FROM control_metric_events WHERE day=?)<100000`)
      .bind(id,day,input.kind,input.projectId,now,day),
  ]);
}
export async function controlAnalytics(db:D1Database,days:7|30,now=Date.now()){
  const end=new Date(now).toISOString().slice(0,10),start=new Date(now-(days-1)*DAY).toISOString().slice(0,10);
  const [totals,perDay,perProject,first,publicCatalog]=await Promise.all([
    db.prepare('SELECT kind,COUNT(*) AS count FROM control_metric_events WHERE day>=? AND day<=? GROUP BY kind').bind(start,end).all<{kind:MetricKind;count:number}>(),
    db.prepare('SELECT day,kind,COUNT(*) AS count FROM control_metric_events WHERE day>=? AND day<=? GROUP BY day,kind ORDER BY day').bind(start,end).all<{day:string;kind:MetricKind;count:number}>(),
    db.prepare("SELECT project_id,SUM(kind='project_view') AS views,SUM(kind='outbound') AS clicks FROM control_metric_events WHERE day>=? AND day<=? AND project_id<>'' GROUP BY project_id ORDER BY views DESC,clicks DESC,project_id LIMIT 50").bind(start,end).all<{project_id:string;views:number;clicks:number}>(),
    db.prepare('SELECT MIN(created_at) AS first FROM control_metric_events').first<{first:number|null}>(),catalog(db),
  ]);
  const sums={visit:0,project_view:0,outbound:0};for(const row of totals.results)sums[row.kind]=Number(row.count);
  const byDay=new Map<string,{day:string;visits:number;projectViews:number;outboundClicks:number}>();
  for(let offset=days-1;offset>=0;offset--){const day=new Date(now-offset*DAY).toISOString().slice(0,10);byDay.set(day,{day,visits:0,projectViews:0,outboundClicks:0});}
  const keys={visit:'visits',project_view:'projectViews',outbound:'outboundClicks'} as const;
  for(const row of perDay.results){const day=byDay.get(row.day);if(day)day[keys[row.kind]]=Number(row.count);}
  const names=new Map([...getSeedProjects(),...publicCatalog.projects].map(project=>[project.id,project.name]));
  return {days,startedAt:first?.first??null,visits:sums.visit,projectViews:sums.project_view,outboundClicks:sums.outbound,
    daily:[...byDay.values()],projects:perProject.results.map(row=>({projectId:row.project_id,name:names.get(row.project_id)||row.project_id,views:Number(row.views),clicks:Number(row.clicks)})),
    note:'Anonymous browser sessions, not individual people. Each project view and outbound action counts once per session per UTC day. Collection starts with the Control Center release; only the last 30 days are retained. Browser privacy preferences are respected. These counts are usage indicators, not audited traffic totals.'};
}
