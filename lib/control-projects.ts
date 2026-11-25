import type {Project,Category} from './catalog';
import type {ProjectStage,ProjectLink} from './submission-validation';

export type ControlProjectVisibility='public'|'hidden'|'archived';
export type ControlProjectContent={name:string;summary:string;category:Category;stage:ProjectStage;website:string;launchUrl:string;xProfile:string;links:ProjectLink[]};
export type ControlProject={project:Project;revision:number;listingRevision:number;visibility:ControlProjectVisibility;
  artworkOverride:boolean;logoAssetId:string|null;bannerAssetId:string|null;
  featured:boolean|null;origin:'curated'|'community'|'admin';sourceStatus:'curated'|'approved'|'suspended'|'admin';
  publiclyAvailable:boolean;content:ControlProjectContent;owner:{userId:string;status:'active'|'revoked';revision:number}|null;updatedAt:number|null};
export type ControlProjectsPage={projects:ControlProject[];total:number;page:number;pageSize:number;hasMore:boolean};
export type CreateControlProject={categoryIds?:string[];content:ControlProjectContent;visibility:ControlProjectVisibility;featured:boolean;reason:string;confirmedLinks:boolean};
export type ChangeControlProject={expectedRevision:number;expectedListingRevision:number;reason:string} & (
  {action:'edit';content:ControlProjectContent;confirmedLinks:boolean}|
  {action:'visibility';visibility:ControlProjectVisibility}|
  {action:'feature';featured:boolean|null}|
  {action:'spotlight';featured:boolean;spotlight:import('./spotlight').Spotlight}|
  {action:'presentation';presentation:import('./project-presentation').ProjectPresentation}|
  {action:'reset_content'}|
  {action:'artwork';logoAssetId:string|null;bannerAssetId:string|null}|
  {action:'reset_artwork'});
export type ControlProjectArtwork={id:string;kind:'logo'|'banner';width:number;height:number;mime:'image/png';byteSize:number;previewUrl:string;createdAt:number};
export type ControlContentKind='profile'|'update';
export type ControlContentItem={kind:ControlContentKind;id:string;title:string;body:string;userId:string;projectId:string|null;projectName:string|null;
  publicUrl:string|null;hidden:boolean;reason:string;revision:number;contentRevision:number;updatedAt:number;sourceStatus:string};
export type ControlContentPage={items:ControlContentItem[];total:number;page:number;pageSize:number;hasMore:boolean};
export type ChangeControlContent={kind:ControlContentKind;expectedRevision:number;expectedContentRevision:number;hidden:boolean;reason:string};
export type ChangeControlOwnership={action:'revoke'|'transfer';expectedRevision:number;reason:string;targetUserId?:string;confirmedOwnership?:boolean};
