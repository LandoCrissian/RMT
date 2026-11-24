import type {Project} from '@/lib/catalog';
import {normalizeProfileHandle,PROFILE_EDIT_LIMIT,profileHref,type PrivateProfile,type ProfileInput,type ProfileLink,type ProfileProject,type PublicProfile,type PublicProjectBuilder} from '@/lib/profiles';
import {InputError} from '@/lib/submission-validation';
import type {PlatformIdentity} from './auth';
import {catalog,findPublicProject} from './repository';
import {profileArtworkDto,type ProfileArtworkRow} from './profile-artwork';
import {json} from './http';
import {publicUpdateProjectGuard} from './project-updates';
import {publicProfileSql} from './control-visibility';
import {activeControlMemberSql,contentVisibleSql} from './control-sql';

export class ProfileConflict extends InputError {
  constructor(message:string,public code:'handle_taken'|'revision_conflict'|'handle_locked'){super(message,409);}
}
export type ProfileRow={user_id:string;handle:string|null;display_name:string;bio:string;visibility:'private'|'public';show_managed_projects:number;
  avatar_asset_id:string|null;banner_asset_id:string|null;links_json:string;last_mutation_id:string;revision:number;first_published_at:number|null;created_at:number;updated_at:number};
export function profileAccountConflict(request:Request,userId:string):Response|null {
  return request.headers.get('x-rmt-account')===userId?null:json({error:'Your account changed. Refresh before managing your profile.',code:'account_changed'},409);
}
function projectDto(project:Project):ProfileProject {
  const logo=project.artwork?.logo?.url||project.logo;
  return{id:project.id,slug:project.slug,name:project.name,tagline:project.tagline,category:project.category,cover:project.cover,initials:project.initials,accent:project.accent,
    ...(logo?{logo}:{}),...(project.coverFit?{coverFit:project.coverFit}:{}),...(project.coverAspectRatio?{coverAspectRatio:project.coverAspectRatio}:{})};
}
async function managedProjects(db:D1Database,userId:string):Promise<ProfileProject[]> {
  const directory=await catalog(db);
  // Recheck relationships after catalog reads; a suspended project or revoked
  // manager must not become a builder badge through a stale catalog snapshot.
  const owners=await db.prepare(`SELECT o.project_id FROM project_owners o WHERE o.user_id=? AND o.status='active' AND ${activeControlMemberSql('o.user_id')} AND ${publicUpdateProjectGuard('o')}`).bind(userId).all<{project_id:string}>();
  const ids=new Set(owners.results.map(row=>row.project_id));
  return directory.projects.filter(project=>ids.has(project.id)).map(projectDto);
}
async function images(db:D1Database,row:ProfileRow,privateImage:boolean) {
  const assets=await db.prepare("SELECT * FROM profile_artwork WHERE user_id=? AND status='ready' AND (id=? OR id=?)").bind(row.user_id,row.avatar_asset_id,row.banner_asset_id).all<ProfileArtworkRow>();
  const avatar=assets.results.find(asset=>asset.kind==='avatar'&&asset.id===row.avatar_asset_id);
  const banner=assets.results.find(asset=>asset.kind==='banner'&&asset.id===row.banner_asset_id);
  return{avatar:avatar?profileArtworkDto(avatar,privateImage):null,banner:banner?profileArtworkDto(banner,privateImage):null};
}
function links(row:ProfileRow):ProfileLink[] {return JSON.parse(row.links_json) as ProfileLink[];}
export async function ownProfile(db:D1Database,userId:string):Promise<PrivateProfile|null> {
  const row=await db.prepare('SELECT * FROM profiles WHERE user_id=?').bind(userId).first<ProfileRow>();
  if(!row)return null;
  const [artwork,projects]=await Promise.all([images(db,row,true),managedProjects(db,userId)]);
  return{handle:row.handle??'',displayName:row.display_name,bio:row.bio,visibility:row.visibility,showManagedProjects:row.show_managed_projects===1,
    avatarAssetId:row.avatar_asset_id,bannerAssetId:row.banner_asset_id,links:links(row),revision:row.revision,handleLocked:row.first_published_at!==null,
    firstPublishedAt:row.first_published_at,createdAt:row.created_at,updatedAt:row.updated_at,...artwork,managedProjects:projects,isBuilder:projects.length>0};
}
export async function publicProfile(db:D1Database,handle:string):Promise<PublicProfile> {
  let canonical:string;
  try{canonical=normalizeProfileHandle(handle);}catch{throw new InputError('This profile was not found.',404);}
  const row=await db.prepare(`SELECT * FROM profiles WHERE handle=? AND ${publicProfileSql('profiles')}`).bind(canonical).first<ProfileRow>();
  if(!row)throw new InputError('This profile was not found.',404);
  const [artwork,projects]=await Promise.all([images(db,row,false),row.show_managed_projects===1?managedProjects(db,row.user_id):Promise.resolve([])]);
  // Recheck profile visibility and builder relationships together after all
  // dependent reads. A concurrent hide, suspension or ownership change must not
  // leave stale public details or a builder badge in a fresh response.
  const current=await db.prepare(`SELECT p.user_id,o.project_id FROM profiles p LEFT JOIN project_owners o
    ON o.user_id=p.user_id AND p.show_managed_projects=1 AND o.status='active' AND ${activeControlMemberSql('o.user_id')} AND ${publicUpdateProjectGuard('o')}
    WHERE p.user_id=? AND ${publicProfileSql('p')} AND p.revision=?`).bind(row.user_id,row.revision).all<{user_id:string;project_id:string|null}>();
  if(!current.results.length)throw new InputError('This profile changed. Open it again to see its current details.',404);
  const currentIds=new Set(current.results.map(owner=>owner.project_id));
  const publicProjects=projects.filter(project=>currentIds.has(project.id));
  return{handle:row.handle!,displayName:row.display_name,bio:row.bio,links:links(row),...artwork,managedProjects:publicProjects,isBuilder:publicProjects.length>0};
}
export async function publicBuildersForProject(db:D1Database,projectId:string):Promise<{builders:PublicProjectBuilder[]}> {
  await findPublicProject(db,projectId);
  const rows=await db.prepare(`SELECT p.* FROM profiles p JOIN project_owners o ON o.user_id=p.user_id AND o.status='active'
    WHERE o.project_id=? AND ${publicProfileSql('p')} AND p.show_managed_projects=1 AND ${publicUpdateProjectGuard('o')} ORDER BY p.handle LIMIT 8`).bind(projectId).all<ProfileRow>();
  const builders:PublicProjectBuilder[]=[];
  for(const row of rows.results){
    const artwork=await images(db,row,false);
    const current=await db.prepare(`SELECT p.user_id FROM profiles p JOIN project_owners o ON o.user_id=p.user_id AND o.status='active'
      WHERE p.user_id=? AND p.revision=? AND ${publicProfileSql('p')} AND p.show_managed_projects=1 AND o.project_id=? AND ${publicUpdateProjectGuard('o')}`)
      .bind(row.user_id,row.revision,projectId).first();
    if(current)builders.push({handle:row.handle!,displayName:row.display_name,avatar:artwork.avatar,href:profileHref(row.handle!)});
  }
  return{builders};
}
function assetGuard(alias:string) {
  return(['avatar','banner'] as const).map(kind=>`(${alias}.${kind}_asset_id IS NULL OR EXISTS(SELECT 1 FROM profile_artwork a WHERE a.id=${alias}.${kind}_asset_id AND a.user_id=${alias}.user_id AND a.kind='${kind}' AND a.status='ready'))`).join(' AND ');
}
function translateUnique(error:unknown):never {
  if(error instanceof Error&&/UNIQUE constraint failed.*profiles.handle/i.test(error.message))throw new ProfileConflict('That handle is already in use. Choose another.','handle_taken');
  if(error instanceof Error&&/UNIQUE constraint failed.*(?:profiles.user_id|profile_events.user_id)/i.test(error.message))throw new ProfileConflict('Your profile changed. Refresh before saving again.','revision_conflict');
  throw error;
}
export async function saveProfile(db:D1Database,user:PlatformIdentity,input:ProfileInput):Promise<PrivateProfile> {
  if(!user.emailVerified)throw new InputError('Verify your email before saving a profile.',403);
  const eligible=await db.prepare(`SELECT 1 AS ok WHERE ${activeControlMemberSql('?')} AND (?<>'public' OR ${contentVisibleSql('profile','?')})`).bind(user.userId,input.visibility,user.userId).first();
  if(!eligible)throw new InputError('This profile is restricted by RMT moderation. You can keep it private or contact the site administrator.',403);
  const previous=await db.prepare('SELECT * FROM profiles WHERE user_id=?').bind(user.userId).first<ProfileRow>();
  if((previous?.revision??0)!==input.expectedRevision)throw new ProfileConflict('Your profile changed. Refresh before saving again.','revision_conflict');
  if(previous?.first_published_at!==null&&previous?.first_published_at!==undefined&&previous.handle!==input.handle)throw new ProfileConflict('Your handle is permanent after your profile is first published. Keep your existing handle.','handle_locked');
  for(const kind of ['avatar','banner'] as const){
    const id=input[`${kind}AssetId`];
    if(id&&!await db.prepare("SELECT id FROM profile_artwork WHERE id=? AND user_id=? AND kind=? AND status='ready'").bind(id,user.userId,kind).first())throw new InputError('This image is not available to your profile. Upload or choose your own image.',404);
  }
  const now=Date.now(),mutationId=crypto.randomUUID(),nextRevision=input.expectedRevision+1;
  const publication=previous?.first_published_at??(input.visibility==='public'?now:null);
  const candidate='candidate(user_id,handle,display_name,bio,visibility,show_managed_projects,avatar_asset_id,banner_asset_id,links_json,first_published_at,updated_at,last_mutation_id) AS (SELECT ?,?,?,?,?,?,?,?,?,?,?,?)';
  const args=[user.userId,input.handle||null,input.displayName,input.bio,input.visibility,Number(input.showManagedProjects),input.avatarAssetId,input.bannerAssetId,JSON.stringify(input.links),publication,now,mutationId];
  const statements:D1PreparedStatement[]=[];
  if(!previous){
    statements.push(db.prepare(`WITH ${candidate}
      INSERT INTO profiles(user_id,handle,display_name,bio,visibility,show_managed_projects,avatar_asset_id,banner_asset_id,links_json,revision,first_published_at,created_at,updated_at,last_mutation_id)
      SELECT user_id,handle,display_name,bio,visibility,show_managed_projects,avatar_asset_id,banner_asset_id,links_json,1,first_published_at,updated_at,updated_at,last_mutation_id FROM candidate WHERE ${assetGuard('candidate')} AND ${activeControlMemberSql('candidate.user_id')} AND (candidate.visibility<>'public' OR ${contentVisibleSql('profile','candidate.user_id')})`)
      .bind(...args));
  }else{
    statements.push(db.prepare(`WITH ${candidate}
      UPDATE profiles SET handle=candidate.handle,display_name=candidate.display_name,bio=candidate.bio,visibility=candidate.visibility,
        show_managed_projects=candidate.show_managed_projects,avatar_asset_id=candidate.avatar_asset_id,banner_asset_id=candidate.banner_asset_id,
        links_json=candidate.links_json,first_published_at=COALESCE(profiles.first_published_at,candidate.first_published_at),revision=profiles.revision+1,
        updated_at=candidate.updated_at,last_mutation_id=candidate.last_mutation_id FROM candidate
      WHERE profiles.user_id=candidate.user_id AND profiles.revision=? AND (profiles.first_published_at IS NULL OR profiles.handle=candidate.handle)
      AND ${assetGuard('candidate')} AND ${activeControlMemberSql('candidate.user_id')} AND (candidate.visibility<>'public' OR ${contentVisibleSql('profile','candidate.user_id')}) AND ((profiles.visibility='public' AND candidate.visibility='private') OR
        (SELECT COUNT(*) FROM profile_events e WHERE e.user_id=profiles.user_id AND e.created_at>=?)<${PROFILE_EDIT_LIMIT})`)
      .bind(...args,input.expectedRevision,now-86_400_000));
  }
  statements.push(db.prepare(`INSERT INTO profile_events(id,user_id,revision,visibility,created_at)
    SELECT ?,user_id,revision,visibility,updated_at FROM profiles WHERE user_id=? AND revision=? AND last_mutation_id=?`)
    .bind(mutationId,user.userId,nextRevision,mutationId));
  let results:D1Result[];
  try{results=await db.batch(statements);}catch(error){return translateUnique(error);}
  if(results[0]?.meta.changes!==1||results[1]?.meta.changes!==1){
    const count=await db.prepare('SELECT COUNT(*) AS count FROM profile_events WHERE user_id=? AND created_at>=?').bind(user.userId,now-86_400_000).first<{count:number}>();
    if((count?.count??0)>=PROFILE_EDIT_LIMIT)throw new InputError(`You can save your profile up to ${PROFILE_EDIT_LIMIT} times in 24 hours. You can still make a public profile private.`,429);
    throw new ProfileConflict('Your profile or its selected artwork changed. Refresh before saving again.','revision_conflict');
  }
  const profile=await ownProfile(db,user.userId);
  if(!profile)throw new Error('Saved profile was not readable');
  return profile;
}
