import type { Project } from './catalog';
import {presentationLinks} from './project-presentation';
import reviewedSources from './enrichment-sources.json';
import reviewedMetadata from './reviewed-source-metadata.json';
import destinationArtwork from './experience-artwork.json';

export type SourceKind = 'owner' | 'website' | 'x' | 'opensea' | 'explorer' | 'admin' | 'listing' | 'derived';
type Source = {kind: SourceKind; url?: string};
type EvidenceKind = 'website' | 'x' | 'opensea' | 'explorer';
type Field = 'shortDescription' | 'categoryLabel' | 'experienceIntro' | 'communityIntro' | 'accent';
export type ProjectEvidence = {kind: EvidenceKind; url: string; destinations?: Record<string,{label?:string;copy?:string} | undefined>} & Partial<Record<Field,string>>;
const editorial: Record<string,ProjectEvidence[]> = reviewedSources as Record<string,ProjectEvidence[]>;
const metadata = reviewedMetadata as Record<string,ProjectEvidence[]>;
const priority: EvidenceKind[] = ['website','x','opensea','explorer'];
const experienceType = /game|creative|software|tool|wallet|app|music|audio|experience|missions|comics|gallery/i;
export const isExperience = (link:Project['links'][number]) => experienceType.test(link.type ?? '');

function urlOf(value?:string) {
  try {return value ? new URL(value) : null;} catch {return null;}
}
function approvedSource(project: Project, item: ProjectEvidence) {
  const url = urlOf(item.url);
  if (url?.protocol !== 'https:') return false;
  switch (item.kind) {
    case 'website': {
      const root = urlOf(project.website);
      if (!root || !(url.hostname === root.hostname || url.hostname.endsWith('.'+root.hostname))) return false;
      return [project.website, project.launchUrl, ...project.links.map(link=>link.url)].includes(item.url);
    }
    case 'x': return /^(?:www\.)?(?:x|twitter)\.com$/.test(url.hostname) &&
      /^\/[a-z\d_]{1,15}\/?$/i.test(url.pathname) && item.url === project.officialXProfile;
    case 'opensea': return url.hostname === 'opensea.io' && Boolean(project.collections?.some(collection=>collection.url===item.url));
    case 'explorer': return url.hostname === 'robinhoodchain.blockscout.com' && project.links.some(link=>link.url===item.url && /explorer/i.test(link.type || ''));
  }
}
function informativeLabel(label: string) {
  return Boolean(label.trim()) && !/^(?:x|website|launch|link|visit|open project|official website)$/i.test(label.trim());
}

/** Operates only on the public, approved projection; never fetches on a visitor's request. */
function forProject(sources:Record<string,ProjectEvidence[]>,id:string) {
  return Object.hasOwn(sources,id) ? sources[id] : [];
}
export function enrichProject(project: Project, evidence = [...forProject(editorial,project.id), ...forProject(metadata,project.id)]) {
  const hints = evidence.filter(item=>approvedSource(project,item)).sort((a,b)=>priority.indexOf(a.kind)-priority.indexOf(b.kind));
  const sources: Record<string,Source> = {};
  const record = (key:string, value:string, source:Source) => {sources[key]=source; return value;};
  const listingSource: Source = {kind:project.contentOrigin==='owner' && project.claimed ? 'owner' : project.contentOrigin==='admin' ? 'admin' : 'listing'};
  const owner = listingSource.kind==='owner';
  const presentation = project.presentation;
  function field(key:Field, fallback:string, ownerValue?:string, override?:string) {
    if (override) return record(key,override,{kind:'admin'});
    if (owner && ownerValue) return record(key,ownerValue,listingSource);
    const hint = hints.find(item=>item[key] && (!item.destinations ||
      Object.keys(item.destinations).every(url=>project.links.some(link=>link.url===url))));
    if (hint) return record(key,hint[key]!,{kind:hint.kind,url:hint.url});
    return record(key,fallback,key.endsWith('Intro') ? {kind:'derived'} : listingSource);
  }
  const shortDescription = field('shortDescription',project.description || project.tagline,project.description,presentation?.shortDescription);
  const chain = project.collections?.[0]?.chain;
  const categoryLabel = field('categoryLabel',chain ? project.category+' · '+chain : project.category,project.category);
  const categoryAccent = {Games:'#a6da70',Music:'#e59fdd',Tools:'#85cee0',Community:'#c6ff42'};
  const neutral = !project.accent || (project.source==='community' && project.accent.toLowerCase()==='#c6ff42');
  const accent = field('accent',neutral ? categoryAccent[project.category] : project.accent,undefined,presentation?.accent);
  if (neutral && !presentation?.accent && !hints.some(item=>item.accent)) sources.accent={kind:'derived'};
  const destinations = presentationLinks(project).map(link=>{
    const source = hints.find(item=>item.destinations?.[link.url]?.label);
    const facts = hints.find(item=>item.destinations?.[link.url]?.copy);
    const host = urlOf(link.url)?.hostname.replace(/^www\./,'') || '';
    const role = link.url===project.officialXProfile ? 'x' : link.url===project.website ? 'website' : link.url===project.launchUrl ? 'launch' : '';
    const defaultLabel = role==='x' ? project.name+' on X' : role==='website' ? project.name+' website' : role==='launch' && informativeLabel(project.launchLabel) ? project.launchLabel : host;
    const supplied = presentation?.labels?.[link.url];
    const labelKey = 'label:'+link.url;
    let label: string;
    if (supplied) label = record(labelKey,supplied,{kind:'admin'});
    else if (owner && informativeLabel(link.label)) label = record(labelKey,link.label,listingSource);
    else if (source) label = record(labelKey,source.destinations![link.url]!.label!,{kind:source.kind,url:source.url});
    else if (informativeLabel(link.label)) label = record(labelKey,link.label,listingSource);
    else label = record(labelKey,defaultLabel || link.label,{kind:'derived',url:link.url});
    const copy = facts ? record('copy:'+link.url,facts.destinations![link.url]!.copy!,{kind:facts.kind,url:facts.url}) : '';
    const art = destinationArtwork.find(item=>item.project===project.id && item.destination===link.url);
    const selected = presentation?.supporting?.[link.url];
    if (selected) sources['image:'+link.url] = {kind:'admin'};
    else if (art) sources['image:'+link.url] = {kind:'listing',url:art.source};
    return {...link,label,copy,image:selected || art?.image,alt:selected ? label : art?.alt};
  });
  const experiences = destinations.filter(isExperience);
  const experienceIntro = field('experienceIntro',experiences.length>1 ? 'Explore '+experiences.slice(0,2).map(item=>item.label).join(' and ')+(experiences.length>2 ? ' among this project’s destinations.' : '.') : '');
  const social = urlOf(project.officialXProfile);
  const handle = social && approvedSource(project,{kind:'x',url:social.href}) ? social.pathname.split('/')[1] : '';
  const collection = project.collections?.find(item=>approvedSource(project,{kind:'opensea',url:item.url}));
  const communityIntro = field('communityIntro',handle && collection ? 'Follow @'+handle+' for project posts or browse '+collection.name+' on OpenSea.' : '');
  return {shortDescription,categoryLabel,accent,experienceIntro,communityIntro,destinations,sources,hasVerifiedEvidence:hints.length>0};
}
