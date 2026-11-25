import {Buffer} from 'node:buffer';
import {InputError} from '@/lib/submission-validation';
import {runtime} from './runtime';
import {publicControlArtworkRow} from './control-artwork';
import {artworkResponse,publicArtworkRow} from './project-artwork';

export async function approvedImage(db:D1Database,projectId:string,path:string,local:Record<string,string>) {
  if(Object.hasOwn(local,path)) return local[path];
  const match=/^\/media\/(project-artwork|control-project-artwork)\/([a-f0-9-]+)$/.exec(path);
  if(!match) throw new InputError('This project artwork is unavailable.',404);
  const row=match[1]==='control-project-artwork'?await publicControlArtworkRow(db,match[2]):await publicArtworkRow(db,match[2]);
  if(row.project_id!==projectId) throw new InputError('This project artwork is unavailable.',404);
  const bucket=runtime().BUCKET;
  if(!bucket) throw new InputError('Project artwork is temporarily unavailable.',503);
  const bytes=await (await artworkResponse(bucket,row)).arrayBuffer();
  return 'data:'+row.mime+';base64,'+Buffer.from(bytes).toString('base64');
}
