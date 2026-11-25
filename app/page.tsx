import Hub from '@/components/Hub';
import {catalog} from '@/lib/server/repository';
import {database} from '@/lib/server/runtime';
import {siteSettings} from '@/lib/server/control-settings';
import {publicSiteSettings} from '@/lib/control-settings';

export const dynamic='force-dynamic';
import {flagship,homepageMetadata} from '@/lib/homepage-art';
export async function generateMetadata(){
  try{return homepageMetadata((await siteSettings(database())).homepageArtwork);}
  catch{return homepageMetadata(flagship);}
}
export default async function Home() {
  try{
    const db=database(),settings=await siteSettings(db);
    const directory=settings.maintenance.enabled?{projects:[],categories:[]}:await catalog(db);
    return <Hub initialProjects={directory.projects} initialCategories={directory.categories} initialSiteSettings={publicSiteSettings(settings)} />;
  }catch{return <Hub initialProjects={[]} initialCatalogError />;}
}
