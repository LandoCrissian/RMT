import { getSeedProjects, type PublicArtwork } from '@/lib/catalog';
import { InputError, type ProjectEditInput } from '@/lib/submission-validation';
import { ARTWORK_BYTE_LIMIT, ARTWORK_ID_PATTERN, ARTWORK_UPLOAD_LIMIT, validateArtworkImage, type ArtworkKind, type ArtworkMime } from '@/lib/project-artwork-validation';
import { hasSameOrigin, type PlatformIdentity } from './auth';
import {publicProjectSql} from './control-visibility';
import {activeControlMemberSql} from './control-sql';

export type ArtworkRow = {
  id: string; project_id: string; user_id: string; ownership_revision: number; kind: ArtworkKind;
  object_key: string; mime: ArtworkMime; width: number; height: number; byte_size: number;
  digest: string; status: 'uploading'|'ready'|'failed'; created_at: number;
};
export const publicArtworkPath = (id: string) => '/media/project-artwork/' + encodeURIComponent(id);
export function publicArtwork(row: ArtworkRow): PublicArtwork {
  return {id: row.id, url: publicArtworkPath(row.id), width: row.width, height: row.height, mime: row.mime};
}
export function privateArtwork(row: ArtworkRow) {
  return {id: row.id, kind: row.kind, width: row.width, height: row.height, mime: row.mime, byteSize: row.byte_size,
    previewUrl: '/api/project-artwork/' + encodeURIComponent(row.id), createdAt: row.created_at};
}
export async function isPublicArtworkProject(db:D1Database,projectId:string):Promise<boolean>{
  return Boolean(await db.prepare(`WITH candidate(project_id) AS (SELECT ?) SELECT project_id FROM candidate WHERE ${publicProjectSql('candidate.project_id')}`).bind(projectId).first());
}

export async function assertArtworkOwner(db: D1Database, user: PlatformIdentity, projectId: string) {
  if (!user.emailVerified) throw new InputError('Verify your email before uploading project artwork.', 403);
  if (!projectId || projectId.length > 120 || !await isPublicArtworkProject(db, projectId)) throw new InputError('This project is not available.',404);
  const owner = await db.prepare(`SELECT revision FROM project_owners WHERE project_id=? AND user_id=? AND status='active' AND ${activeControlMemberSql('user_id')}`).bind(projectId,user.userId).first<{revision:number}>();
  if (!owner) throw new InputError('Only this project’s confirmed manager can upload artwork.',404);
  return owner;
}

export async function readArtworkUpload(request: Request): Promise<{bytes: Uint8Array; mime: string}> {
  if (!hasSameOrigin(request)) throw new InputError('Upload from the RMT website.',403);
  const mime = request.headers.get('content-type')?.toLowerCase() ?? '';
  if (mime !== 'image/png') throw new InputError('Prepare this image using the RMT image uploader.',415);
  const length = request.headers.get('content-length');
  if (length && (!/^\d+$/.test(length) || Number(length) > ARTWORK_BYTE_LIMIT)) throw new InputError('Use an image smaller than 2 MB.',413);
  if (!request.body) throw new InputError('Choose an image to upload.');
  const reader = request.body.getReader(), parts: Uint8Array[] = []; let total = 0;
  while (true) {
    const {done,value} = await reader.read(); if (done) break;
    total += value.length;
    if (total > ARTWORK_BYTE_LIMIT) { await reader.cancel(); throw new InputError('Use an image smaller than 2 MB.',413); }
    parts.push(value);
  }
  const bytes = new Uint8Array(total); let at = 0;
  for (const part of parts) { bytes.set(part,at); at += part.length; }
  return {bytes,mime};
}

export async function uploadProjectArtwork(db: D1Database, bucket: R2Bucket, user: PlatformIdentity, projectId: string, kind: ArtworkKind, bytes: Uint8Array, mime: string) {
  const owner = await assertArtworkOwner(db,user,projectId);
  // JPEG/WebP input is decoded and normalized in the browser. Never accept their
  // compressed payloads here: header validation alone cannot prove full decoding.
  if (mime !== 'image/png') throw new InputError('Prepare this image using the RMT image uploader.',415);
  const image = await validateArtworkImage(bytes,mime,kind);
  const now = Date.now(), id = crypto.randomUUID(), objectKey = 'project-artwork/' + id;
  const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',Uint8Array.from(image.bytes).buffer))).map(byte => byte.toString(16).padStart(2,'0')).join('');
  const inserted = await db.prepare(`INSERT INTO project_artwork (id,project_id,user_id,ownership_revision,kind,object_key,mime,width,height,byte_size,digest,status,created_at)
    SELECT ?,?,?,?,?,?,?,?,?,?,?,'uploading',?
    WHERE EXISTS(SELECT 1 FROM project_owners WHERE project_id=? AND user_id=? AND status='active' AND revision=? AND ${activeControlMemberSql('user_id')})
    AND (SELECT COUNT(*) FROM project_artwork WHERE user_id=? AND created_at>=?)<?`)
    .bind(id,projectId,user.userId,owner.revision,kind,objectKey,image.mime,image.width,image.height,image.bytes.length,digest,now,
      projectId,user.userId,owner.revision,user.userId,now-86_400_000,ARTWORK_UPLOAD_LIMIT).run();
  if (inserted.meta.changes !== 1) {
    const quota = await db.prepare('SELECT COUNT(*) AS count FROM project_artwork WHERE user_id=? AND created_at>=?').bind(user.userId,now-86_400_000).first<{count:number}>();
    if ((quota?.count ?? 0) >= ARTWORK_UPLOAD_LIMIT) throw new InputError('You can upload up to 8 images in 24 hours. Reuse an uploaded image or try again later.',429);
    throw new InputError('Project ownership changed. Refresh before uploading.',409);
  }
  try {
    await bucket.put(objectKey,image.bytes,{httpMetadata:{contentType:image.mime},customMetadata:{digest}});
    const ready = await db.prepare(`UPDATE project_artwork SET status='ready' WHERE id=? AND status='uploading'
      AND EXISTS(SELECT 1 FROM project_owners WHERE project_id=? AND user_id=? AND status='active' AND revision=? AND ${activeControlMemberSql('user_id')})`)
      .bind(id,projectId,user.userId,owner.revision).run();
    if (ready.meta.changes !== 1) throw new InputError('Project ownership changed during this upload. Refresh before trying again.',409);
  } catch (error) {
    await db.prepare("UPDATE project_artwork SET status='failed' WHERE id=?").bind(id).run();
    await bucket.delete(objectKey).catch(() => {});
    throw error;
  }
  const row = await db.prepare('SELECT * FROM project_artwork WHERE id=?').bind(id).first<ArtworkRow>();
  if (!row) throw new Error('Uploaded artwork was not readable');
  return privateArtwork(row);
}

export async function ownerArtwork(db: D1Database, user: PlatformIdentity, projectId: string) {
  const owner = await assertArtworkOwner(db,user,projectId);
  const rows = await db.prepare("SELECT * FROM project_artwork WHERE project_id=? AND user_id=? AND ownership_revision=? AND status='ready' ORDER BY created_at DESC LIMIT 30")
    .bind(projectId,user.userId,owner.revision).all<ArtworkRow>();
  return rows.results.map(privateArtwork);
}

/** Only the current published override may carry forward another manager's already-public image. */
export function artworkEditGuard(alias = 'project_edits'): string {
  if (!/^[a-z_]+$/.test(alias)) throw new Error('Invalid SQL alias');
  return (['logo','banner'] as const).map(kind => {
    const path = '$.' + kind + 'AssetId';
    return `(json_extract(${alias}.payload_json,'${path}') IS NULL OR EXISTS(SELECT 1 FROM project_artwork a
      WHERE a.id=json_extract(${alias}.payload_json,'${path}') AND a.project_id=${alias}.project_id AND a.kind='${kind}' AND a.status='ready'
      AND ((a.user_id=${alias}.user_id AND a.ownership_revision=${alias}.ownership_revision)
        OR EXISTS(SELECT 1 FROM project_overrides p JOIN project_edits e ON e.id=p.edit_id AND e.status='approved'
          WHERE p.project_id=${alias}.project_id AND json_extract(p.payload_json,'${path}')=a.id))))`;
  }).join(' AND ');
}

export async function normalizeEditArtwork(db: D1Database, userId: string, ownerRevision: number, input: ProjectEditInput): Promise<ProjectEditInput> {
  const published = await db.prepare("SELECT p.payload_json FROM project_overrides p JOIN project_edits e ON e.id=p.edit_id AND e.status='approved' WHERE p.project_id=?").bind(input.projectId).first<{payload_json:string}>();
  const previous = published ? JSON.parse(published.payload_json) as ProjectEditInput : {} as ProjectEditInput;
  const admin = await db.prepare('SELECT artwork_override,logo_asset_id,banner_asset_id FROM project_controls WHERE project_id=?').bind(input.projectId).first<{artwork_override:number;logo_asset_id:string|null;banner_asset_id:string|null}>();
  const result = {...input};
  for (const kind of ['logo','banner'] as const) {
    const key = `${kind}AssetId` as const;
    let id = input[key] === undefined ? previous[key] ?? null : input[key];
    // An older builder form may have initialized its fields from public admin
    // images. Retain the prior builder selection for this exact published asset;
    // this never grants access to arbitrary administrator uploads.
    const selectedAdminId=kind==='logo'?admin?.logo_asset_id:admin?.banner_asset_id;
    if(id&&admin?.artwork_override===1&&id===selectedAdminId)id=previous[key]??null;
    if (id) {
      if (!ARTWORK_ID_PATTERN.test(id)) throw new InputError('Choose valid project artwork.');
      const row = await db.prepare("SELECT * FROM project_artwork WHERE id=? AND project_id=? AND kind=? AND status='ready'").bind(id,input.projectId,kind).first<ArtworkRow>();
      if (!row || ((row.user_id !== userId || row.ownership_revision !== ownerRevision) && previous[key] !== id)) throw new InputError('This image is not available for this project. Upload your own image or keep the currently approved artwork.',404);
    }
    result[key] = id;
  }
  return result;
}

export async function privateArtworkRow(db: D1Database, id: string, userId: string, reviewer: boolean): Promise<ArtworkRow> {
  if (!ARTWORK_ID_PATTERN.test(id)) throw new InputError('This image was not found.',404);
  const row = await db.prepare("SELECT * FROM project_artwork WHERE id=? AND status='ready'").bind(id).first<ArtworkRow>();
  if (!row) throw new InputError('This image was not found.',404);
  if (!reviewer) {
    const owner = row.user_id === userId && await db.prepare("SELECT project_id FROM project_owners WHERE project_id=? AND user_id=? AND status='active' AND revision=?")
      .bind(row.project_id,userId,row.ownership_revision).first();
    if (!owner) throw new InputError('This image was not found.',404);
  }
  return row;
}

export async function publicArtworkRow(db: D1Database, id: string): Promise<ArtworkRow> {
  if (!ARTWORK_ID_PATTERN.test(id)) throw new InputError('This image was not found.',404);
  const row = await db.prepare(`SELECT a.* FROM project_artwork a
    JOIN project_overrides p ON p.project_id=a.project_id
    JOIN project_edits e ON e.id=p.edit_id AND e.status='approved'
    WHERE a.id=? AND a.status='ready'
      AND NOT EXISTS(SELECT 1 FROM project_controls c WHERE c.project_id=a.project_id AND c.artwork_override=1) AND
      ((a.kind='logo' AND json_extract(p.payload_json,'$.logoAssetId')=a.id)
       OR (a.kind='banner' AND json_extract(p.payload_json,'$.bannerAssetId')=a.id))`).bind(id).first<ArtworkRow>();
  if (!row || !await isPublicArtworkProject(db,row.project_id)) throw new InputError('This image was not found.',404);
  return row;
}

export async function artworkResponse(bucket: R2Bucket, row: Pick<ArtworkRow,'id'|'object_key'|'byte_size'|'mime'|'kind'>, head = false): Promise<Response> {
  const object = await bucket.get(row.object_key);
  if (!object || object.size !== row.byte_size) throw new InputError('This image is temporarily unavailable.',404);
  return new Response(head ? null : object.body,{headers:{'Content-Type':row.mime,'Content-Length':String(row.byte_size),
    'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox",
    'Content-Disposition':`inline; filename="${row.kind}-${row.id}.${row.mime === 'image/jpeg' ? 'jpg' : row.mime.split('/')[1]}"`}});
}
