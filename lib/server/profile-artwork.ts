import {InputError} from '@/lib/submission-validation';
import {ARTWORK_ID_PATTERN,validateArtworkImage} from '@/lib/project-artwork-validation';
import {PROFILE_UPLOAD_LIMIT,type ProfileArtwork,type ProfileArtworkKind,type UploadedProfileArtwork} from '@/lib/profiles';
import type {PlatformIdentity} from './auth';
import {publicProfileSql} from './control-visibility';
import {readArtworkUpload} from './project-artwork';
export {readArtworkUpload as readProfileArtworkUpload};

export type ProfileArtworkRow={id:string;user_id:string;kind:ProfileArtworkKind;object_key:string;mime:'image/png';width:number;height:number;byte_size:number;digest:string;status:'uploading'|'ready'|'failed';created_at:number};
export const profileArtworkPath=(id:string)=>'/media/profile-artwork/'+encodeURIComponent(id);
export const profileArtworkPreviewPath=(id:string)=>'/api/profile-artwork/'+encodeURIComponent(id);
export function profileArtworkDto(row:ProfileArtworkRow,privateImage=false):ProfileArtwork {
  return{id:row.id,kind:row.kind,url:privateImage?profileArtworkPreviewPath(row.id):profileArtworkPath(row.id),width:row.width,height:row.height,mime:row.mime};
}
function privateAsset(row:ProfileArtworkRow):UploadedProfileArtwork {
  return{...profileArtworkDto(row,true),previewUrl:profileArtworkPreviewPath(row.id),byteSize:row.byte_size,createdAt:row.created_at};
}
export async function uploadProfileArtwork(db:D1Database,bucket:R2Bucket,user:PlatformIdentity,kind:ProfileArtworkKind,bytes:Uint8Array,mime:string):Promise<UploadedProfileArtwork> {
  if(!user.emailVerified)throw new InputError('Verify your email before uploading profile artwork.',403);
  if(kind!=='avatar'&&kind!=='banner')throw new InputError('Choose an avatar or banner image.');
  if(mime!=='image/png')throw new InputError('Prepare this image using the RMT image uploader.',415);
  const image=await validateArtworkImage(bytes,mime,kind==='avatar'?'logo':'banner');
  const id=crypto.randomUUID(),now=Date.now(),key='profile-artwork/'+id;
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',Uint8Array.from(image.bytes).buffer))).map(byte=>byte.toString(16).padStart(2,'0')).join('');
  const inserted=await db.prepare(`INSERT INTO profile_artwork(id,user_id,kind,object_key,mime,width,height,byte_size,digest,status,created_at)
    SELECT ?,?,?,?,?,?,?,?,?,'uploading',? WHERE (SELECT COUNT(*) FROM profile_artwork WHERE user_id=? AND created_at>=?)<?`)
    .bind(id,user.userId,kind,key,'image/png',image.width,image.height,image.bytes.length,digest,now,user.userId,now-86_400_000,PROFILE_UPLOAD_LIMIT).run();
  if(inserted.meta.changes!==1)throw new InputError(`You can upload up to ${PROFILE_UPLOAD_LIMIT} profile images in 24 hours. Reuse an existing image or try again later.`,429);
  try{
    await bucket.put(key,image.bytes,{httpMetadata:{contentType:'image/png'},customMetadata:{digest}});
    const ready=await db.prepare("UPDATE profile_artwork SET status='ready' WHERE id=? AND user_id=? AND status='uploading'").bind(id,user.userId).run();
    if(ready.meta.changes!==1)throw new InputError('This upload could not be completed. Try again.',409);
  }catch(error){
    await db.prepare("UPDATE profile_artwork SET status='failed' WHERE id=? AND user_id=?").bind(id,user.userId).run();
    await bucket.delete(key).catch(()=>{});throw error;
  }
  const row=await db.prepare("SELECT * FROM profile_artwork WHERE id=? AND user_id=? AND status='ready'").bind(id,user.userId).first<ProfileArtworkRow>();
  if(!row)throw new Error('Saved profile artwork was not readable');
  return privateAsset(row);
}
export async function ownProfileArtwork(db:D1Database,userId:string):Promise<UploadedProfileArtwork[]> {
  const rows=await db.prepare("SELECT * FROM profile_artwork WHERE user_id=? AND status='ready' ORDER BY created_at DESC,id DESC LIMIT 30").bind(userId).all<ProfileArtworkRow>();
  return rows.results.map(privateAsset);
}
export async function privateProfileArtworkRow(db:D1Database,userId:string,id:string):Promise<ProfileArtworkRow> {
  if(!ARTWORK_ID_PATTERN.test(id))throw new InputError('This image was not found.',404);
  const row=await db.prepare("SELECT * FROM profile_artwork WHERE id=? AND user_id=? AND status='ready'").bind(id,userId).first<ProfileArtworkRow>();
  if(!row)throw new InputError('This image was not found.',404);
  return row;
}
export async function publicProfileArtworkRow(db:D1Database,id:string):Promise<ProfileArtworkRow> {
  if(!ARTWORK_ID_PATTERN.test(id))throw new InputError('This image was not found.',404);
  const row=await db.prepare(`SELECT a.* FROM profile_artwork a JOIN profiles p ON p.user_id=a.user_id AND ${publicProfileSql('p')}
    WHERE a.id=? AND a.status='ready' AND ((a.kind='avatar' AND p.avatar_asset_id=a.id) OR (a.kind='banner' AND p.banner_asset_id=a.id))`)
    .bind(id).first<ProfileArtworkRow>();
  if(!row)throw new InputError('This image was not found.',404);
  return row;
}
export async function profileArtworkResponse(bucket:R2Bucket,row:ProfileArtworkRow,head=false):Promise<Response> {
  const object=await bucket.get(row.object_key);
  if(!object||object.size!==row.byte_size)throw new InputError('This image is temporarily unavailable.',404);
  return new Response(head?null:object.body,{headers:{'Content-Type':'image/png','Content-Length':String(row.byte_size),
    'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox",
    'Content-Disposition':`inline; filename="${row.kind}-${row.id}.png"`}});
}
