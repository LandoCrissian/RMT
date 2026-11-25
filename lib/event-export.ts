import {RMT_PUBLIC_ORIGIN} from './project-sharing';

type ExportEvent = {
  id:string; projectName:string; title:string; description:string; startsAt:number;
  endsAt?:number|null; updatedAt:number; status:string;
};

function escapeText(value:string) {
  return value.replace(/\\/g,'\\\\').replace(/\r\n|[\r\n]/g,'\\n')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,'')
    .replace(/;/g,'\\;').replace(/,/g,'\\,');
}

function fold(line:string) {
  const encoder=new TextEncoder();
  const folded:string[]=[];
  let part='',size=0;
  for(const ch of line){
    const bytes=encoder.encode(ch).length;
    if(size+bytes>75){folded.push(part);part=' ';size=1;}
    part+=ch;size+=bytes;
  }
  return [...folded,part].join('\r\n');
}

function utc(ms:number) {
  return new Date(ms).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');
}

export function calendarExport(event:ExportEvent) {
  const canonical=RMT_PUBLIC_ORIGIN+'/events/'+encodeURIComponent(event.id);
  return ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//RMT//Project Calendar//EN','CALSCALE:GREGORIAN',
    'BEGIN:VEVENT','UID:'+encodeURIComponent(event.id)+'@rmtlaunch.fun','DTSTAMP:'+utc(event.updatedAt),
    'LAST-MODIFIED:'+utc(event.updatedAt),'DTSTART:'+utc(event.startsAt),
    ...(event.endsAt!=null?['DTEND:'+utc(event.endsAt)]:[]),
    'SUMMARY:'+escapeText(event.title),'DESCRIPTION:'+escapeText(event.projectName+'\n'+event.description),
    'URL:'+canonical,'STATUS:'+(event.status==='cancelled'?'CANCELLED':'CONFIRMED'),
    'END:VEVENT','END:VCALENDAR'].map(fold).join('\r\n')+'\r\n';
}

export function eventCardTime(startsAt:number) {
  return new Intl.DateTimeFormat('en-US',{timeZone:'UTC',weekday:'short',month:'short',day:'numeric',
    year:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'}).format(startsAt);
}

