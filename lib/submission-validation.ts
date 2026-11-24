export const categories = ["Games", "Music", "Tools", "Community"] as const;
export type Category = (typeof categories)[number];
export const projectStages = ["starting", "building", "live"] as const;
export type ProjectStage = (typeof projectStages)[number];
export type SubmissionInput = {
  name: string;
  summary: string;
  category: Category;
  stage: ProjectStage;
  website: string;
  launchUrl: string;
  xProfile: string;
  contactEmail: string;
  ownershipEvidence: string;
  normalizedHost: string;
  normalizedName: string;
};

export class InputError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "InputError";
    this.status = status;
  }
}

const allowedFields = new Set([
  "name", "summary", "category", "website", "launchUrl", "xProfile",
  "contactEmail", "ownershipEvidence", "companyFax", "stage",
]);
const disallowedHosts = new Set(["localhost", "local", "internal", "example.com", "example.org", "example.net"]);

export function normalizeName(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ").toLocaleLowerCase("en-US");
}

/** Syntax checks only. These do not establish ownership, safety, or availability. */
export function publicHttpsUrl(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length > 2048 || !value.trim()) {
    throw new InputError(`${label} must be a public HTTPS URL.`);
  }
  let url: URL;
  try { url = new URL(value.trim()); }
  catch { throw new InputError(`${label} must be a valid HTTPS URL.`); }
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  // No direct IP literals, intranet names, userinfo, or alternative ports.
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443") ||
      !host.includes(".") || host.includes(":") || host.startsWith("[") ||
      /^\d+(?:\.\d+){3}$/.test(host) || disallowedHosts.has(host) ||
      /\.(?:localhost|local|internal|test|invalid|example|onion)$/.test(host)) {
    throw new InputError(`${label} must use a public HTTPS website without credentials or a custom port.`);
  }
  url.hostname = host;
  return url.toString();
}

export function normalizeHost(url: string): string {
  if (!url) return "";
  return new URL(url).hostname.toLowerCase().replace(/\.$/, "").replace(/^www\./, "");
}

export function optionalHttpsUrl(value: unknown, label: string): string {
  if (value === undefined || value === "") return "";
  return publicHttpsUrl(value, label);
}

export function optionalXProfile(value: unknown): string {
  if (value === undefined || value === "") return "";
  const profile = new URL(publicHttpsUrl(value, "X profile"));
  const handle = profile.pathname.match(/^\/([A-Za-z0-9_]{1,15})\/?$/)?.[1];
  if (!["x.com", "www.x.com", "twitter.com", "www.twitter.com"].includes(profile.hostname) || !handle ||
      ["home", "search", "explore", "settings", "messages", "notifications", "intent", "i"].includes(handle.toLowerCase())) {
    throw new InputError("Use the project's X profile, for example https://x.com/yourproject.");
  }
  return `https://x.com/${handle}`;
}

/** Collection/profile paths represent separate projects on shared platforms. */
export function projectIdentityKey(website: string, xProfile = ""): string {
  const destination = website || xProfile;
  if (!destination) return "";
  const url = new URL(destination);
  const host = normalizeHost(destination);
  if (host === "opensea.io") {
    const slug = url.pathname.match(/^\/collection\/([^/]+)(?:\/|$)/i)?.[1];
    return slug ? `opensea.io/collection/${slug.toLowerCase()}` : `opensea.io${url.pathname.replace(/\/+$/, "").toLowerCase()}`;
  }
  if (["x.com", "twitter.com"].includes(host)) return `x.com${url.pathname.replace(/\/+$/, "").toLowerCase()}`;
  if (["linktr.ee", "instagram.com", "github.com"].includes(host)) return `${host}${url.pathname.replace(/\/+$/, "").toLowerCase()}`;
  return host;
}

export function field(input: Record<string, unknown>, key: string, min: number, max: number, label: string): string {
  const value = input[key];
  if (typeof value !== "string") throw new InputError(`${label} is required.`);
  const clean = value.normalize("NFKC").trim();
  if (clean.length < min || clean.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(clean)) {
    throw new InputError(`${label} must be ${min}–${max} characters.`);
  }
  return clean;
}

export function validateSubmission(value: unknown): SubmissionInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new InputError("Send a valid application.");
  const input = value as Record<string, unknown>;
  for (const key of Object.keys(input)) {
    if (!allowedFields.has(key)) throw new InputError(`Unsupported application field: ${key}.`);
  }
  if (input.companyFax !== undefined && input.companyFax !== "") throw new InputError("This application could not be accepted.");
  const name = field(input, "name", 3, 70, "Project name");
  const summary = field(input, "summary", 30, 280, "Description");
  if (!categories.includes(input.category as Category)) throw new InputError("Choose a supported category.");
  const website = optionalHttpsUrl(input.website, "Official website");
  const xProfile = optionalXProfile(input.xProfile);
  if (!website && !xProfile) throw new InputError("Provide an official website or X profile so reviewers can identify your project.");
  const launchUrl = optionalHttpsUrl(input.launchUrl, "Launch link") || website || xProfile;
  const stage = input.stage === undefined ? "building" : input.stage;
  if (!projectStages.includes(stage as ProjectStage)) throw new InputError("Choose a valid development stage.");
  const contactEmail = input.contactEmail === undefined || input.contactEmail === "" ? "" : field(input, "contactEmail", 3, 254, "Contact email");
  if (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) throw new InputError("Enter a valid contact email.");
  const ownershipEvidence = field(input, "ownershipEvidence", 20, 1000, "Ownership evidence");
  return {name, summary, category: input.category as Category, stage: stage as ProjectStage, website, launchUrl, xProfile, contactEmail,
    ownershipEvidence, normalizedHost: projectIdentityKey(website, xProfile), normalizedName: normalizeName(name)};
}

export const decisionActions = ["approve", "reject", "request_changes", "suspend"] as const;
export type DecisionAction = (typeof decisionActions)[number];
export type DecisionInput = {action: DecisionAction; note: string; expectedRevision: number};
export function validateDecision(value: unknown): DecisionInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new InputError("Send a valid review decision.");
  const input = value as Record<string, unknown>;
  const permitted = new Set(["action", "note", "confirmedOwnership", "checkedLinks", "expectedRevision"]);
  if (Object.keys(input).some(key => !permitted.has(key))) throw new InputError("Unsupported review field.");
  if (!decisionActions.includes(input.action as DecisionAction)) throw new InputError("Choose a valid review action.");
  const note = field(input, "note", 5, 1000, "Review note");
  if (!Number.isSafeInteger(input.expectedRevision) || (input.expectedRevision as number) < 1) throw new InputError("Refresh the queue before reviewing this application.", 409);
  if (input.action === "approve" && (input.confirmedOwnership !== true || input.checkedLinks !== true)) {
    throw new InputError("Confirm project ownership and check all links before approving.");
  }
  return {action: input.action as DecisionAction, note, expectedRevision: input.expectedRevision as number};
}

export type ProjectLink = {label: string; url: string; type?: string};
export type ProjectEditInput = {
  projectId: string; baseRevision: number; summary: string; category: Category; stage: ProjectStage;
  website: string; launchUrl: string; xProfile: string; links: ProjectLink[];
};
function objectFields(value: unknown, fields: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new InputError('Send a valid request.');
  const result = value as Record<string, unknown>;
  const allowed = new Set(fields);
  if (Object.keys(result).some(key => !allowed.has(key))) throw new InputError('Unsupported request field.');
  return result;
}
export function expectedRevision(value: unknown, allowZero = false): number {
  if (!Number.isSafeInteger(value) || (value as number) < (allowZero ? 0 : 1)) throw new InputError('Refresh this record before making changes.', 409);
  return value as number;
}
export function validateProjectEdit(value: unknown): ProjectEditInput {
  const input = objectFields(value, ['projectId','baseRevision','summary','category','stage','website','launchUrl','xProfile','links']);
  const projectId = field(input, 'projectId', 1, 120, 'Project');
  const baseRevision = expectedRevision(input.baseRevision, true);
  const summary = field(input, 'summary', 30, 280, 'Description');
  if (!categories.includes(input.category as Category)) throw new InputError('Choose a supported category.');
  if (!projectStages.includes(input.stage as ProjectStage)) throw new InputError('Choose a valid development stage.');
  const website = optionalHttpsUrl(input.website, 'Official website');
  const xProfile = optionalXProfile(input.xProfile);
  // Existing collection-only projects are checked against curated server data in createProjectEdit.
  const launchUrl = optionalHttpsUrl(input.launchUrl, 'Launch link') || website || xProfile;
  if (!Array.isArray(input.links) || input.links.length > 12) throw new InputError('Use up to 12 destination links.');
  const links: ProjectLink[] = input.links.map((value, index) => {
    const link = objectFields(value, ['label','url','type']);
    const label = field(link, 'label', 1, 50, `Link ${index+1} label`);
    const url = publicHttpsUrl(link.url, `Link ${index+1}`);
    const type = link.type === undefined || link.type === '' ? undefined : field(link, 'type', 1, 40, 'Link type');
    return {label,url,...(type ? {type} : {})};
  });
  return {projectId, baseRevision, summary, category: input.category as Category, stage: input.stage as ProjectStage, website, launchUrl, xProfile, links};
}
export type ClaimMethod = 'website'|'x'|'opensea';
export function validateClaimDraft(value: unknown): {projectId:string;method:ClaimMethod} {
  const input = objectFields(value, ['projectId','method']);
  const projectId = field(input, 'projectId', 1, 120, 'Project');
  if (!['website','x','opensea'].includes(input.method as string)) throw new InputError('Choose an available ownership channel.');
  return {projectId, method: input.method as ClaimMethod};
}
export function validateClaimProof(value: unknown): {proofUrl:string;note:string;expectedRevision:number} {
  const input = objectFields(value, ['proofUrl','note','expectedRevision']);
  return {proofUrl:publicHttpsUrl(input.proofUrl,'Proof link'), note:input.note === undefined || input.note === '' ? '' : field(input,'note',1,1000,'Note'), expectedRevision:expectedRevision(input.expectedRevision)};
}
export function validateClaimDecision(value: unknown): {action:'approve'|'reject'|'revoke';note:string;expectedRevision:number} {
  const input = objectFields(value,['action','note','expectedRevision','confirmedOwnership']);
  if (!['approve','reject','revoke'].includes(input.action as string)) throw new InputError('Choose a valid claim decision.');
  if (input.action === 'approve' && input.confirmedOwnership !== true) throw new InputError('Manually verify the challenge on the official channel before approving.');
  return {action:input.action as 'approve'|'reject'|'revoke',note:field(input,'note',5,1000,'Review note'),expectedRevision:expectedRevision(input.expectedRevision)};
}
export function validateEditDecision(value: unknown): {action:'approve'|'reject';note:string;expectedRevision:number} {
  const input = objectFields(value,['action','note','expectedRevision','checkedLinks']);
  if (!['approve','reject'].includes(input.action as string)) throw new InputError('Choose a valid edit decision.');
  if (input.action === 'approve' && input.checkedLinks !== true) throw new InputError('Check the proposed links before approving.');
  return {action:input.action as 'approve'|'reject',note:field(input,'note',5,1000,'Review note'),expectedRevision:expectedRevision(input.expectedRevision)};
}
