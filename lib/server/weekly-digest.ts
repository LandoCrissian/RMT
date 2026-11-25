import {weekMs,type WeeklyDigest} from '../weekly-digest';
import {catalog} from './repository';
import {followedProjects} from './following';
import {publicActivity} from './activity';
import {discoveryEvents} from './calendar';
import {projectPath} from '../project-sharing';

export async function weeklyDigest(db:D1Database,account:string,now=Date.now()):Promise<WeeklyDigest> {
  const [{projects},{projectIds}] = await Promise.all([catalog(db),followedProjects(db,account)]);
  const ids=new Set(projectIds), followed=projects.filter(project=>ids.has(project.id));
  const from=now-weekMs;
  const publishedWindow={from,through:now};
  const [activity,listings,upcoming]=await Promise.all([
    publicActivity(db,{kind:'all',limit:6,cursor:null},{projects:followed,inboxUser:account,publishedWindow}),
    publicActivity(db,{kind:'listing',limit:3,cursor:null},{projects,publishedWindow}),
    discoveryEvents(db,followed,null,now),
  ]);
  return {from,through:now,
    updates:activity.items.map(item=>({id:item.id,title:item.title,project:item.project.name,path:projectPath(item.project)+'#updates',at:item.publishedAt})),
    additions:listings.items.map(item=>({id:item.id,title:item.project.name,project:'Project directory',path:projectPath(item.project),at:item.publishedAt})),
    events:upcoming.filter(event=>event.startsAt<=now+weekMs).map(event=>({id:event.id,title:event.title,project:event.projectName,path:'/events/'+encodeURIComponent(event.id),at:event.startsAt})),
  };
}
