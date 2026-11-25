import {InputError} from '@/lib/submission-validation';
import {communityCardMark} from '@/lib/reviewed-community-artwork';
import {approvedImage} from '@/lib/server/share-card-artwork';
import {publicEvent} from '@/lib/server/calendar';
import {database} from '@/lib/server/runtime';
import {handle} from '@/lib/server/http';

export const dynamic='force-dynamic';

function card(request:Request,context:{params:Promise<{id:string}>},head:boolean) {
  return handle(async()=>{
    const {id}=await context.params;
    const db=database();
    const event=await publicEvent(db,id);
    const revision=new URL(request.url).searchParams.get('v');
    if(!event || (revision!==null && revision!==String(event.updatedAt)))throw new InputError('Event not found.',404);
    const headers={'Content-Type':'image/png','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
    if(head)return new Response(null,{headers});
    const {art}=await import('virtual:rmt-share-art');
    const path=event.artwork||communityCardMark;
    const image=Object.hasOwn(art,path)||path.startsWith('/media/')?
      await approvedImage(db,event.projectId,path,art):art[communityCardMark];
    const {renderEventCard}=await import('@/lib/server/render-event-card');
    const bytes=await renderEventCard(event,image);
    const current=await publicEvent(db,id);
    if(!current||current.updatedAt!==event.updatedAt||current.artwork!==event.artwork||current.projectName!==event.projectName)
      throw new InputError('Event changed. Refresh the event page.',404);
    return new Response(bytes,{headers});
  });
}
export function GET(request:Request,context:{params:Promise<{id:string}>}) {return card(request,context,false);}
export function HEAD(request:Request,context:{params:Promise<{id:string}>}) {return card(request,context,true);}

