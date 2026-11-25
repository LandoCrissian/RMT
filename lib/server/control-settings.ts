import {DEFAULT_SITE_SETTINGS,validateSiteSettings,publicSiteSettings,type SiteSettings} from '@/lib/control-settings';
import {InputError} from '@/lib/submission-validation';
import {controlActorGuard,controlObject,controlReason,controlRevision,type ControlActor} from './control-access';
import {auditInsert} from './control-audit';

import {flagship,artworkPrefix} from '@/lib/homepage-art';
import {runtime} from './runtime';

export async function siteSettings(db:D1Database):Promise<SiteSettings>{
  const row=await db.prepare("SELECT payload_json,revision,updated_at FROM control_settings WHERE id='site'").first<{payload_json:string;revision:number;updated_at:number}>();
  if(!row)return {...structuredClone(DEFAULT_SITE_SETTINGS),revision:0,updatedAt:null,homepageArtwork:flagship};
  return {...validateSiteSettings(JSON.parse(row.payload_json)),revision:row.revision,updatedAt:row.updated_at};
}
export async function changeSiteSettings(db:D1Database,actor:ControlActor,value:unknown):Promise<SiteSettings>{
  if(!actor.capabilities.includes('settings'))throw new InputError('Your RMT role does not allow site settings changes.',403);
  const data=controlObject(value,['expectedRevision','reason','homepageArtwork','notice','maintenance','submissionsOpen','claimsOpen','updatesOpen']);
  const expected=controlRevision(data.expectedRevision),reason=controlReason(data.reason);
  const {expectedRevision:_,reason:__,...fields}=data;
  const input=validateSiteSettings(fields),before=await siteSettings(db);
  if(before.revision!==expected)throw new InputError('The site settings changed. Reload them before saving.',409);
  if(fields.homepageArtwork===undefined)input.homepageArtwork=before.homepageArtwork;
  if(input.homepageArtwork!==before.homepageArtwork && input.homepageArtwork.startsWith(artworkPrefix)){
    const file=input.homepageArtwork.slice(artworkPrefix.length);
    if(!await runtime().BUCKET?.head('homepage-art/'+file))throw new InputError('Upload this homepage image before saving.');
  }
  const role=controlActorGuard(actor),now=Date.now();
  const guard={sql:`(${role.sql}) AND COALESCE((SELECT revision FROM control_settings WHERE id='site'),0)=?`,args:[...role.args,expected]};
  const results=await db.batch([
    auditInsert(db,actor,{action:'settings.update',entityType:'settings',entityId:'site',reason,before:{...publicSiteSettings(before),homepageArtwork:before.homepageArtwork},after:input,now},guard),
    db.prepare(`INSERT INTO control_settings(id,payload_json,revision,updated_at,updated_by)
      SELECT 'site',?,?,?,? WHERE ${guard.sql}
      ON CONFLICT(id) DO UPDATE SET payload_json=excluded.payload_json,revision=excluded.revision,updated_at=excluded.updated_at,updated_by=excluded.updated_by
      WHERE control_settings.revision=?`).bind(JSON.stringify(input),expected+1,now,actor.userId,...guard.args,expected),
  ]);
  if(results[0]?.meta.changes!==1||results[1]?.meta.changes!==1)throw new InputError('The site settings or your access changed. Reload before saving.',409);
  return {...input,revision:expected+1,updatedAt:now};
}
export async function requireCommunityIntake(db:D1Database,kind:'submissions'|'claims'|'updates'){
  const settings=await siteSettings(db),key=({submissions:'submissionsOpen',claims:'claimsOpen',updates:'updatesOpen'} as const)[kind];
  if(settings.maintenance.enabled)throw new InputError(settings.maintenance.message,503);
  if(!settings[key])throw new InputError(`RMT has temporarily paused new ${kind==='updates'?'project update submissions':kind==='claims'?'ownership claims':'project applications'}. Your saved work is still here.`,503);
}
