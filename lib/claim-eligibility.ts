import type {Project} from './catalog';
import {claimContract,type ClaimContract} from './claim-contracts';
import {publicHttpsUrl} from './submission-validation';

const explorer='https://robinhoodchain.blockscout.com';
const unsupportedProxy=new Set(['0x2cfc8d1a8cdd573cf80b613275efe4b19c091ef4','0x12a4c7659a4b7c4a2870b5167c4f8b014c7fa690']);
const sharedDomains=['twitter.com','x.com','t.me','discord.com','discord.gg','linktr.ee','opensea.io','github.com','gitlab.com','facebook.com','instagram.com','youtube.com','medium.com','notion.so','robinhood.com','blockscout.com','rmtlaunch.fun'];
export type Eligibility={status:'eligible'|'manual';reason:string;contract:ClaimContract|null};
export const manualEligibility=(reason:string):Eligibility=>({status:'manual',reason,contract:null});
type Candidate={host:string;address:string};
export function listingContractAddresses(project:Pick<Project,'links'>){
  const addresses=new Set<string>();
  for(const link of project.links){
    try{
      const u=new URL(link.url);
      const address=/^\/(?:token|address)\/(0x[0-9a-f]{40})\/?$/i.exec(u.pathname)?.[1];
      if(u.origin===explorer&&!u.username&&!u.password&&address)addresses.add(address.toLowerCase());
    }catch{/* Ignore non-contract destinations. */}
  }
  return addresses;
}
export function assessListing(project:Pick<Project,'id'|'website'|'links'>):Eligibility|Candidate {
  const addresses=listingContractAddresses(project);
  if(!addresses.size)return manualEligibility('The listing has no Robinhood Chain contract reference.');
  if(addresses.size!==1)return manualEligibility('Multiple contract references require a reviewer to identify the management contract.');
  const address=[...addresses][0];
  if(unsupportedProxy.has(address))return manualEligibility('This proxy authority model requires manual review.');
  let website:URL;
  try{website=new URL(publicHttpsUrl(project.website,'Official website'));}catch{return manualEligibility('The listing needs a verified project website.');}
  if(website.pathname!=='/'||website.search||website.hash||sharedDomains.some(s=>website.hostname===s||website.hostname.endsWith('.'+s)))
    return manualEligibility('Use an independently controlled project domain or submit manual evidence.');
  const pinned=claimContract(project.id);
  if(pinned){
    if(address!==pinned.address||website.origin!==new URL(pinned.source).origin||!project.links.some(l=>l.url===pinned.source))
      return manualEligibility('The listing no longer agrees with the reviewed contract and its source.');
    return {status:'eligible',reason:'The project publication, collection contract and reviewed owner authority agree.',contract:pinned};
  }
  if(address===claimContract('bored-traders')?.address)return manualEligibility('This address is independently bound to a different project.');
  return {host:website.hostname,address};
}
