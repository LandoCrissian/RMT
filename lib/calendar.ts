export type EventFields={title:string;description:string;startsAt:number;endsAt:number|null;artwork:string;destination:string;access:string;typeId:string};
export type CalendarEvent=EventFields&{id:string;projectId:string;projectSlug:string;projectName:string;categories:string[];status:string;updatedAt:number;featured:boolean;revision:number;hasPublished:boolean};
export type CalendarType={id:string;name:string;archived:boolean;revision:number};
export function reminderDue(event:Pick<CalendarEvent,'status'|'startsAt'>,now:number){
  return event.status==='published'&&event.startsAt>=now&&event.startsAt-now<=86_400_000;
}
