import { getSeedProjects } from '@/lib/catalog';
import { InputError } from '@/lib/submission-validation';
import { encodeUpdateCursor, validateUpdateContent, type ChangeUpdateInput, type CreateUpdateInput, type ProjectUpdate,
  type PublicProjectUpdate, type ReviewUpdateInput, type UpdatePageInput, type UpdatesPage, type UpdateStatus, type UpdateKind } from '@/lib/project-updates';
import type { PlatformIdentity } from './auth';
import { findPublicProject } from './repository';
import { pendingNotifications } from './outbox-events';
import { json } from './http';

export const UPDATE_DRAFTS_PER_DAY = 10;
export const UPDATE_OPEN_DRAFTS = 20;
export const UPDATE_SUBMISSIONS_PER_DAY = 5;
const DAY = 86_400_000;
export type UpdateRow = {
  id: string; project_id: string; project_name: string; user_id: string; ownership_revision: number;
  kind: UpdateKind; title: string; body: string; link_label: string; link_url: string;
  status: UpdateStatus; review_note: string; revision: number; published_at: number | null;
  created_at: number; updated_at: number; can_manage?: number;
};
// These IDs are trusted immutable source data, never interpolated request values.
const curatedIds = getSeedProjects().map(project => `'${project.id.replace(/'/g, "''")}'`).join(',') || "''";
function publicGuard(alias: string) {
  return `(${alias}.project_id IN (${curatedIds}) OR EXISTS(SELECT 1 FROM submissions s WHERE 'community-'||s.id=${alias}.project_id AND s.status='approved'))`;
}
function ownershipGuard(alias: string) {
  return `EXISTS(SELECT 1 FROM project_owners o WHERE o.project_id=${alias}.project_id AND o.user_id=${alias}.user_id AND o.status='active' AND o.revision=${alias}.ownership_revision)`;
}
// Reused by the ecosystem feed so archiving, revoked ownership, and hidden
// projects have identical public visibility rules across both surfaces.
export { publicGuard as publicUpdateProjectGuard, ownershipGuard as publicUpdateOwnershipGuard };
const rowEligibility = `${ownershipGuard('project_updates')} AND ${publicGuard('project_updates')}`;
const projection = `project_updates.*, CASE WHEN ${rowEligibility} THEN 1 ELSE 0 END AS can_manage`;
function content(row: UpdateRow) {return {kind: row.kind, title: row.title, body: row.body, linkLabel: row.link_label, linkUrl: row.link_url};}
export function privateProjectUpdate(row: UpdateRow, admin = false): ProjectUpdate {
  return {id: row.id, projectId: row.project_id, projectName: row.project_name, ...content(row), status: row.status,
    revision: row.revision, reviewNote: row.review_note, createdAt: row.created_at, updatedAt: row.updated_at,
    publishedAt: row.published_at, canManage: row.can_manage === 1, ...(admin ? {userId: row.user_id} : {})};
}
export function publicProjectUpdate(row: UpdateRow): PublicProjectUpdate {
  if (row.status !== 'approved' || row.published_at === null) throw new Error('Only published updates have a public projection');
  return {id: row.id, projectId: row.project_id, projectName: row.project_name, ...content(row), publishedAt: row.published_at};
}
/** Account consistency, never authentication: the cookie can change in another tab. */
export function updateAccountConflict(request: Request, userId: string): Response | null {
  return request.headers.get('x-rmt-account') === userId ? null : json({error: 'Your account changed. Refresh before managing project updates.', code: 'account_changed'}, 409);
}
async function readOwnRow(db: D1Database, userId: string, id: string): Promise<UpdateRow> {
  const row = await db.prepare(`SELECT ${projection} FROM project_updates WHERE id=? AND user_id=?`).bind(id, userId).first<UpdateRow>();
  if (!row) throw new InputError('This project update was not found.', 404);
  return row;
}
function translateUnique(error: unknown): never {
  if (error instanceof Error && /UNIQUE constraint failed.*project_updates\.project_id/i.test(error.message)) throw new InputError('This project already has an update in review. Wait for the decision or withdraw it first.', 409);
  throw error;
}

export async function createProjectUpdate(db: D1Database, user: PlatformIdentity, input: CreateUpdateInput): Promise<ProjectUpdate> {
  const project = await findPublicProject(db, input.projectId);
  const owner = await db.prepare("SELECT revision FROM project_owners WHERE project_id=? AND user_id=? AND status='active'").bind(input.projectId, user.userId).first<{revision: number}>();
  if (!owner) throw new InputError('This project is not available in your confirmed builder account.', 404);
  const id = crypto.randomUUID(), now = Date.now();
  const result = await db.prepare(`WITH candidate(id,project_id,project_name,user_id,ownership_revision,kind,title,body,link_label,link_url,created_at) AS (SELECT ?,?,?,?,?,?,?,?,?,?,?)
    INSERT INTO project_updates(id,project_id,project_name,user_id,ownership_revision,kind,title,body,link_label,link_url,status,review_note,revision,published_at,created_at,updated_at)
    SELECT id,project_id,project_name,user_id,ownership_revision,kind,title,body,link_label,link_url,'draft','',1,NULL,created_at,created_at FROM candidate
    WHERE ${ownershipGuard('candidate')} AND ${publicGuard('candidate')}
    AND (SELECT COUNT(*) FROM project_updates u WHERE u.user_id=candidate.user_id AND u.created_at>=?)<${UPDATE_DRAFTS_PER_DAY}
    AND (SELECT COUNT(*) FROM project_updates u WHERE u.user_id=candidate.user_id AND u.status IN ('draft','rejected') AND ${ownershipGuard('u')} AND ${publicGuard('u')})<${UPDATE_OPEN_DRAFTS}`)
    .bind(id, input.projectId, project.name, user.userId, owner.revision, input.kind, input.title, input.body, input.linkLabel, input.linkUrl, now, now-DAY).run();
  if (result.meta.changes !== 1) {
    const counts = await db.prepare(`SELECT SUM(CASE WHEN created_at>=? THEN 1 ELSE 0 END) AS daily,SUM(CASE WHEN status IN ('draft','rejected') AND ${rowEligibility} THEN 1 ELSE 0 END) AS open FROM project_updates WHERE user_id=?`)
      .bind(now-DAY,user.userId).first<{daily:number;open:number}>();
    if ((counts?.daily??0)>=UPDATE_DRAFTS_PER_DAY) throw new InputError(`You can start up to ${UPDATE_DRAFTS_PER_DAY} updates in 24 hours.`,429);
    if ((counts?.open??0)>=UPDATE_OPEN_DRAFTS) throw new InputError(`You can keep ${UPDATE_OPEN_DRAFTS} open drafts. Archive an unused draft before starting another.`,429);
    throw new InputError('Project ownership or availability changed. Refresh your projects.',409);
  }
  return privateProjectUpdate(await readOwnRow(db,user.userId,id));
}

export async function ownProjectUpdates(db:D1Database,userId:string,page:UpdatePageInput,projectId?:string):Promise<UpdatesPage<ProjectUpdate>> {
  const binds: (string|number)[]=[userId];
  let guard='user_id=?';
  if(projectId){guard+=' AND project_id=?';binds.push(projectId);}
  if(page.cursor){guard+=' AND (updated_at<? OR (updated_at=? AND id<?))';binds.push(page.cursor.at,page.cursor.at,page.cursor.id);}
  binds.push(page.limit+1);
  const rows=await db.prepare(`SELECT ${projection} FROM project_updates WHERE ${guard} ORDER BY updated_at DESC,id DESC LIMIT ?`).bind(...binds).all<UpdateRow>();
  const shown=rows.results.slice(0,page.limit),last=shown.at(-1),hasMore=rows.results.length>page.limit;
  return {updates:shown.map(row=>privateProjectUpdate(row)),hasMore,nextCursor:hasMore&&last?encodeUpdateCursor({at:last.updated_at,id:last.id}):null};
}
export async function projectUpdatesQueue(db:D1Database,page:UpdatePageInput):Promise<UpdatesPage<ProjectUpdate>> {
  const rank="CASE WHEN status='pending' THEN 0 ELSE 1 END";
  const cursor=page.cursor;
  const guard=cursor?`WHERE (${rank}>? OR (${rank}=? AND (updated_at<? OR (updated_at=? AND id<?))))`:'';
  const binds: (string|number)[]=cursor?[cursor.rank!,cursor.rank!,cursor.at,cursor.at,cursor.id]:[];
  binds.push(page.limit+1);
  // Draft content is private to its publisher. Reviewers see only submitted or previously submitted records.
  const visible="(status IN ('pending','approved','rejected') OR (status='archived' AND EXISTS(SELECT 1 FROM project_update_events e WHERE e.update_id=project_updates.id AND e.action='archive' AND e.revision=project_updates.revision AND e.previous_status IN ('approved','rejected'))))";
  const rows=await db.prepare(`SELECT ${projection} FROM project_updates ${guard?`${guard} AND ${visible}`:`WHERE ${visible}`} ORDER BY ${rank},updated_at DESC,id DESC LIMIT ?`).bind(...binds).all<UpdateRow>();
  const shown=rows.results.slice(0,page.limit),last=shown.at(-1),hasMore=rows.results.length>page.limit;
  return {updates:shown.map(row=>privateProjectUpdate(row,true)),hasMore,nextCursor:hasMore&&last?encodeUpdateCursor({at:last.updated_at,id:last.id,rank:last.status==='pending'?0:1}):null};
}
export async function publicProjectUpdates(db:D1Database,projectId:string,page:UpdatePageInput):Promise<{updates:PublicProjectUpdate[];nextCursor:string|null}> {
  await findPublicProject(db,projectId);
  const binds:(string|number)[]=[projectId];
  let cursor='';
  if(page.cursor){cursor=' AND (published_at<? OR (published_at=? AND id<?))';binds.push(page.cursor.at,page.cursor.at,page.cursor.id);}
  binds.push(page.limit+1);
  const rows=await db.prepare(`SELECT * FROM project_updates WHERE project_id=? AND status='approved' AND published_at IS NOT NULL
    AND ${rowEligibility}${cursor} ORDER BY published_at DESC,id DESC LIMIT ?`).bind(...binds).all<UpdateRow>();
  const shown=rows.results.slice(0,page.limit),last=shown.at(-1);
  return {updates:shown.map(publicProjectUpdate),nextCursor:rows.results.length>page.limit&&last?encodeUpdateCursor({at:last.published_at!,id:last.id}):null};
}

export async function changeProjectUpdate(db:D1Database,user:PlatformIdentity,id:string,input:ChangeUpdateInput):Promise<ProjectUpdate> {
  const row=await readOwnRow(db,user.userId,id);
  if(row.can_manage!==1)throw new InputError('Project ownership or availability changed. Refresh your projects.',409);
  if(row.revision!==input.expectedRevision)throw new InputError('This update changed. Refresh before making another change.',409);
  const allowed:Record<ChangeUpdateInput['action'],UpdateStatus[]>={save:['draft','rejected'],submit:['draft','rejected'],withdraw:['pending'],archive:['draft','rejected','approved']};
  if(!allowed[input.action].includes(row.status))throw new InputError('This update is not ready for that action. Refresh your updates.',409);
  if(input.action==='submit')validateUpdateContent(content(row),true);
  const nextStatus:UpdateStatus=input.action==='save'||input.action==='withdraw'?'draft':input.action==='submit'?'pending':'archived';
  const now=Date.now(),eventId=crypto.randomUUID();
  const quota=input.action==='submit'?` AND (SELECT COUNT(*) FROM project_update_events e WHERE e.actor_id=project_updates.user_id AND e.action='submit' AND e.created_at>=?)<${UPDATE_SUBMISSIONS_PER_DAY}`:'';
  const guard=`id=? AND user_id=? AND revision=? AND status=? AND ${rowEligibility}`;
  const eventArgs:(string|number)[]=[eventId,user.userId,input.action,nextStatus,now,id,user.userId,row.revision,row.status];
  if(input.action==='submit')eventArgs.push(now-DAY);
  const statements:D1PreparedStatement[]=[db.prepare(`INSERT INTO project_update_events(id,update_id,actor_id,action,previous_status,next_status,note,revision,created_at)
    SELECT ?,id,?,?,status,?,'',revision+1,? FROM project_updates WHERE ${guard}${quota}`).bind(...eventArgs)];
  const next=input.action==='save'?input.content:content(row);
  statements.push(db.prepare(`UPDATE project_updates SET kind=?,title=?,body=?,link_label=?,link_url=?,status=?,review_note=?,revision=revision+1,updated_at=?
    WHERE ${guard} AND EXISTS(SELECT 1 FROM project_update_events e WHERE e.id=? AND e.update_id=project_updates.id AND e.revision=project_updates.revision+1)`)
    .bind(next.kind,next.title,next.body,next.linkLabel,next.linkUrl,nextStatus,input.action==='submit'?'':row.review_note,now,id,user.userId,row.revision,row.status,eventId));
  if(input.action==='submit')statements.push(...pendingNotifications(db,{kind:'update',id,projectName:row.project_name,revision:row.revision+1,now}));
  let results:D1Result[];
  try{results=await db.batch(statements);}catch(error){return translateUnique(error);}
  if(results[0]?.meta.changes!==1||results[1]?.meta.changes!==1){
    if(input.action==='submit'){
      const quotaCount=await db.prepare("SELECT COUNT(*) AS count FROM project_update_events WHERE actor_id=? AND action='submit' AND created_at>=?").bind(user.userId,now-DAY).first<{count:number}>();
      if((quotaCount?.count??0)>=UPDATE_SUBMISSIONS_PER_DAY)throw new InputError(`You can send up to ${UPDATE_SUBMISSIONS_PER_DAY} updates for review in 24 hours.`,429);
    }
    throw new InputError('This update or its project ownership changed. Refresh before continuing.',409);
  }
  return privateProjectUpdate(await readOwnRow(db,user.userId,id));
}

export async function reviewProjectUpdate(db:D1Database,reviewerId:string,id:string,input:ReviewUpdateInput):Promise<ProjectUpdate> {
  const row=await db.prepare(`SELECT ${projection} FROM project_updates WHERE id=?`).bind(id).first<UpdateRow>();
  if(!row)throw new InputError('This project update was not found.',404);
  const expectedStatus=input.action==='archive'?'approved':'pending';
  if(row.status!==expectedStatus||row.revision!==input.expectedRevision)throw new InputError('This update changed. Refresh the review queue.',409);
  if(input.action==='approve'){
    validateUpdateContent(content(row),true);
    await findPublicProject(db,row.project_id);
    if(row.can_manage!==1)throw new InputError('The publisher no longer has current project ownership. This update cannot be approved.',409);
  }
  const status:UpdateStatus=input.action==='approve'?'approved':input.action==='reject'?'rejected':'archived';
  const now=Date.now(),eventId=crypto.randomUUID();
  const eligibility=input.action==='approve'?` AND ${rowEligibility}`:'';
  const guard=`id=? AND revision=? AND status=?${eligibility}`;
  const results=await db.batch([
    db.prepare(`INSERT INTO project_update_events(id,update_id,actor_id,action,previous_status,next_status,note,revision,created_at)
      SELECT ?,id,?,?,status,?,?,revision+1,? FROM project_updates WHERE ${guard}`)
      .bind(eventId,reviewerId,input.action,status,input.note,now,id,row.revision,row.status),
    db.prepare(`UPDATE project_updates SET status=?,review_note=?,revision=revision+1,updated_at=?,published_at=?
      WHERE ${guard} AND EXISTS(SELECT 1 FROM project_update_events e WHERE e.id=? AND e.update_id=project_updates.id AND e.revision=project_updates.revision+1)`)
      .bind(status,input.note,now,input.action==='approve'?now:row.published_at,id,row.revision,row.status,eventId),
  ]);
  if(results[0]?.meta.changes!==1||results[1]?.meta.changes!==1)throw new InputError('This update or project ownership changed. Nothing was published.',409);
  const saved=await db.prepare(`SELECT ${projection} FROM project_updates WHERE id=?`).bind(id).first<UpdateRow>();
  if(!saved)throw new Error('Reviewed update was not readable');
  return privateProjectUpdate(saved,true);
}
