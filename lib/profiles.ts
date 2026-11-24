import type {Category, Project} from './catalog';
import {ARTWORK_ID_PATTERN} from './project-artwork-validation';
import {InputError, expectedRevision, field, publicHttpsUrl} from './submission-validation';

export type ProfileVisibility = 'private' | 'public';
export type ProfileArtworkKind = 'avatar' | 'banner';
export type ProfileLink = {label: string; url: string};
export type ProfileArtwork = {id: string; kind: ProfileArtworkKind; url: string; width: number; height: number; mime: 'image/png'};
export type UploadedProfileArtwork = ProfileArtwork & {previewUrl: string; byteSize: number; createdAt: number};
export type ProfileProject = {
  id: string; slug: string; name: string; tagline: string; category: Category; cover: string; logo?: string;
  initials: string; accent: string; coverFit?: Project['coverFit']; coverAspectRatio?: number;
};
export type ProfileInput = {
  expectedRevision: number; handle: string; displayName: string; bio: string; visibility: ProfileVisibility;
  showManagedProjects: boolean; avatarAssetId: string | null; bannerAssetId: string | null; links: ProfileLink[];
};
export type PrivateProfile = Omit<ProfileInput,'expectedRevision'> & {
  revision: number; handleLocked: boolean; firstPublishedAt: number | null; createdAt: number; updatedAt: number;
  avatar: ProfileArtwork | null; banner: ProfileArtwork | null; managedProjects: ProfileProject[]; isBuilder: boolean;
};
export type PublicProfile = {
  handle: string; displayName: string; bio: string; links: ProfileLink[]; avatar: ProfileArtwork | null;
  banner: ProfileArtwork | null; managedProjects: ProfileProject[]; isBuilder: boolean;
};
export type PublicProjectBuilder = {handle:string;displayName:string;avatar:ProfileArtwork|null;href:string};
export const profileHref = (handle:string) => '/u/' + encodeURIComponent(handle);
export const PROFILE_EDIT_LIMIT = 30;
export const PROFILE_UPLOAD_LIMIT = 8;
export const PROFILE_HANDLE_PATTERN = /^[a-z0-9][a-z0-9_-]{1,22}[a-z0-9]$/;
const reserved = new Set(['admin','administrator','api','assets','auth','billing','claim','claims','community','contact',
  'dashboard','discover','edit','explore','firebase','help','home','legal','library','login','logout','me','media','mcp',
  'moderator','notifications','official','owner','privacy','profile','profiles','projects','review','rmt','rmtlaunch','root',
  'security','settings','signin','signup','staff','studio','support','system','terms','updates','www']);
/** The stored canonical handle is lower-case ASCII; display names remain personal text. */
export function normalizeProfileHandle(value: unknown, optional = false): string {
  if(typeof value!=='string')throw new InputError('Choose a profile handle.');
  const handle=value.normalize('NFKC').trim().toLowerCase();
  if(optional&&!handle)return '';
  if(!PROFILE_HANDLE_PATTERN.test(handle))throw new InputError('Use a handle of 3–24 letters, numbers, hyphens or underscores, starting and ending with a letter or number.');
  if(reserved.has(handle)||/^(?:admin|administrator|moderator|support|rmt|rmtlaunch)[_-]/.test(handle))throw new InputError('That handle is reserved. Choose a different one.');
  return handle;
}
export function validateProfileInput(value:unknown):ProfileInput {
  if(!value||typeof value!=='object'||Array.isArray(value))throw new InputError('Send valid profile details.');
  const input=value as Record<string,unknown>;
  const fields=['expectedRevision','handle','displayName','bio','visibility','showManagedProjects','avatarAssetId','bannerAssetId','links'];
  if(Object.keys(input).some(key=>!fields.includes(key)))throw new InputError('Unsupported profile field.');
  if(input.visibility!=='private'&&input.visibility!=='public')throw new InputError('Choose whether your profile is private or public.');
  if(typeof input.showManagedProjects!=='boolean')throw new InputError('Choose whether to show your managed projects.');
  const handle=normalizeProfileHandle(input.handle,input.visibility==='private');
  const displayName=field(input,'displayName',input.visibility==='public'?2:0,48,'Display name');
  if(/[\r\n\t]/.test(displayName))throw new InputError('Keep your display name on one line.');
  const bio=field(input,'bio',0,280,'Bio');
  const assets={} as Pick<ProfileInput,'avatarAssetId'|'bannerAssetId'>;
  for(const key of ['avatarAssetId','bannerAssetId'] as const){
    const id=input[key];
    if(id!==null&&(typeof id!=='string'||!ARTWORK_ID_PATTERN.test(id)))throw new InputError('Choose valid profile artwork.');
    assets[key]=id as string|null;
  }
  if(!Array.isArray(input.links)||input.links.length>4)throw new InputError('Add up to four profile links.');
  const links:ProfileLink[]=input.links.map(value=>{
    if(!value||typeof value!=='object'||Array.isArray(value))throw new InputError('Add a valid profile link.');
    const link=value as Record<string,unknown>;
    if(Object.keys(link).some(key=>!['label','url'].includes(key)))throw new InputError('Unsupported profile link field.');
    const label=field(link,'label',2,32,'Link label');
    if(/[\r\n\t]/.test(label))throw new InputError('Keep link labels on one line.');
    const url=publicHttpsUrl(link.url,'Profile link');
    if(url.length>2048)throw new InputError('Use a profile link no longer than 2,048 encoded characters.');
    return{label,url};
  });
  if(new Set(links.map(link=>link.url)).size!==links.length)throw new InputError('Each profile link should have a different address.');
  return{expectedRevision:expectedRevision(input.expectedRevision,true),handle,displayName,bio,visibility:input.visibility,
    showManagedProjects:input.showManagedProjects,...assets,links};
}
export function validateProfileArtworkKind(value:unknown):ProfileArtworkKind {
  if(value!=='avatar'&&value!=='banner')throw new InputError('Choose an avatar or banner image.');
  return value;
}
