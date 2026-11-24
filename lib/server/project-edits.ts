import { getSeedProjects } from '@/lib/catalog';
import { InputError, type ProjectEditInput } from '@/lib/submission-validation';
import type { PlatformIdentity } from './auth';
import type { OwnerRow } from './claims';
import { catalog, findPublicProject } from './repository';
import { pendingNotifications } from './outbox-events';

export type EditRow={id:string;project_id:string;project_name:string;user_id:string;ownership_revision:number;base_revision:number;payload_json:string;
  status:'pending'|'approved'|'rejected';review_note:string;revision:number;created_at:number;updated_at:number};
export function privateEdit(row:EditRow,admin=false){
  const payload=JSON.parse(row.payload_json) as ProjectEditInput;
  return {id:row.id,projectId:row.project_id,projectName:row.project_name,summary:payload.summary,category:payload.category,stage:payload.stage,
    website:payload.website,launchUrl:payload.launchUrl,xProfile:payload.xProfile,links:payload.links,baseRevision:row.base_revision,
    status:row.status,reviewNote:row.review_note,revision:row.revision,createdAt:row.created_at,updatedAt:row.updated_at,
    ...(admin?{userId:row.user_id}:{})};
}
export async function ownProjectEdits(db:D1Database,userId:string){
  const rows=await db.prepare('SELECT * FROM project_edits WHERE user_id=? ORDER BY updated_at DESC LIMIT 100').bind(userId).all<EditRow>();
  return rows.results.map(row=>privateEdit(row));
}
export async function ownedProjects(db:D1Database,userId:string){
  const [directory,owners,overrides,edits]=await Promise.all([
    catalog(db),db.prepare("SELECT * FROM project_owners WHERE user_id=? AND status='active'").bind(userId).all<OwnerRow>(),
    db.prepare('SELECT project_id,revision,payload_json FROM project_overrides').all<{project_id:string;revision:number;payload_json:string}>(),ownProjectEdits(db,userId),
  ]);
  const owned=new Set(owners.results.map(row=>row.project_id));
  const published=new Map(overrides.results.map(row=>[row.project_id,row]));
  return {projects:directory.projects.filter(project=>owned.has(project.id)).map(project=>{
    const override=published.get(project.id);
    const editableLinks=override?(JSON.parse(override.payload_json) as ProjectEditInput).links:project.links;
    return {project,revision:override?.revision??0,editableLinks};
  }),edits};
}
export async function editsQueue(db:D1Database){
  const rows=await db.prepare("SELECT * FROM project_edits ORDER BY CASE status WHEN 'pending' THEN 0 ELSE 1 END,updated_at DESC LIMIT 200").all<EditRow>();
  return rows.results.map(row=>privateEdit(row,true));
}
export async function createProjectEdit(db:D1Database,user:PlatformIdentity,input:ProjectEditInput){
  const owner=await db.prepare("SELECT * FROM project_owners WHERE project_id=? AND user_id=? AND status='active'").bind(input.projectId,user.userId).first<OwnerRow>();
  if(!owner)throw new InputError('This project is not available in your verified builder account.',404);
  const project=await findPublicProject(db,input.projectId);
  // Only the immutable curated record can supply a collection ownership anchor.
  // A submitted destination link or arbitrary launch URL cannot establish it.
  const trustedCollection=getSeedProjects().find(value=>value.id===input.projectId)?.collections?.[0]?.url;
  if(!input.website&&!input.xProfile&&!trustedCollection)throw new InputError('Provide an official website or X profile for this project.');
  const normalizedInput={...input,launchUrl:input.launchUrl||input.website||input.xProfile||trustedCollection||''};
  const now=Date.now(),id=crypto.randomUUID();
  const payload=JSON.stringify(normalizedInput);
  let results:D1Result[];
  try{
    results=await db.batch([
      db.prepare(`INSERT INTO project_edits (id,project_id,project_name,user_id,ownership_revision,base_revision,payload_json,status,review_note,revision,created_at,updated_at)
        SELECT ?,?,?,?,?,?,?,'pending','',1,?,?
        WHERE EXISTS(SELECT 1 FROM project_owners WHERE project_id=? AND user_id=? AND status='active' AND revision=?)
        AND COALESCE((SELECT revision FROM project_overrides WHERE project_id=?),0)=?
        AND (SELECT COUNT(*) FROM project_edits WHERE user_id=? AND created_at>=?)<5`)
        .bind(id,input.projectId,project.name,user.userId,owner.revision,input.baseRevision,payload,now,now,
          input.projectId,user.userId,owner.revision,input.projectId,input.baseRevision,user.userId,now-86_400_000),
      ...pendingNotifications(db,{kind:'edit',id,projectName:project.name,revision:1,now}),
    ]);
  }catch(error){
    if(error instanceof Error&&/UNIQUE constraint failed.*project_edits/i.test(error.message))throw new InputError('This project already has an edit awaiting review. Wait for its decision before submitting another.',409);
    throw error;
  }
  if(results[0]?.meta.changes!==1){
    const count=await db.prepare('SELECT COUNT(*) AS count FROM project_edits WHERE user_id=? AND created_at>=?').bind(user.userId,now-86_400_000).first<{count:number}>();
    if((count?.count??0)>=5)throw new InputError('You can submit up to 5 project edits in 24 hours.',429);
    throw new InputError('Ownership or published content changed. Refresh your project before sending the edit.',409);
  }
  const row=await db.prepare('SELECT * FROM project_edits WHERE id=? AND user_id=?').bind(id,user.userId).first<EditRow>();
  if(!row)throw new Error('Saved project edit was not readable');
  return privateEdit(row);
}
export async function reviewProjectEdit(db:D1Database,reviewerId:string,id:string,decision:{action:'approve'|'reject';note:string;expectedRevision:number}){
  const row=await db.prepare('SELECT * FROM project_edits WHERE id=?').bind(id).first<EditRow>();
  if(!row)throw new InputError('This edit was not found.',404);
  if(row.status!=='pending'||row.revision!==decision.expectedRevision)throw new InputError('This edit changed. Refresh the queue before reviewing it.',409);
  const now=Date.now(),nextStatus=decision.action==='approve'?'approved':'rejected';
  // Fresh ownership and content checks remain in SQL, so a concurrent revocation
  // or approval cannot publish stale content after this read.
  const ownership="EXISTS(SELECT 1 FROM project_owners o WHERE o.project_id=project_edits.project_id AND o.user_id=project_edits.user_id AND o.status='active' AND o.revision=project_edits.ownership_revision)";
  const freshContent="COALESCE((SELECT revision FROM project_overrides p WHERE p.project_id=project_edits.project_id),0)=project_edits.base_revision";
  const guard=decision.action==='approve'?` AND ${ownership} AND ${freshContent}`:'';
  const statements:D1PreparedStatement[]=[
    db.prepare(`INSERT INTO edit_review_events (id,edit_id,reviewer_id,previous_status,next_status,note,revision,created_at)
      SELECT ?,id,?,status,?,?,revision+1,? FROM project_edits WHERE id=? AND revision=? AND status='pending'${guard}`)
      .bind(crypto.randomUUID(),reviewerId,nextStatus,decision.note,now,id,row.revision),
  ];
  if(decision.action==='approve')statements.push(
    db.prepare(`INSERT INTO project_overrides (project_id,payload_json,revision,edit_id,updated_at)
      SELECT project_id,payload_json,base_revision+1,id,? FROM project_edits WHERE id=? AND revision=? AND status='pending' AND ${ownership} AND ${freshContent}
      ON CONFLICT(project_id) DO UPDATE SET payload_json=excluded.payload_json,revision=excluded.revision,edit_id=excluded.edit_id,updated_at=excluded.updated_at
      WHERE project_overrides.revision=excluded.revision-1`).bind(now,id,row.revision),
  );
  const publishedGuard=decision.action==='approve'?` AND ${ownership} AND EXISTS(SELECT 1 FROM project_overrides p WHERE p.project_id=project_edits.project_id AND p.edit_id=project_edits.id AND p.revision=project_edits.base_revision+1)`:'';
  statements.push(db.prepare(`UPDATE project_edits SET status=?,review_note=?,revision=revision+1,updated_at=? WHERE id=? AND revision=? AND status='pending'${publishedGuard}`)
    .bind(nextStatus,decision.note,now,id,row.revision));
  const results=await db.batch(statements);
  if(results[0]?.meta.changes!==1||results.at(-1)?.meta.changes!==1)throw new InputError('Ownership or published content changed. This edit was not published.',409);
  const updated=await db.prepare('SELECT * FROM project_edits WHERE id=?').bind(id).first<EditRow>();
  if(!updated)throw new Error('Reviewed project edit was not readable');
  return privateEdit(updated,true);
}
