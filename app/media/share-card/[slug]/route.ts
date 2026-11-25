import {Buffer} from 'node:buffer';
import {InputError} from '@/lib/submission-validation';
import {shareCardPlan} from '@/lib/project-sharing';
import {database,runtime} from '@/lib/server/runtime';
import {handle} from '@/lib/server/http';
import {projectShowcase} from '@/lib/server/project-showcase';
import {publicControlArtworkRow} from '@/lib/server/control-artwork';
import {artworkResponse,publicArtworkRow} from '@/lib/server/project-artwork';

export const dynamic='force-dynamic';
type Context={params:Promise<{slug:string}>};
function missing() { return new InputError('This project card is unavailable.',404); }

async function approvedImage(db:D1Database,projectId:string,path:string,local:Record<string,string>) {
  if(Object.hasOwn(local,path)) return local[path];
  const match=/^\/media\/(project-artwork|control-project-artwork)\/([a-f0-9-]+)$/.exec(path);
  if(!match) throw missing();
  const row=match[1]==='control-project-artwork'?await publicControlArtworkRow(db,match[2]):await publicArtworkRow(db,match[2]);
  if(row.project_id!==projectId) throw missing();
  const bucket=runtime().BUCKET;
  if(!bucket) throw new InputError('Project artwork is temporarily unavailable.',503);
  const bytes=await (await artworkResponse(bucket,row)).arrayBuffer();
  return 'data:'+row.mime+';base64,'+Buffer.from(bytes).toString('base64');
}

async function image(request:Request,context:Context,head:boolean) {
  return handle(async()=>{
    const {slug}=await context.params;
    const db=database();
    const revision=new URL(request.url).searchParams.get('v');
    async function resolve() {
      const listing=await projectShowcase(db,slug);
      if(!listing) throw missing();
      const plan=shareCardPlan(listing.project);
      if(!plan.version || plan.version!==revision || !plan.art) throw missing();
      return {project:listing.project,plan};
    }
    const {project,plan}=await resolve();
    const headers={'Content-Type':plan.kind==='designed'?'image/jpeg':'image/png','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
    if(head) return new Response(null,{headers});
    const {art,designs}=await import('virtual:rmt-share-art');
    let bytes:ArrayBuffer|Uint8Array<ArrayBuffer>;
    if(plan.kind==='designed') {
      if(!Object.hasOwn(designs,slug)) throw missing();
      bytes=Uint8Array.from(Buffer.from(designs[slug],'base64'));
    } else {
      const hero=await approvedImage(db,project.id,plan.art!,art);
      const supporting=plan.supporting && plan.supporting!==plan.art ? await approvedImage(db,project.id,plan.supporting,art) : undefined;
      const {renderShareCard}=await import('@/lib/server/render-share-card');
      bytes=await renderShareCard(project,plan,hero,supporting);
    }
    await resolve();
    return new Response(bytes,{headers});
  });
}
export function GET(request:Request,context:Context) { return image(request,context,false); }
export function HEAD(request:Request,context:Context) { return image(request,context,true); }
