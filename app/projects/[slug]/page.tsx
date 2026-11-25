import { cache } from 'react';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import Hub from '@/components/Hub';
import { projectMetadata } from '@/lib/project-sharing';
import { projectShowcase } from '@/lib/server/project-showcase';
import { database } from '@/lib/server/runtime';

export const dynamic = 'force-dynamic';

// React's request-scoped cache shares the public lookup between metadata and the
// page render. There is no persistent cache that could preserve a suspended listing.
const loadShowcase = cache((slug: string) => projectShowcase(database(), slug));
type Props = {params: Promise<{slug: string}>};

export async function generateMetadata({params}: Props): Promise<Metadata> {
  const {slug} = await params;
  const showcase = await loadShowcase(slug);
  if (!showcase) return {title: 'Project unavailable | RMT', robots: {index: false, follow: false}};
  return projectMetadata(showcase.project);
}

export default async function ProjectPage({params}: Props) {
  const {slug} = await params;
  const showcase = await loadShowcase(slug);
  if (!showcase) notFound();
  return <Hub initialProjectId={showcase.project.id} initialProjects={showcase.projects} initialCategories={showcase.categories} />;
}
