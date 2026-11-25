import {runtime} from '@/lib/server/runtime';
export const dynamic='force-dynamic';
type Context={params:Promise<{file:string}>};
async function image(context:Context,head:boolean) {
  const {file}=await context.params;
  if(!/^[a-f0-9]{64}\.png$/.test(file)) return new Response(null,{status:404});
  const bucket=runtime().BUCKET;
  if(!bucket) return new Response(null,{status:503});
  const key='homepage-art/'+file;
  const object=head?await bucket.head(key):await bucket.get(key);
  if(!object) return new Response(null,{status:404});
  return new Response('body' in object?(object as R2ObjectBody).body:null,{headers:{
    'Content-Type':'image/png','Content-Length':String(object.size),'X-Content-Type-Options':'nosniff',
    'Cache-Control':'public, max-age=31536000, immutable',ETag:object.httpEtag}});
}
export function GET(_:Request,context:Context){return image(context,false);}
export function HEAD(_:Request,context:Context){return image(context,true);}
