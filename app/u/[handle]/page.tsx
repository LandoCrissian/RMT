import {cache} from 'react';
import {notFound} from 'next/navigation';
import type {Metadata} from 'next';
import Hub from '@/components/Hub';
import {publicProfile} from '@/lib/server/profiles';
import {database} from '@/lib/server/runtime';
import {InputError} from '@/lib/submission-validation';
import {catalog} from '@/lib/server/repository';

export const dynamic = 'force-dynamic';
type Props = {params: Promise<{handle: string}>};
// Request-scoped only. Hidden profiles never survive a later request in a cache.
const loadProfile = cache(async (handle: string) => {
  try {return await publicProfile(database(), handle);}
  catch (error) {if (error instanceof InputError && error.status === 404) return null; throw error;}
});

export async function generateMetadata({params}: Props): Promise<Metadata> {
  const {handle} = await params;
  const profile = await loadProfile(handle);
  if (!profile) return {title: 'Profile unavailable | RMT', robots: {index: false, follow: false}};
  const title = profile.displayName + ' (@' + profile.handle + ') | RMT';
  const description = profile.bio || 'Meet ' + profile.displayName + ' on RMT.';
  const url = 'https://rmtlaunch.fun/u/' + encodeURIComponent(profile.handle);
  return {title, description, alternates: {canonical: url}, robots: {index: false, follow: true},
    openGraph: {title, description, url, type: 'profile', siteName: 'RMT', images: [{url: '/social/rmt-v1.jpg', width: 1200, height: 630}]},
    twitter: {card: 'summary_large_image', title, description, images: ['https://rmtlaunch.fun/social/rmt-v1.jpg']}};
}

export default async function MemberProfilePage({params}: Props) {
  const {handle} = await params;
  const profile = await loadProfile(handle);
  if (!profile) notFound();
  const {projects} = await catalog(database());
  return <Hub initialProfileHandle={profile.handle} initialPublicProfile={profile} initialProjects={projects} />;
}
