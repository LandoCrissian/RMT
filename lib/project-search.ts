import { projectMatchesCategory, type Project } from './catalog';

export function normalizeProjectQuery(value: string): string {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

export function projectMatchesSearch(project: Project, query: string): boolean {
  const terms = normalizeProjectQuery(query).split(' ').filter(Boolean);
  if (!terms.length) return true;

  const normalizedName = normalizeProjectQuery(project.name);
  // Search aliases come from the published name, identifier, and initials.
  // No additional project claims or unverified nicknames are introduced.
  const nameAliases = [normalizedName.replace(/ /g, ''), normalizedName.split(' ').map(word => word[0]).join('')];
  const fields = [
    project.name, project.id, project.slug, project.initials, ...nameAliases,
    project.tagline, project.description, project.category, project.website, project.launchUrl, project.launchLabel,
    ...project.links.flatMap(link => [link.label, link.type, link.url]),
    ...(project.collections ?? []).flatMap(collection => [collection.name, collection.url, collection.chain, collection.relationship]),
  ];
  const searchable = normalizeProjectQuery(fields.filter(value => typeof value === 'string').join(' '));
  return terms.every(term => searchable.includes(term));
}

export function searchProjects(projects: readonly Project[], { query = '', category = 'All projects', savedIds }: {
  query?: string;
  category?: string;
  savedIds?: readonly string[];
} = {}): Project[] {
  return projects.filter(project =>
    (savedIds === undefined || savedIds.includes(project.id)) &&
    projectMatchesCategory(project, category) &&
    projectMatchesSearch(project, query)
  );
}
