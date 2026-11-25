import { catalog } from './repository';

/** All share surfaces consume the same approved-only, public field projection. */
export async function projectShowcase(db: D1Database, slug: string) {
  const {projects, categories} = await catalog(db);
  const project = projects.find(item => item.slug === slug);
  return project ? {project, projects, categories} : null;
}
