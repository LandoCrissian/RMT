import {InputError, publicHttpsUrl} from './submission-validation';

import {homepageArtwork} from './homepage-art';

export type PublicSiteSettings = {
  notice: {enabled:boolean;text:string;linkLabel:string;linkUrl:string};
  maintenance: {enabled:boolean;message:string};
  submissionsOpen:boolean;claimsOpen:boolean;updatesOpen:boolean;
};
export type SiteSettings = PublicSiteSettings & {revision:number;updatedAt:number|null;homepageArtwork:string};
export const DEFAULT_SITE_SETTINGS:PublicSiteSettings = {
  notice:{enabled:false,text:'',linkLabel:'',linkUrl:''},
  maintenance:{enabled:false,message:'RMT is getting a little attention. Please check back shortly.'},
  submissionsOpen:true,claimsOpen:true,updatesOpen:true,
};
function object(value:unknown,keys:string[]):Record<string,unknown>{
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!keys.includes(key)))throw new InputError('These site settings contain unsupported fields.');
  return value as Record<string,unknown>;
}
function text(value:unknown,max:number,label:string){
  if(typeof value!=='string'||value.trim().length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value))throw new InputError(`${label} is not valid.`);
  return value.trim();
}
function boolean(value:unknown){if(typeof value!=='boolean')throw new InputError('Choose an on or off value for every setting.');return value;}
export function validateSiteSettings(value:unknown):PublicSiteSettings & {homepageArtwork:string}{
  const data=object(value,['homepageArtwork','notice','maintenance','submissionsOpen','claimsOpen','updatesOpen']);
  const n=object(data.notice,['enabled','text','linkLabel','linkUrl']),m=object(data.maintenance,['enabled','message']);
  const notice={enabled:boolean(n.enabled),text:text(n.text,240,'Announcement'),linkLabel:text(n.linkLabel,40,'Link label'),linkUrl:text(n.linkUrl,2048,'Announcement link')};
  if(notice.enabled&&notice.text.length<5)throw new InputError('Add at least five characters for the announcement.');
  if(Boolean(notice.linkLabel)!==Boolean(notice.linkUrl))throw new InputError('Add both a link label and destination, or leave both empty.');
  if(notice.linkUrl){notice.linkUrl=publicHttpsUrl(notice.linkUrl,'Announcement link');if(notice.linkUrl.length>2048)throw new InputError('The announcement link is too long.');}
  const maintenance={enabled:boolean(m.enabled),message:text(m.message,240,'Maintenance message')};
  if(maintenance.message.length<5)throw new InputError('Add a maintenance message with at least five characters.');
  return {homepageArtwork:homepageArtwork(data.homepageArtwork),notice,maintenance,submissionsOpen:boolean(data.submissionsOpen),claimsOpen:boolean(data.claimsOpen),updatesOpen:boolean(data.updatesOpen)};
}
export function publicSiteSettings(value:SiteSettings):PublicSiteSettings{
  return {notice:{...value.notice},maintenance:{...value.maintenance},submissionsOpen:value.submissionsOpen,claimsOpen:value.claimsOpen,updatesOpen:value.updatesOpen};
}
