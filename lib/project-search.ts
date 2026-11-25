import { projectMatchesCategory, type Project } from './catalog';

import {legacyPrimary} from './taxonomy';

const legacyCategoryForId: Record<string, string> = Object.fromEntries(Object.entries(legacyPrimary).map(([name,id]) => [id,name]));

export function projectCategoryLabels(project: Project): string[] {
  const assignment = project.classification;
  if (!assignment) return [project.category];
  return [assignment.primary, ...assignment.secondary].map(id => assignment.labels[id]).filter(Boolean);
}

export function matchesDirectoryCategory(project: Project, id: string): boolean {
  const assignment = project.classification;
  if (assignment) return assignment.primary === id || assignment.secondary.includes(id);
  return projectMatchesCategory(project, legacyCategoryForId[id] ?? id);
}

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
    project.tagline, project.description, ...projectCategoryLabels(project), project.website, project.launchUrl, project.launchLabel,
    ...project.links.flatMap(link => [link.label, link.type, link.url]),
    ...(project.collections ?? []).flatMap(collection => [collection.name, collection.url, collection.chain, collection.relationship]),
  ];
  const searchable = normalizeProjectQuery(fields.filter(value => typeof value === 'string').join(' '));
  return terms.every(term => searchable.includes(term));
}

export function searchProjects(projects: readonly Project[], { query = '', category = 'All projects', categories = [], savedIds }: {
  query?: string;
  category?: string;
  categories?: readonly string[];
  savedIds?: readonly string[];
} = {}): Project[] {
  return projects.filter(project =>
    (savedIds === undefined || savedIds.includes(project.id)) &&
    projectMatchesCategory(project, category) &&
    (!categories.length || categories.some(id => matchesDirectoryCategory(project, id))) &&
    projectMatchesSearch(project, query)
  );
}
