import {calendarExport} from '@/lib/event-export';
import {publicEvent} from '@/lib/server/calendar';
import {database} from '@/lib/server/runtime';
import {handle} from '@/lib/server/http';
import {InputError} from '@/lib/submission-validation';

export const dynamic='force-dynamic';

export function GET(_request:Request,context:{params:Promise<{id:string}>}) {
  return handle(async()=>{
    const {id}=await context.params;
    const event=await publicEvent(database(),id);
    if(!event)throw new InputError('Event not found.',404);
    return new Response(calendarExport(event),{headers:{
      'Content-Type':'text/calendar; charset=utf-8',
      'Content-Disposition':'attachment; filename="rmt-event.ics"',
      'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',
    }});
  });
}
