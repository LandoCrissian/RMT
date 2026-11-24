import { ArrowLeft, Compass, UserRound } from 'lucide-react';

export default function UnavailablePage({kind}: {kind: 'project' | 'profile'}) {
  const Icon = kind === 'project' ? Compass : UserRound;
  return <main className="unavailable-page">
    <section>
      <img src="/icons/rmt-mark-v5.png" alt="RMT" width="44" height="44" />
      <h1>This {kind} isn’t available.</h1>
      <p>{kind === 'project'
        ? 'The link may have changed, or the listing may no longer be in the directory.'
        : 'The member may have made it private, or this link may be out of date.'}</p>
      <a className="button button-lime" href="/"><ArrowLeft size={16} /> Explore RMT</a>
      <Icon className="unavailable-mark" size={96} aria-hidden="true" />
    </section>
  </main>;
}
