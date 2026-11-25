export const referrals=['Direct or unknown','X','Search','Other social','Other referral','RMT'] as const;
export type EventKind='visit'|'project_view'|'outbound'|'share'|'announcement'|'impression'|'discovery_click';
export type Signal={kind:EventKind;projectId:string;dimension:string};
export function referralBucket(referrer:string,origin:string):typeof referrals[number]{
  if(!referrer)return 'Direct or unknown';
  try{
    const url=new URL(referrer);
    if(!['https:','http:'].includes(url.protocol))return 'Direct or unknown';
    if(url.origin===origin)return 'RMT';
    const host=url.hostname.toLowerCase();
    const belongs=(domain:string)=>host===domain||host.endsWith('.'+domain);
    if(['twitter.com','x.com','t.co'].some(belongs))return 'X';
    if(['google.com','google.co.uk','google.ca','bing.com','duckduckgo.com','search.yahoo.com','ecosia.org','brave.com'].some(belongs))return 'Search';
    if(['facebook.com','instagram.com','threads.net','reddit.com','linkedin.com','discord.com','bsky.app','t.me','youtube.com','tiktok.com'].some(belongs))return 'Other social';
    return 'Other referral';
  }catch{return 'Direct or unknown';}
}
