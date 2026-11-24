import {getSeedProjects} from '@/lib/catalog';
import {ARTWORK_ID_PATTERN,validateArtworkImage,type ArtworkKind} from '@/lib/project-artwork-validation';
import {InputError} from '@/lib/submission-validation';
import {controlActorGuard,type ControlActor} from './control-access';
import {auditInsert} from './control-audit';
import {publicProjectSql} from './control-visibility';
import {privateControlArtwork,type ControlArtworkRow} from './control-artwork-model';
export {privateControlArtwork,publicControlArtwork,type ControlArtworkRow} from './control-artwork-model';

export const CONTROL_ARTWORK_UPLOAD_LIMIT=32;
const curatedIds=getSeedProjects().map(project=>`'${project.id.replace(/'/g,"''")}'`).join(',')||"''";
function knownProjectSql(id:string){return `(${id} IN (${curatedIds}) OR EXISTS(SELECT 1 FROM submissions s WHERE 'community-'||s.id=${id} AND s.status IN ('approved','suspended')) OR EXISTS(SELECT 1 FROM project_controls c WHERE c.project_id=${id} AND c.source='admin'))`;}
function requireArtworkCapability(actor:ControlActor){if(!actor.emailVerified||!actor.capabilities.includes('projects'))throw new InputError('Your RMT role does not allow project artwork changes.',403);}
export async function assertControlArtworkProject(db:D1Database,actor:ControlActor,projectId:string){
 requireArtworkCapability(actor);if(!/^[a-zA-Z0-9_-]{1,120}$/.test(projectId))throw new InputError('This project was not found.',404);
 const guard=controlActorGuard(actor);
 const exists=await db.prepare(`WITH candidate(id) AS (SELECT ?) SELECT id FROM candidate WHERE ${knownProjectSql('candidate.id')} AND (${guard.sql})`).bind(projectId,...guard.args).first();
 if(!exists)throw new InputError('This project or your administrator access is no longer available.',404);
}
export async function controlArtworkList(db:D1Database,actor:ControlActor,projectId:string){
 await assertControlArtworkProject(db,actor,projectId);const guard=controlActorGuard(actor);
 const rows=await db.prepare(`SELECT a.* FROM control_project_artwork a WHERE a.project_id=? AND a.status='ready' AND (${guard.sql})
  ORDER BY CASE WHEN EXISTS(SELECT 1 FROM project_controls c WHERE c.project_id=a.project_id AND c.artwork_override=1 AND (c.logo_asset_id=a.id OR c.banner_asset_id=a.id)) THEN 0 ELSE 1 END,
   a.created_at DESC,a.id DESC LIMIT 60`).bind(projectId,...guard.args).all<ControlArtworkRow>();
 return rows.results.map(privateControlArtwork);
}
export async function uploadControlArtwork(db:D1Database,bucket:R2Bucket,actor:ControlActor,projectId:string,kind:ArtworkKind,bytes:Uint8Array,mime:string){
 await assertControlArtworkProject(db,actor,projectId);
 if(mime!=='image/png')throw new InputError('Prepare this image using the RMT image uploader.',415);
 const image=await validateArtworkImage(bytes,mime,kind),now=Date.now(),id=crypto.randomUUID(),objectKey='control-project-artwork/'+id;
 const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',Uint8Array.from(image.bytes).buffer))).map(byte=>byte.toString(16).padStart(2,'0')).join('');
 const permission=controlActorGuard(actor);
 const reserved=await db.prepare(`WITH candidate(project_id) AS (SELECT ?)
  INSERT INTO control_project_artwork(id,project_id,uploader_id,object_key,kind,mime,width,height,byte_size,digest,status,created_at)
  SELECT ?,project_id,?,?,?,?,?,?,?,?,'uploading',? FROM candidate
  WHERE ${knownProjectSql('candidate.project_id')} AND (${permission.sql})
  AND (SELECT COUNT(*) FROM control_project_artwork WHERE uploader_id=? AND created_at>=?)<?`)
  .bind(projectId,id,actor.userId,objectKey,kind,image.mime,image.width,image.height,image.bytes.length,digest,now,...permission.args,actor.userId,now-86_400_000,CONTROL_ARTWORK_UPLOAD_LIMIT).run();
 if(reserved.meta.changes!==1){
  const quota=await db.prepare('SELECT COUNT(*) AS count FROM control_project_artwork WHERE uploader_id=? AND created_at>=?').bind(actor.userId,now-86_400_000).first<{count:number}>();
  if((quota?.count??0)>=CONTROL_ARTWORK_UPLOAD_LIMIT)throw new InputError('You can stage up to 32 project images in 24 hours. Reuse an uploaded image or try again later.',429);
  throw new InputError('The project or your administrator access changed. Refresh before uploading.',409);
 }
 try{
  await bucket.put(objectKey,image.bytes,{httpMetadata:{contentType:'image/png'},customMetadata:{digest}});
  const eventId=crypto.randomUUID();
  const ready=await db.batch([
   auditInsert(db,actor,{id:eventId,action:'project.artwork_upload',entityType:'project',entityId:projectId,reason:'Staged administrator artwork for a project preview.',after:{assetId:id,kind,width:image.width,height:image.height},now},{sql:"EXISTS(SELECT 1 FROM control_project_artwork WHERE id=? AND status='uploading')",args:[id]}),
   db.prepare("UPDATE control_project_artwork SET status='ready' WHERE id=? AND status='uploading' AND EXISTS(SELECT 1 FROM control_audit_events WHERE id=?)").bind(id,eventId),
  ]);
  if(ready[0]?.meta.changes!==1||ready[1]?.meta.changes!==1)throw new InputError('Your administrator access changed during the upload. Refresh before trying again.',409);
 }catch(error){await db.prepare("UPDATE control_project_artwork SET status='failed' WHERE id=?").bind(id).run();await bucket.delete(objectKey).catch(()=>{});throw error;}
 const row=await privateControlArtworkRow(db,actor,id);return privateControlArtwork(row);
}
export async function privateControlArtworkRow(db:D1Database,actor:ControlActor,id:string):Promise<ControlArtworkRow>{
 requireArtworkCapability(actor);if(!ARTWORK_ID_PATTERN.test(id))throw new InputError('This image was not found.',404);
 const guard=controlActorGuard(actor);
 const row=await db.prepare(`SELECT * FROM control_project_artwork WHERE id=? AND status='ready' AND (${guard.sql})`).bind(id,...guard.args).first<ControlArtworkRow>();
 if(!row)throw new InputError('This image was not found.',404);return row;
}
export async function publicControlArtworkRow(db:D1Database,id:string):Promise<ControlArtworkRow>{
 if(!ARTWORK_ID_PATTERN.test(id))throw new InputError('This image was not found.',404);
 const row=await db.prepare(`SELECT a.* FROM control_project_artwork a JOIN project_controls c ON c.project_id=a.project_id AND c.artwork_override=1
  WHERE a.id=? AND a.status='ready' AND ((a.kind='logo' AND c.logo_asset_id=a.id) OR (a.kind='banner' AND c.banner_asset_id=a.id)) AND ${publicProjectSql('a.project_id')}`).bind(id).first<ControlArtworkRow>();
 if(!row)throw new InputError('This image was not found.',404);return row;
}
export function controlArtworkSelectionGuard(projectId:string,logo:string|null,banner:string|null){
 return{sql:([['logo',logo],['banner',banner]] as const).map(()=>`(? IS NULL OR EXISTS(SELECT 1 FROM control_project_artwork WHERE id=? AND project_id=? AND kind=? AND status='ready'))`).join(' AND '),args:[logo,logo,projectId,'logo',banner,banner,projectId,'banner']};
}
export async function assertControlArtworkSelection(db:D1Database,projectId:string,logo:string|null,banner:string|null){
 const guard=controlArtworkSelectionGuard(projectId,logo,banner);
 if(!await db.prepare(`SELECT 1 AS found WHERE ${guard.sql}`).bind(...guard.args).first())throw new InputError('Choose a ready administrator image belonging to this project and image slot.',404);
}
