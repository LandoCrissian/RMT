import type {Metadata} from 'next';
import {RMT_PUBLIC_ORIGIN} from '@/lib/project-sharing';
import {getDiscoveryConfig} from '@/lib/server/discovery-config';
import {database} from '@/lib/server/runtime';

export const dynamic = 'force-dynamic';
const title = 'Robinhood Chain Beginner Guide | RMT';
const description = 'Learn how to explore Robinhood Chain apps, games and NFT projects with RMT, the independent community directory.';
const url = RMT_PUBLIC_ORIGIN + '/guide';
export const metadata: Metadata = {
  title, description, alternates: {canonical: url},
  openGraph: {type: 'website', siteName: 'RMT', title, description, url, images: ['/social/home-flagship-v1.jpg']},
  twitter: {card: 'summary_large_image', title, description, images: ['/social/home-flagship-v1.jpg']},
};

export default async function GuidePage() {
  const {lessons} = await getDiscoveryConfig(database());
  return <main className="public-guide">
    <a href="/" className="showcase-back">← Explore RMT</a>
    <p className="eyebrow">Start here</p>
    <h1>Robinhood Chain beginner guide</h1>
    <p>RMT is an independent project directory, not a Robinhood product. You can explore the directory without a wallet or an account.</p>
    <ol>{lessons.map((lesson, index) => <li key={index}><h2>{lesson.title}</h2><p>{lesson.body}</p></li>)}</ol>
    <a className="button button-lime" href="/">Browse the project directory</a>
    <a className="public-guide-calendar" href="/calendar">See the ecosystem calendar</a>
  </main>;
}
