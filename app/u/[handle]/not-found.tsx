import {ArrowLeft, UserRound} from 'lucide-react';
import '@/components/community-profiles.css';

export default function ProfileNotFound() {
  return <main className="member-page" style={{padding: 'clamp(22px, 6vw, 70px) 22px'}}><a href="/" className="brand" aria-label="RMT home"><img className="brand-icon" src="/icons/rmt-mark-v5.png" alt="" width="37" height="37" /><span className="brand-word">RMT<span className="brand-dot">.</span></span></a><section className="member-state"><UserRound size={30} /><h1>This profile isn’t available.</h1><p>The member may have made it private, or this link may be out of date.</p><a className="button button-outline" href="/"><ArrowLeft size={15} /> Explore RMT</a></section></main>;
}
