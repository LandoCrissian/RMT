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
  const title='RMT — One chain. Endless possibilities.';
  const description='Discover the Robinhood Chain ecosystem.';
  const url='https://rmtlaunch.fun/';
  const image={url:new URL(homepageArtwork(path),url).href,width:1200,height:630,
    type:path.endsWith('.png')?'image/png':'image/jpeg',alt:path===flagship?'RMT in electric lime. One chain. Endless possibilities.':'RMT homepage share artwork'};
  return {title,description,alternates:{canonical:url},openGraph:{type:'website',siteName:'RMT',title,description,url,images:[image]},
    twitter:{card:'summary_large_image',title,description,images:[image]}};
}
