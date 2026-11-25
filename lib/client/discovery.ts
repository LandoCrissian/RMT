import {publicActivityPage} from './activity';
import type {ActivityPage} from '../activity';

export type DiscoveryView = 'for-you' | 'following' | 'all' | 'notifications';
export type Lesson = {title: string; body: string};
export type DiscoveryPage = ActivityPage & {
  calendarEvents?: {id:string; title:string; projectName:string; startsAt:number}[];
  member: boolean; interests: string[]; categories: string[]; categoryLabels:Record<string,string>; lessons: Lesson[];
  recommendedProjects: {id: string; name: string}[]; notificationsEnabled: boolean;
  readIds: string[]; unreadCount: number;
};
type Action = {action:'interests'; interests:string[]} | {action:'notifications'; enabled:boolean}
  | {action:'read'; id:string} | {action:'onboarding'; outcome:'completed'|'skipped'};

function isRecord(value:unknown):value is Record<string,unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
function validStrings(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string');
}

export async function readDiscovery(query: URLSearchParams, account: string | null, signal: AbortSignal): Promise<DiscoveryPage> {
  const response = await fetch('/api/discovery?' + query, {
    signal, cache:'no-store', credentials:account ? 'same-origin' : 'omit',
    headers:account ? {'X-RMT-Account':account} : {},
  });
  if (!response.ok) throw Error('Could not load discovery. Refresh to try again.');
  const body = await response.json();
  const feed = publicActivityPage(body);
  if (!isRecord(body) || body.member !== Boolean(account) || !validStrings(body.interests) || !validStrings(body.categories)
      || !validStrings(body.readIds) || !Array.isArray(body.lessons) || !body.lessons.every((item:Lesson) => item && typeof item.title === 'string' && typeof item.body === 'string')
      || !Array.isArray(body.recommendedProjects) || !body.recommendedProjects.every((item:{id:string;name:string}) => item && typeof item.id === 'string' && typeof item.name === 'string')
      || typeof body.notificationsEnabled !== 'boolean' || typeof body.unreadCount !== 'number' || !Number.isSafeInteger(body.unreadCount) || body.unreadCount < 0
      || (!account && (body.interests.length > 0 || body.readIds.length > 0 || body.unreadCount > 0))) throw Error('The discovery response could not be verified.');
  const labels=body.categoryLabels;
  const categoryLabels=Object.fromEntries(body.categories.map(id=>{
    const label=labels===undefined?id:isRecord(labels)?labels[id]:null;
    if(typeof label!=='string'||!label.trim())throw Error('The discovery categories could not be verified.');
    return [id,label];
  }));
  const events=body.calendarEvents;
  if(events!==undefined && (!Array.isArray(events)||events.length>3||events.some(e=>!isRecord(e)||typeof e.id!=='string'||!e.id||typeof e.title!=='string'||typeof e.projectName!=='string'||!Number.isSafeInteger(e.startsAt))))
    throw Error('The calendar response could not be verified.');
  return {...feed,...(events?{calendarEvents:events as DiscoveryPage['calendarEvents']}:{}), categoryLabels, member:body.member, interests:body.interests, categories:body.categories, lessons:body.lessons,
    recommendedProjects:body.recommendedProjects, notificationsEnabled:body.notificationsEnabled, readIds:body.readIds, unreadCount:body.unreadCount};
}

export async function saveDiscovery(account:string, action:Action) {
  const response = await fetch('/api/discovery', {method:'POST', credentials:'same-origin', cache:'no-store',
    headers:{'Content-Type':'application/json','X-RMT-Account':account}, body:JSON.stringify(action)});
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw Error(isRecord(body) && typeof body.error === 'string' ? body.error : 'Your change could not be confirmed. Please try again.');
  }
}
