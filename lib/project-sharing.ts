import {communitySlug} from './project-permalinks';
import {communityCardMark, reviewedCommunityArtwork} from './reviewed-community-artwork';
import experienceArt from './experience-artwork.json';
import {enrichProject} from './project-enrichment';
import {controlImageId} from './project-presentation';
import { optionalXProfile } from './submission-validation';
import type { Metadata } from 'next';
import { seedProjects, type Project, type PublicArtwork } from './catalog';

/** A stable public URL, independent of preview hosts or a visitor's current URL. */
export const RMT_PUBLIC_ORIGIN = 'https://rmtlaunch.fun';
export const SOCIAL_IMAGE_WIDTH = 1200;
export const SOCIAL_IMAGE_HEIGHT = 630;
export const SOCIAL_IMAGE_VERSION = 'v3';
type ShareArtworkProject = Pick<Project, 'id' | 'slug'> & Partial<Project>;
function approvedImage(image?: PublicArtwork) {
  return image && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(image.id)
    && ['/media/project-artwork/' + image.id,'/media/control-project-artwork/' + image.id].includes(image.url)
    && Number.isSafeInteger(image.width) && Number.isSafeInteger(image.height) && image.width > 0 && image.height > 0
    && ['image/png','image/jpeg','image/webp'].includes(image.mime) ? image : undefined;
}
// These already-published cards retain their original URLs and artwork.
const classicCards = new Set(['vamps','lammbs','suited-apes','ccff00','hood-vandalz','pixel-hood-arcade','cannacats-v2','robin-rabbits','1kiss','synchronized-mindz','cash-grab-rh','abstract-workers2','animal-pharm-71884901','pricedout','companions-by-wfit','tmo-initiates','rillaz-n-da-hood-apex-collection','claystonkz','stray-cucks','hoodfi']);
export const artDirectedProjects = ['moneymomos','wif-outlaws','bored-traders'] as const;
const defaultStyles:Record<string,'panorama'|'portrait'|'editorial'> = {'moneymomos':'editorial','wif-outlaws':'panorama','bored-traders':'portrait'};

export function shareCardPlan(project:ShareArtworkProject) {
  const settings=project.presentation;
  const seed=seedProjects.find(item=>item.id===project.id && item.slug===project.slug);
  const banner=approvedImage(project.artwork?.banner), logo=approvedImage(project.artwork?.logo);
  const reviewed=reviewedCommunityArtwork(project);
  const localAssets=new Set([seed?.cover,seed?.logo,reviewed?.cover,reviewed?.logo,...experienceArt.filter(a=>a.project===project.id).map(a=>a.image)].filter(Boolean));
  function usable(url:string|undefined) {
    return !!url && (localAssets.has(url) || url===banner?.url || url===logo?.url ||
      (!!controlImageId(url) && (url===settings?.hero || Object.values(settings?.supporting??{}).includes(url))));
  }
  const supporting=Object.values(settings?.supporting??{}).find(usable);
  const initialCommunityCard = project.source==='community' && project.id.startsWith('community-') && project.slug===communitySlug(project.id.slice(10));
  const art = [settings?.hero,banner?.url,project.cover??seed?.cover,logo?.url,project.logo,supporting].find(usable) ?? (initialCommunityCard ? communityCardMark : undefined);
  const title = project.name ?? seed?.name;
  const enrichedAccent=project.links && project.category && typeof project.description==='string' && typeof project.tagline==='string'
    ? enrichProject(project as Project).accent : undefined;
  const accent = settings?.accent ?? enrichedAccent ?? project.accent ?? seed?.accent ?? '#ccff00';
  const unchanged = !!seed && title===seed.name && art===seed.cover && !settings?.hero && !supporting && !settings?.accent && !settings?.cardStyle && accent===seed.accent;
  const fallback = '/social/rmt-'+SOCIAL_IMAGE_VERSION+'.jpg';
  if (settings?.cardMode==='fallback' || !art || !title) return {kind:'fallback' as const,path:fallback};
  if (reviewed && title===reviewed.name && art===reviewed.cover && !project.artwork && !settings?.hero && !supporting && !settings?.accent && !settings?.cardStyle)
    return {kind:'classic' as const,path:reviewed.card};
  if (unchanged && classicCards.has(project.id)) return {kind:'classic' as const,path:'/social/'+encodeURIComponent(project.slug)+'-'+SOCIAL_IMAGE_VERSION+'.jpg'};
  const style = settings?.cardStyle ?? (Object.hasOwn(defaultStyles,project.id) ? defaultStyles[project.id] : art===logo?.url || art===project.logo || art===communityCardMark ? 'portrait' : 'panorama');
  const baked = unchanged && artDirectedProjects.some(id=>id===project.id)
    && (!project.links || seed.links.every(link=>project.links!.some(item=>item.url===link.url)));
  // URL revisions are cache keys, never credentials. The route independently
  // resolves the current public listing and rejects stale revision requests.
  let hash = 2166136261;
  const input = JSON.stringify([4,title,art,supporting??'',style,accent,baked]);
  for(let i=0;i<input.length;i++) hash=Math.imul(hash^input.charCodeAt(i),16777619);
  const version='4-'+(hash>>>0).toString(36);
  return {kind:baked?'designed' as const:'composed' as const,art,supporting,title,style,accent,version,
    path:'/media/share-card/'+encodeURIComponent(project.slug)+'?v='+version};
}

export function projectPath(project: Pick<Project, 'slug'>): string {
  return '/projects/' + encodeURIComponent(project.slug);
}

export function projectShareUrl(project: Pick<Project, 'slug'>): string {
  return RMT_PUBLIC_ORIGIN + projectPath(project);
}

export function projectSocialImagePath(project: ShareArtworkProject): string {
  return shareCardPlan(project).path;
}

export function projectSocialImageUrl(project: ShareArtworkProject): string {
  return RMT_PUBLIC_ORIGIN + projectSocialImagePath(project);
}

export function projectXIntentUrl(project: Pick<Project, 'slug' | 'name' | 'officialXProfile'>): string {
  let mention = '';
  if (project.officialXProfile) {
    try {
      const url = optionalXProfile(project.officialXProfile);
      if (url) mention = ' (@' + new URL(url).pathname.slice(1) + ')';
    } catch {
      // Older catalog records can contain a social destination other than a profile.
    }
  }
  const query = new URLSearchParams({text: `Explore ${project.name}${mention} on @RMTLaunch.`, url: projectShareUrl(project)});
  return 'https://x.com/intent/post?' + query.toString();
}

export function projectMetadata(project: Project): Metadata {
  const title = `${project.name} | RMT`;
  const description = enrichProject(project).shortDescription.trim().slice(0, 200);
  const image = projectSocialImageUrl(project);
  const plan=shareCardPlan(project);
  const imageAlt=plan.kind==='fallback'?'RMT — discover projects, games, and creative tools':`${project.name} artwork with its name on an RMT project card`;
  return {
    title,
    description,
    alternates: {canonical: projectShareUrl(project)},
    openGraph: {
      type: 'website', siteName: 'RMT', title, description, url: projectShareUrl(project),
      images: [{url: image, width: SOCIAL_IMAGE_WIDTH, height: SOCIAL_IMAGE_HEIGHT, type: plan.kind==='composed' ? 'image/png' : 'image/jpeg', alt: imageAlt}],
    },
    twitter: {card: 'summary_large_image', title, description, images: [{url: image, alt: imageAlt}]},
  };
}
