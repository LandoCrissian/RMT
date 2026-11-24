export type StudioSession = {
  authenticated: boolean; emailVerified?: boolean; provider?: string | null;
  userId: string | null;
  displayName: string | null;
  email?: string | null;
  signInMethod?: 'google' | 'email' | 'chatgpt' | 'firebase' | null;
  isAdmin: boolean;
  controlRole?: 'owner'|'admin'|'moderator'|'member'|null;
  controlCapabilities?: import('@/lib/control').ControlCapability[];
  suspended?: boolean;
};

export type StudioProps = {
  session: StudioSession;
  onToast: (text: string) => void;
};

export type ProjectStage = "starting" | "building" | "beta" | "live";

export type Submission = {
  id: string;
  name: string;
  summary: string;
  category: "Games" | "Music" | "Tools" | "Community";
  stage?: ProjectStage;
  website: string;
  launchUrl: string;
  xProfile: string;
  contactEmail?: string | null;
  ownershipEvidence: string;
  verificationCode: string;
  status: string;
  revision: number;
  createdAt: string | number;
  updatedAt?: string | number;
  reviewNote?: string | null;
  reviewerNote?: string | null;
};

export type ClaimMethod = "website" | "x" | "opensea";
export type ProjectClaim = {
  id: string;
  projectId: string;
  projectName: string;
  method: ClaimMethod;
  officialChannelUrl: string;
  verificationCode: string;
  proofUrl: string;
  note: string;
  status: "draft" | "pending" | "approved" | "rejected" | "revoked" | "expired";
  expiresAt: number;
  revision: number;
  createdAt: number;
  updatedAt: number;
  reviewNote: string;
  userId?: string;
  accountEmail?: string;
};

export type ClaimOption = {
  method: ClaimMethod;
  channelUrl: string;
  instructions: string;
};

export function statusLabel(status: string) {
  return ({ pending: "In review", needs_changes: "Changes requested", changes_requested: "Changes requested", approved: "Published", rejected: "Not approved", suspended: "Suspended", draft: "Proof needed", revoked: "Access removed", expired: "Expired" } as Record<string, string>)[status] ?? "In review";
}

export function claimStatusLabel(status: string) {
  return status === "approved" ? "Ownership confirmed" : statusLabel(status);
}

export function stageLabel(stage?: string) {
  return ({ starting: "Starting out", building: "In development", beta: "Beta", live: "Live" } as Record<string, string>)[stage ?? "building"] ?? "In development";
}

export function formattedDate(value: string | number) {
  const date = new Date(typeof value === "number" && value < 1e12 ? value * 1000 : value);
  return Number.isNaN(date.getTime()) ? "Recently" : date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function safeHttpsLink(value: string | null | undefined) {
  if (!value) return null;
  try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password ? url.href : null; } catch { return null; }
}

export async function readApiResponse(response: Response): Promise<Record<string, unknown>> {
  let data: Record<string, unknown>;
  try { data = await response.json(); } catch { throw new Error("We couldn’t reach RMT. Please try again in a moment."); }
  if (!response.ok) {
    const details = data.error;
    const message = typeof details === "string" ? details : details && typeof details === "object" && "message" in details ? String(details.message) : typeof data.message === "string" ? data.message : "Something went wrong. Please try again.";
    throw new Error(message);
  }
  return data;
}
