import { ArrowUpRight, CalendarDays, Megaphone, Rocket, Wrench } from "lucide-react";
import type { UpdateContent, UpdateStatus } from "@/lib/project-updates";
import { safeHttpsLink } from "./studio-shared";

export const updateKindLabels = { announcement: "Announcement", progress: "Build update", release: "Release", event: "Event" } as const;
export const updateStatusLabels: Record<UpdateStatus, string> = { draft: "Private draft", pending: "In review", approved: "Published", rejected: "Changes needed", archived: "Archived" };

export function UpdateStatusBadge({ status }: { status: UpdateStatus }) {
  return <span className={`st-status st-status-${status} up-status`}>{updateStatusLabels[status]}</span>;
}

export default function ProjectUpdatePreview({ content, projectName, initials, caption = "Preview · visible after approval" }: {
  content: UpdateContent; projectName: string; initials?: string; caption?: string;
}) {
  const Icon = { announcement: Megaphone, progress: Wrench, release: Rocket, event: CalendarDays }[content.kind];
  const link = safeHttpsLink(content.linkUrl);
  return <article className="up-preview">
    <div className="up-preview-top"><span className="up-project-icon">{initials ?? projectName.slice(0, 2).toUpperCase()}</span><div><strong>{projectName}</strong><span>{caption}</span></div></div>
    <span className={`up-kind up-kind-${content.kind}`}><Icon size={13} />{updateKindLabels[content.kind]}</span>
    <h3 className={!content.title.trim() ? "up-placeholder" : ""}>{content.title.trim() || "Your next chapter, in your words."}</h3>
    <p className={`up-body${!content.body.trim() ? " up-placeholder" : ""}`}>{content.body.trim() || "Share what’s new, what you’re working on, or what people can explore next. Your update will appear here."}</p>
    {link && content.linkLabel.trim() && <a href={link} target="_blank" rel="noopener noreferrer" className="up-preview-link">{content.linkLabel}<ArrowUpRight size={15} /></a>}
  </article>;
}
