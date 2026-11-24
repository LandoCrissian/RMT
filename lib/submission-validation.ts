export const categories = ["Games", "Music", "Tools", "Community"] as const;
export type Category = (typeof categories)[number];
export type SubmissionInput = {
  name: string;
  summary: string;
  category: Category;
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
  "contactEmail", "ownershipEvidence", "companyFax",
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
  return new URL(url).hostname.toLowerCase().replace(/\.$/, "").replace(/^www\./, "");
}

function field(input: Record<string, unknown>, key: string, min: number, max: number, label: string): string {
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
  const website = publicHttpsUrl(input.website, "Official website");
  const launchUrl = publicHttpsUrl(input.launchUrl, "Launch link");
  const profile = new URL(publicHttpsUrl(input.xProfile, "X profile"));
  const handle = profile.pathname.match(/^\/([A-Za-z0-9_]{1,15})\/?$/)?.[1];
  if (!["x.com", "www.x.com", "twitter.com", "www.twitter.com"].includes(profile.hostname) || !handle ||
      ["home", "search", "explore", "settings", "messages", "notifications", "intent", "i"].includes(handle.toLowerCase())) {
    throw new InputError("Use the project's X profile, for example https://x.com/yourproject.");
  }
  const xProfile = `https://x.com/${handle}`;
  const contactEmail = input.contactEmail === undefined || input.contactEmail === "" ? "" : field(input, "contactEmail", 3, 254, "Contact email");
  if (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) throw new InputError("Enter a valid contact email.");
  const ownershipEvidence = field(input, "ownershipEvidence", 20, 1000, "Ownership evidence");
  return {name, summary, category: input.category as Category, website, launchUrl, xProfile, contactEmail,
    ownershipEvidence, normalizedHost: normalizeHost(website), normalizedName: normalizeName(name)};
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
