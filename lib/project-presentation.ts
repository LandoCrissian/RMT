import type {Project} from './catalog';
import experienceArt from './experience-artwork.json';
import {ARTWORK_ID_PATTERN} from './project-artwork-validation';
import {InputError} from './submission-validation';

export type ProjectPresentation = {
  shortDescription?:string;
  hero?:string;
  labels?:Record<string,string>;
  supporting?:Record<string,string>;
  cardMode?:'auto'|'project'|'fallback';
  cardStyle?:'panorama'|'portrait'|'editorial';
  accent?:string;
};

export function presentationLinks(project:Project) {
  const links=[...project.links,
    {url:project.launchUrl,label:project.launchLabel},
    ...(project.collections??[]).map(item=>({url:item.url,label:item.name,type:'Collection'}))];
  return links.filter((link,index)=>link.url&&links.findIndex(item=>item.url===link.url)===index);
}

export function approvedPresentationImages(project:Project) {
  const links = new Set(presentationLinks(project).map(link=>link.url));
  const images = [
    {url:project.cover,label:'Listing cover'},
    {url:project.artwork?.logo?.url || project.logo,label:'Listing logo'},
    ...experienceArt.filter(entry=>entry.project===project.id && links.has(entry.destination)).map(entry=>({url:entry.image,label:entry.alt})),
  ];
  return images.filter((item):item is {url:string;label:string} => Boolean(item.url?.startsWith('/'))).filter((item,index,all)=>all.findIndex(other=>other.url===item.url)===index);
}

export function controlImageId(url:string) {
  const prefix='/media/control-project-artwork/';
  if(!url.startsWith(prefix)) return null;
  const id=url.slice(prefix.length);
  return ARTWORK_ID_PATTERN.test(id)?id:null;
}

export function validatePresentation(value:unknown):ProjectPresentation {
  if(!value || typeof value!=='object'||Array.isArray(value)) throw new InputError('Choose valid presentation settings.');
  const data=value as Record<string,unknown>;
  const keys=['shortDescription','hero','labels','supporting','cardMode','cardStyle','accent'];
  if(Object.keys(data).some(key=>!keys.includes(key))) throw new InputError('Unknown presentation field.');
  function text(input:unknown,max:number) {
    if(typeof input!=='string'||!input.trim()||input.length>max||/[\u0000-\u001f\u007f]/.test(input)) throw new InputError('Check the presentation text and image selections.');
    return input.trim();
  }
  function entries(input:unknown,max:number) {
    if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).length>40) throw new InputError('Choose valid destination overrides.');
    return Object.fromEntries(Object.entries(input).map(([url,item])=>[text(url,2048),text(item,max)]));
  }
  const result:ProjectPresentation={};
  if(data.shortDescription!==undefined)result.shortDescription=text(data.shortDescription,280);
  if(data.hero!==undefined)result.hero=text(data.hero,300);
  if(data.labels!==undefined)result.labels=entries(data.labels,80);
  if(data.supporting!==undefined)result.supporting=entries(data.supporting,300);
  if(data.accent!==undefined){
    const color=text(data.accent,7);
    if(!/^#[0-9a-f]{6}$/i.test(color)) throw new InputError('Choose a six-digit accent color.');
    result.accent=color;
  }
  if(data.cardStyle!==undefined){
    if(data.cardStyle!=='panorama'&&data.cardStyle!=='portrait'&&data.cardStyle!=='editorial')throw new InputError('Choose a share card style.');
    result.cardStyle=data.cardStyle;
  }
  if(data.cardMode!==undefined){
    if(data.cardMode!=='auto'&&data.cardMode!=='project'&&data.cardMode!=='fallback')throw new InputError('Choose a share card mode.');
    result.cardMode=data.cardMode;
  }
  return result;
}

// When a builder revises the listing, detach overrides for removed destinations
// and previously approved builder images that are no longer part of the listing.
export function currentPresentation(project:Project,settings:ProjectPresentation):ProjectPresentation {
  const urls=new Set(presentationLinks(project).map(link=>link.url));
  const art=new Set(approvedPresentationImages(project).map(item=>item.url));
  const valid=(image:string)=>art.has(image)||Boolean(controlImageId(image));
  const result={...settings};
  if(result.hero&&!valid(result.hero))delete result.hero;
  if(result.supporting)result.supporting=Object.fromEntries(Object.entries(result.supporting).filter(([url,image])=>urls.has(url)&&valid(image)));
  if(result.labels)result.labels=Object.fromEntries(Object.entries(result.labels).filter(([url])=>urls.has(url)));
  return result;
}
