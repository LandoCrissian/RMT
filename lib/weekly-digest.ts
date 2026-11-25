export const weekMs = 7 * 24 * 60 * 60 * 1000;
export type DigestEntry = {id:string; title:string; project:string; path:string; at:number};
export type WeeklyDigest = {from:number; through:number; updates:DigestEntry[]; events:DigestEntry[]; additions:DigestEntry[]};

export function digestSections(digest:WeeklyDigest) {
  return [
    {label:'From projects you follow', entries:digest.updates},
    {label:'Coming up in the next seven days', entries:digest.events},
    {label:'New to the directory', entries:digest.additions},
  ];
}

export function digestDate(at:number) {
  return new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'}).format(at);
}

export function digestEntryUrl(path:string) {
  if (!/^\/(projects|events)\/[a-zA-Z0-9_%-]+(?:#updates)?$/.test(path)) throw new Error('Invalid digest link');
  return 'https://rmtlaunch.fun'+path;
}

export function digestText(digest:WeeklyDigest) {
  const lines=['RMT Weekly',digestDate(digest.from)+' – '+digestDate(digest.through)+' UTC'];
  for(const section of digestSections(digest)) {
    if(!section.entries.length)continue;
    lines.push('',section.label);
    for(const entry of section.entries)lines.push(entry.title+' · '+entry.project+' · '+digestDate(entry.at),digestEntryUrl(entry.path));
  }
  if(!digestSections(digest).some(section=>section.entries.length))lines.push('There are no updates, upcoming events or new listings for this edition.');
  return lines.join('\n');
}
