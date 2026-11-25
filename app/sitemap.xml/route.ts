import {database} from '@/lib/server/runtime';
import {catalog} from '@/lib/server/repository';
import {availableSitemap} from '@/lib/server/public-sitemap';

export const dynamic = 'force-dynamic';

export async function GET() {
  return availableSitemap(() => catalog(database()));
}
