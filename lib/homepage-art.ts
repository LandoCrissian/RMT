import type {Metadata} from 'next';
import {InputError} from './submission-validation';

export const flagship = '/social/home-flagship-v1.jpg';
export const classic = '/social/rmt-v1.jpg';
export const artworkPrefix = '/media/homepage-art/';
export function homepageArtwork(value:unknown):string {
  if (value === undefined || value === flagship) return flagship;
  if (value === classic || (typeof value === 'string' && /^\/media\/homepage-art\/[a-f0-9]{64}\.png$/.test(value))) return value;
  throw new InputError('Choose an RMT homepage image or upload a new one.');
}
export function homepageMetadata(path:string):Metadata {
  const title='RMT — Robinhood Chain Projects, Games & Apps';
  const description='Explore the independent directory of Robinhood Chain games, apps, NFT projects and community tools. Browse without an account or wallet.';
  const url='https://rmtlaunch.fun/';
  const image={url:new URL(homepageArtwork(path),url).href,width:1200,height:630,
    type:path.endsWith('.png')?'image/png':'image/jpeg',alt:path===flagship?'RMT in electric lime. One chain. Endless possibilities.':'RMT homepage share artwork'};
  return {title,description,alternates:{canonical:url},openGraph:{type:'website',siteName:'RMT',title,description,url,images:[image]},
    verification:{google:'IlZ_vFLirErj5H0OmqHsF3q7DkRm8m5G0YYJ5v7ktos'},
    twitter:{card:'summary_large_image',title,description,images:[image]}};
}
