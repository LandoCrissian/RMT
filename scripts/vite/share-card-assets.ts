import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import type {Plugin} from 'vite';
import {seedProjects} from '../../lib/catalog';
import experiences from '../../lib/experience-artwork.json';

// Convert reviewed local images at build time. The Worker uses only bundled
// JPEGs or approved bucket uploads, without a remote image proxy.
export function shareCardAssets():Plugin {
  const id='virtual:rmt-share-art';
  return {
    name:'rmt-share-card-assets',
    resolveId(source) { if(source===id) return '\0'+id; },
    async load(source) {
      if(source!=='\0'+id) return;
      const sharp=(await import('sharp')).default;
      const paths=new Set([...seedProjects.flatMap(project=>[project.cover,project.logo]),...experiences.map(item=>item.image)]);
      const art:Record<string,string>={};
      for(const path of paths) {
        if(!path?.startsWith('/')) continue;
        const file=resolve('public','.'+path);
        this.addWatchFile(file);
        const image=await sharp(file).resize({width:680,height:445,fit:'inside',withoutEnlargement:true}).flatten({background:'#151715'}).jpeg({quality:68,mozjpeg:true}).toBuffer();
        art[path]='data:image/jpeg;base64,'+image.toString('base64');
      }
      const designs:Record<string,string>={};
      for(const slug of ['moneymomos','wif-outlaws','bored-traders']) {
        const file=resolve('lib/server/share-card-images',slug+'.jpg');
        this.addWatchFile(file);
        designs[slug]=(await readFile(file)).toString('base64');
      }
      return 'export const art='+JSON.stringify(art)+';export const designs='+JSON.stringify(designs)+';';
    },
  };
}
