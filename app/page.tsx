import Hub from '@/components/Hub';
import {catalog} from '@/lib/server/repository';
import {database} from '@/lib/server/runtime';
import {siteSettings} from '@/lib/server/control-settings';
import {publicSiteSettings} from '@/lib/control-settings';

export const dynamic='force-dynamic';
export default async function Home() {
  try{
    const db=database(),settings=await siteSettings(db);
    const projects=settings.maintenance.enabled?[]:(await catalog(db)).projects;
    return <Hub initialProjects={projects} initialSiteSettings={publicSiteSettings(settings)} />;
  }catch{return <Hub initialProjects={[]} initialCatalogError />;}
}
