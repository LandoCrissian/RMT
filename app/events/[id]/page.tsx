import {cache} from 'react';
import {notFound} from 'next/navigation';
import {EventDetail} from '@/components/EcosystemCalendar';
import {publicEvent} from '@/lib/server/calendar';
import {database} from '@/lib/server/runtime';
import {InputError} from '@/lib/submission-validation';
export const dynamic='force-dynamic';
const load=cache(async(id:string)=>{try{return await publicEvent(database(),id);}catch(error){if(error instanceof InputError&&error.status===404)notFound();throw error;}});
type Props={params:Promise<{id:string}>};
export async function generateMetadata({params}:Props){const e=await load((await params).id),url='https://rmtlaunch.fun/events/'+encodeURIComponent(e.id),image=url+'/card?v='+e.updatedAt;
return {title:e.title+' | '+e.projectName+' · RMT',description:e.description,alternates:{canonical:url},openGraph:{title:e.title,description:e.description,url,images:[{url:image,width:1200,height:630}]},twitter:{card:'summary_large_image' as const,title:e.title,description:e.description,images:[image]}};}
export default async function Page({params}:Props){return <EventDetail event={await load((await params).id)}/>;}
