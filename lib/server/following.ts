import {InputError} from '@/lib/submission-validation';
import {activeControlMemberSql} from './control-sql';
import {publicProjectSql} from './control-visibility';

const eligible=activeControlMemberSql('f.user_id');
export async function followState(db:D1Database,projectId:string,userId:string|null){
  const state=await db.prepare(`WITH target(id) AS (SELECT ?)
    SELECT (SELECT COUNT(*) FROM project_follows f WHERE f.project_id=target.id AND ${eligible}) AS count,
      EXISTS(SELECT 1 FROM project_follows f WHERE f.project_id=target.id AND f.user_id=?) AS following
    FROM target WHERE ${publicProjectSql('target.id')}`).bind(projectId,userId).first<{count:number;following:number}>();
  if(!state)throw new InputError('This project is unavailable.',404);
  return {count:state.count,...(userId!==null?{following:Boolean(state.following)}:{})};
}
export async function followedProjects(db:D1Database,userId:string){
  const rows=await db.prepare(`SELECT project_id FROM project_follows f WHERE user_id=? AND ${publicProjectSql('f.project_id')}
    ORDER BY followed_at DESC,project_id`).bind(userId).all<{project_id:string}>();
  return {projectIds:rows.results.map(row=>row.project_id)};
}
export async function changeFollow(db:D1Database,userId:string,projectId:string,follow:boolean){
  if(follow){
    await db.prepare(`WITH candidate(uid,id) AS (SELECT ?,?)
      INSERT INTO project_follows(user_id,project_id,followed_at) SELECT uid,id,? FROM candidate
      WHERE ${publicProjectSql('candidate.id')} AND ${activeControlMemberSql('candidate.uid')}
      AND NOT EXISTS(SELECT 1 FROM account_links WHERE 'firebase:'||firebase_uid=candidate.uid AND legacy_user_id<>candidate.uid)
      AND (SELECT COUNT(*) FROM project_follows WHERE user_id=candidate.uid)<500
      ON CONFLICT(user_id,project_id) DO NOTHING`).bind(userId,projectId,Date.now()).run();
  }else{
    await db.prepare('DELETE FROM project_follows WHERE user_id=? AND project_id=?').bind(userId,projectId).run();
  }
  const state=await followState(db,projectId,userId);
  if(follow&&!state.following)throw new InputError('Follow could not be saved. Check your account or remove a follow if you have reached 500.',409);
  return state;
}
export function followTotals(db:D1Database){
  return db.prepare(`SELECT COUNT(*) AS follows, COUNT(DISTINCT f.user_id) AS members FROM project_follows f
    WHERE ${eligible} AND ${publicProjectSql('f.project_id')}`).first<{follows:number;members:number}>();
}
