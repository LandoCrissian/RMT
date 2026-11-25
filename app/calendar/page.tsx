import {Calendar} from '@/components/EcosystemCalendar';
import {agenda} from '@/lib/server/calendar';
import {database} from '@/lib/server/runtime';
export const dynamic='force-dynamic';
export const metadata={title:'Ecosystem calendar | RMT',alternates:{canonical:'https://rmtlaunch.fun/calendar'}};
export default async function CalendarPage(){return <Calendar initialNow={Date.now()} {...await agenda(database())}/>;}
