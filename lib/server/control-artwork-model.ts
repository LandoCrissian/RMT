import type {PublicArtwork} from '@/lib/catalog';
import type {ControlProjectArtwork} from '@/lib/control-projects';
import type {ArtworkKind} from '@/lib/project-artwork-validation';

export type ControlArtworkRow={id:string;project_id:string;uploader_id:string;object_key:string;kind:ArtworkKind;mime:'image/png';width:number;height:number;byte_size:number;digest:string;status:'uploading'|'ready'|'failed';created_at:number};
export function privateControlArtwork(row:ControlArtworkRow):ControlProjectArtwork{return{id:row.id,kind:row.kind,width:row.width,height:row.height,mime:row.mime,byteSize:row.byte_size,previewUrl:'/api/control/artwork/'+encodeURIComponent(row.id),createdAt:row.created_at};}
export function publicControlArtwork(row:ControlArtworkRow):PublicArtwork{return{id:row.id,url:'/media/control-project-artwork/'+encodeURIComponent(row.id),width:row.width,height:row.height,mime:row.mime};}
