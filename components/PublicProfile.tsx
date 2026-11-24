'use client';

import {useState} from 'react';
import {ArrowRight, ArrowUpRight, BadgeCheck, Link as LinkIcon, UserRound} from 'lucide-react';
import type {PublicProfile as PublicProfileData, ProfileProject} from '@/lib/profiles';
import {projectPath} from '@/lib/project-sharing';
import './profiles.css';

function safeImage(value?: string) {
  if (!value) return '';
  if (/^\/(?!\/)/.test(value)) return value;
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? value : ''; } catch { return ''; }
}

function ProfileImage({src, alt, className = '', fallback}: {src?: string; alt: string; className?: string; fallback: React.ReactNode}) {
  const [failed, setFailed] = useState('');
  const image = safeImage(src);
  return <span className={className}>{image && failed !== image ? <img src={image} alt={alt} decoding="async" onError={() => setFailed(image)} /> : fallback}</span>;
}

function ProjectTile({project, preview}: {project: ProfileProject; preview: boolean}) {
  const content = <><ProfileImage src={project.logo || project.cover} alt="" className="profile-project-image" fallback={<span>{project.initials}</span>} /><span className="profile-project-copy"><small>{project.category}</small><strong>{project.name}</strong><span>{project.tagline}</span></span><ArrowRight size={17} /></>;
  return preview ? <div className="profile-project-tile">{content}</div> : <a className="profile-project-tile" href={projectPath(project)}>{content}</a>;
}

/** Presentation only. The caller decides whether a public profile is still available. */
export default function PublicProfile({profile, preview = false}: {profile: PublicProfileData; preview?: boolean}) {
  const name = profile.displayName.trim() || 'Your display name';
  const initials = profile.displayName.trim().split(/\s+/).map(part => Array.from(part)[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
  const builder = profile.isBuilder && profile.managedProjects.length > 0;
  return <article className={'rmt-profile' + (preview ? ' profile-is-preview' : '')} aria-label={preview ? 'Your profile preview' : `${name} on RMT`}>
    <div className="profile-cover"><ProfileImage src={profile.banner?.url} alt={profile.banner ? `${name}’s profile banner` : ''} className="profile-cover-image" fallback={<span className="profile-cover-pattern" aria-hidden="true"><i /><i /><i /></span>} /><span className="profile-cover-wordmark" aria-hidden="true">RMT<span>●</span></span></div>
    <div className="profile-main">
      <div className="profile-identity-row"><ProfileImage src={profile.avatar?.url} alt={profile.avatar ? `${name}’s avatar` : ''} className="profile-avatar" fallback={initials ? <span>{initials}</span> : <UserRound size={32} />} />{builder && <span className="profile-builder"><BadgeCheck size={15} /> Confirmed builder</span>}</div>
      <div className="profile-name-block">{preview ? <h3>{name}</h3> : <h1>{name}</h1>}<p className="profile-handle">@{profile.handle || 'your-handle'}</p></div>
      {profile.bio ? <p className="profile-bio">{profile.bio}</p> : preview ? <p className="profile-bio profile-placeholder">A few words about you, your interests, or what you’re working on.</p> : null}
      {profile.links.length > 0 && <div className="profile-links" aria-label="Profile links">{profile.links.map((link, index) => {
        let domain = ''; let href = '';
        try { const url = new URL(link.url); if (url.protocol === 'https:' && !url.username && !url.password) { domain = url.hostname.replace(/^www\./, ''); href = url.href; } } catch {}
        if (!preview && !href) return null;
        const content = <><LinkIcon size={15} /><span><strong>{link.label || 'Link label'}</strong><small>{domain || 'Your website'}</small></span><ArrowUpRight size={15} /></>;
        return preview ? <span className="profile-link" key={index}>{content}</span> : <a className="profile-link" href={href} key={index} target="_blank" rel="noopener noreferrer">{content}<span className="sr-only"> (opens in a new tab)</span></a>;
      })}</div>}
    </div>
    {profile.managedProjects.length > 0 && <section className="profile-projects" aria-label="Managed projects"><header><div><span className="profile-eyebrow">FROM THIS BUILDER</span><h2>Building on RMT.</h2></div><span className="profile-project-count">{profile.managedProjects.length} {profile.managedProjects.length === 1 ? 'project' : 'projects'}</span></header><div className="profile-project-list">{profile.managedProjects.map(project => <ProjectTile key={project.id} project={project} preview={preview} />)}</div></section>}
  </article>;
}
