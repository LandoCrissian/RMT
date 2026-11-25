import {validateActivityPage} from '@/lib/activity';
import {InputError} from '@/lib/submission-validation';
import {discoveryEvents} from './calendar';
import {publicActivity} from './activity';
import {catalog} from './repository';
import {legacyPrimary} from '@/lib/taxonomy';
import {getDiscoveryConfig,interestId} from './discovery-config';
import {followedProjects} from './following';
import {publicUpdateOwnershipGuard,publicUpdateProjectGuard,publicUpdateContentGuard} from './project-updates';
import {activeControlMemberSql} from './control-sql';

type Preferences={interests:string; notifications_enabled:number; onboarding:'completed'|'skipped'|null};
const inboxFrom=`FROM project_updates u JOIN project_follows f ON f.project_id=u.project_id
  WHERE f.user_id=? AND u.status='approved' AND u.published_at>=f.followed_at
  AND ${publicUpdateOwnershipGuard('u')} AND ${publicUpdateProjectGuard('u')} AND ${publicUpdateContentGuard('u')}`;
const currentMember=`${activeControlMemberSql('m.uid')} AND NOT EXISTS(
  SELECT 1 FROM account_links WHERE 'firebase:'||firebase_uid=m.uid AND legacy_user_id<>m.uid)`;

export async function discovery(db:D1Database,url:URL,user:string|null){
  const views=['all','following','for-you','notifications','guide'];
  const view=url.searchParams.get('view')??'all';
  if(!views.includes(view)||url.searchParams.getAll('view').length>1)throw new InputError('Choose a discovery view.');
  if(!user&&['following','notifications'].includes(view))throw new InputError('Sign in to view your project updates.',401);
  url.searchParams.delete('view');
  const page=validateActivityPage(url);
  const [config,prefs]=await Promise.all([getDiscoveryConfig(db),user?db.prepare(
    'SELECT interests,notifications_enabled,onboarding FROM discovery_members WHERE user_id=?').bind(user).first<Preferences>():null]);
  const interests:string[]=[...new Set<string>((JSON.parse(prefs?.interests??'[]') as string[]).map(interestId).filter(id=>config.categories.includes(id)))];
  const enabled=prefs?.notifications_enabled!==0;
  const base={lessons:config.lessons,categories:config.categories,categoryLabels:config.categoryLabels,interests,member:!!user,notificationsEnabled:enabled,
    onboarding:prefs?.onboarding??null};
  const empty={items:[],nextCursor:null,hasMore:false,unreadCount:0,readIds:[],recommendedProjects:[]};
  if(view==='guide')return {...base,...empty};
  const [{projects},followed,unread]=await Promise.all([catalog(db),user && ['following','for-you','notifications'].includes(view)?followedProjects(db,user):null,
    user&&enabled?db.prepare(`SELECT COUNT(*) AS n ${inboxFrom} AND NOT EXISTS(SELECT 1 FROM discovery_reads r WHERE r.user_id=f.user_id AND r.update_id=u.id)`).bind(user).first<{n:number}>():null]);
  const follows=new Set(followed?.projectIds);
  const recommendations=projects.filter(project=>{
    const c=project.classification;
    const ids=c?[c.primary,...c.secondary]:[legacyPrimary[project.category]];
    return config.recommendedIds.includes(project.id)||ids.some(id=>interests.includes(id));
  });
  const recommendedIds=new Set(recommendations.map(p=>p.id));
  const matches=projects.filter(p=>view==='all'||(view==='for-you'&&recommendedIds.has(p.id))||follows.has(p.id));
  const result=view==='notifications'&&!enabled?empty:await publicActivity(db,page,{projects:matches,...(view==='notifications'&&user?{inboxUser:user}:{})});
  const readIds=view==='notifications'&&user&&result.items.length?(await db.prepare(
    'SELECT update_id FROM discovery_reads WHERE user_id=? AND update_id IN (SELECT value FROM json_each(?))'
    ).bind(user,JSON.stringify(result.items.map(i=>i.updateId))).all<{update_id:string}>()).results.map(r=>r.update_id):[];
  const showEvents=!page.cursor && ['all','event'].includes(page.kind) && (view!=='notifications'||enabled);
  const calendarEvents=showEvents?await discoveryEvents(db,view==='notifications'?projects:matches,view==='notifications'?user:null):[];
  return {...base,...result,...(calendarEvents.length?{calendarEvents}:{}),readIds,unreadCount:unread?.n??0,recommendedProjects:recommendations.map(({id,name})=>({id,name}))};
}

export async function changeDiscovery(db:D1Database,user:string,value:unknown){
  if(!value||typeof value!=='object'||Array.isArray(value))throw new InputError('Choose a discovery setting.');
  const body=value as Record<string,unknown>;
  const inputs:Record<string,string>={interests:'interests',notifications:'enabled',onboarding:'outcome',read:'id'};
  if(typeof body.action!=='string'||!Object.hasOwn(inputs,body.action)||
      Object.keys(body).some(k=>k!=='action'&&k!==inputs[body.action as string]))
    throw new InputError('Unknown discovery setting.');
  let field:string, saved:string|number;
  switch(body.action){
    case 'interests':{
      const {categories}=await getDiscoveryConfig(db);
      if(!Array.isArray(body.interests)||body.interests.length>categories.length||
        !body.interests.every(s=>typeof s==='string'&&categories.includes(interestId(s)))||new Set(body.interests.map(interestId)).size!==body.interests.length)
        throw new InputError('Choose available interests.');
      field='interests';saved=JSON.stringify(body.interests.map(interestId));break;
    }
    case 'notifications':
      if(typeof body.enabled!=='boolean')throw new InputError('Choose a notification preference.');
      field='notifications_enabled';saved=Number(body.enabled);break;
    case 'onboarding':
      if(body.outcome!=='completed'&&body.outcome!=='skipped')throw new InputError('Choose a valid guide outcome.');
      field='onboarding';saved=body.outcome;break;
    case 'read':{
      if(typeof body.id!=='string'||!/^[-a-zA-Z0-9_]{1,128}$/.test(body.id))throw new InputError('Invalid notification.');
      const result=await db.prepare(`WITH m(uid) AS (SELECT ?)
        INSERT INTO discovery_reads(user_id,update_id) SELECT f.user_id,u.id ${inboxFrom}
        AND u.id=? AND EXISTS(SELECT 1 FROM m WHERE ${currentMember})
        AND NOT EXISTS(SELECT 1 FROM discovery_members s WHERE s.user_id=f.user_id AND s.notifications_enabled=0)
        ON CONFLICT(user_id,update_id) DO UPDATE SET update_id=excluded.update_id`).bind(user,user,body.id).run();
      if(!result.meta.changes)throw new InputError('This notification is unavailable.',404);
      return {ok:true};
    }
    default:throw new InputError('Unknown discovery setting.');
  }
  const result=await db.prepare(`WITH m(uid) AS (SELECT ?) INSERT INTO discovery_members(user_id,${field})
    SELECT uid,? FROM m WHERE ${currentMember} ON CONFLICT(user_id) DO UPDATE SET ${field}=excluded.${field}`).bind(user,saved).run();
  if(!result.meta.changes)throw new InputError('Your account changed. Refresh and try again.',409);
  return {ok:true};
}
